import {
  ChatCompletionResult,
  ChatRequestMessage,
  ChatToolDefinition,
  createChatCompletion,
} from '@/lib/llm';
import { AgentToolRegistry } from './registry';
import { DEFAULT_AGENT_TOOL_POLICY, isToolAllowed } from './policy';
import {
  AgentRunOptions,
  AgentRunResult,
  AgentToolCallInfo,
  AgentToolDefinition,
  AgentToolExecutionResult,
  AgentToolPolicy,
} from './types';

const DEFAULT_MAX_TOOL_ROUNDS = 6;
const DEFAULT_TOOL_TIMEOUT_MS = 120_000;
const DEFAULT_AGENT_SYSTEM_PROMPT =
  'You are an assistant with tool access. Call tools when external data is needed, then use tool results to answer. Prefer fs.search_files to locate files, fs.list_directory for structure overview, and fs.read_file for exact content. Keep answers concise and grounded in tool outputs.';

function toChatToolDefinition(definition: AgentToolDefinition): ChatToolDefinition {
  return {
    type: 'function',
    function: {
      name: definition.name,
      description: definition.description,
      parameters: definition.inputSchema,
    },
  };
}

function buildToolResultPayload(result: AgentToolExecutionResult): string {
  if (result.ok) {
    return JSON.stringify({
      ok: true,
      text: result.text,
      structured: result.structured ?? null,
      warnings: result.warnings ?? [],
    });
  }

  return JSON.stringify({
    ok: false,
    error: result.error,
    structured: result.structured ?? null,
    warnings: result.warnings ?? [],
  });
}

function parseToolArguments(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    throw new Error(`Invalid tool arguments JSON: ${trimmed}`);
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutErrorMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutErrorMessage));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function buildToolInfo(callId: string, name: string, argumentsRaw: string, argsParsed: unknown): AgentToolCallInfo {
  return {
    id: callId,
    name,
    argumentsRaw,
    argumentsParsed: argsParsed,
  };
}

function looksLikeToolSupportError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes('tool') ||
    message.includes('function call') ||
    message.includes('function_call') ||
    message.includes('tool_choice')
  );
}

function appendSystemPrompt(messages: ChatRequestMessage[], systemPrompt?: string): ChatRequestMessage[] {
  const hasSystem = messages.some((message) => message.role === 'system');
  if (hasSystem) return [...messages];

  return [
    {
      role: 'system',
      content: systemPrompt ?? DEFAULT_AGENT_SYSTEM_PROMPT,
    },
    ...messages,
  ];
}

async function executeToolCall(
  registry: AgentToolRegistry,
  toolPolicy: AgentToolPolicy,
  sessionId: string,
  callId: string,
  name: string,
  argumentsRaw: string,
  onStart?: (info: AgentToolCallInfo) => void
): Promise<{ info: AgentToolCallInfo; result: AgentToolExecutionResult }> {
  let parsedArgs: unknown;
  try {
    parsedArgs = parseToolArguments(argumentsRaw);
  } catch (error) {
    const info = buildToolInfo(callId, name, argumentsRaw, null);
    onStart?.(info);
    return {
      info,
      result: {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const info = buildToolInfo(callId, name, argumentsRaw, parsedArgs);
  onStart?.(info);

  if (!isToolAllowed(name, toolPolicy)) {
    return {
      info,
      result: {
        ok: false,
        error: `Tool "${name}" is blocked by tool policy.`,
      },
    };
  }

  const definition = registry.getDefinition(name);
  const handler = registry.getHandler(name);
  if (!definition || !handler) {
    return {
      info,
      result: {
        ok: false,
        error: `Tool "${name}" not found.`,
      },
    };
  }

  const timeoutMs = definition.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  try {
    const result = await withTimeout(
      handler(parsedArgs, { sessionId, callId }),
      timeoutMs,
      `Tool "${name}" timed out after ${timeoutMs}ms.`
    );
    return { info, result };
  } catch (error) {
    return {
      info,
      result: {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function toAssistantHistoryMessage(completion: ChatCompletionResult): ChatRequestMessage {
  return {
    role: 'assistant',
    content: completion.content || '',
    tool_calls: completion.rawAssistantMessage.tool_calls,
  };
}

export async function runAgentTurn(
  registry: AgentToolRegistry,
  options: AgentRunOptions
): Promise<AgentRunResult> {
  const callbacks = options.callbacks;
  const maxToolRounds = options.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  const toolPolicy = options.toolPolicy ?? DEFAULT_AGENT_TOOL_POLICY;
  const history: ChatRequestMessage[] = appendSystemPrompt(options.messages);

  let assistantContent = '';
  let assistantReasoning = '';
  let toolEnabled = true;

  for (let round = 0; round < maxToolRounds; round += 1) {
    const availableTools = toolEnabled
      ? registry
          .listDefinitions()
          .filter((tool) => isToolAllowed(tool.name, toolPolicy))
          .map(toChatToolDefinition)
      : [];

    let completion: ChatCompletionResult;
    try {
      completion = await createChatCompletion(history, options.config, {
        tools: availableTools,
        toolChoice: availableTools.length > 0 ? 'auto' : 'none',
      });
    } catch (error) {
      if (toolEnabled && availableTools.length > 0 && looksLikeToolSupportError(error)) {
        toolEnabled = false;
        callbacks?.onReasoningDelta?.('\nTool calling is unsupported by current provider, fallback to plain completion.\n');
        round -= 1;
        continue;
      }
      throw error;
    }

    if (completion.reasoning) {
      assistantReasoning += completion.reasoning;
      callbacks?.onReasoningDelta?.(completion.reasoning);
    }

    if (completion.toolCalls.length === 0) {
      assistantContent = completion.content ?? '';
      history.push({
        role: 'assistant',
        content: assistantContent,
      });
      if (assistantContent) {
        callbacks?.onAssistantDelta?.(assistantContent);
      }
      return {
        assistantContent,
        assistantReasoning,
        history,
      };
    }

    history.push(toAssistantHistoryMessage(completion));

    for (const call of completion.toolCalls) {
      const executed = await executeToolCall(
        registry,
        toolPolicy,
        options.sessionId,
        call.id,
        call.name,
        call.arguments,
        (info) => callbacks?.onToolStart?.(info)
      );
      callbacks?.onToolFinish?.(executed.info, executed.result);

      history.push({
        role: 'tool',
        tool_call_id: call.id,
        content: buildToolResultPayload(executed.result),
      });
    }
  }

  throw new Error(`Tool loop exceeded ${maxToolRounds} rounds.`);
}
