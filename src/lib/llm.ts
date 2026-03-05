import { AIProviderConfig } from "@/types/model";
import { fetch } from '@tauri-apps/plugin-http';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  reasoning?: string;
  attachments?: ChatMessageAttachment[];
  toolCalls?: ChatToolCallTrace[];
}

export interface ChatToolCallTrace {
  id: string;
  name: string;
  status: 'running' | 'success' | 'error';
  argumentsPreview?: string;
  resultPreview?: string;
  warnings?: string[];
  startedAt: number;
  finishedAt?: number;
  durationMs?: number;
}

export type ChatMessageContent = string | ChatContentPart[];

export interface ChatMessageAttachment {
  id: string;
  kind: 'image' | 'file_text';
  name: string;
  mime: string;
  size: number;
  previewUrl?: string;
}

export type ChatContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image_url';
      image_url: {
        url: string;
        detail?: 'auto' | 'low' | 'high';
      };
    };

export interface ChatRequestMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: ChatMessageContent;
  tool_call_id?: string;
  tool_calls?: ChatCompletionToolCallPayload[];
}

export interface ChatToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionToolCallPayload {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatCompletionResult {
  content: string;
  reasoning: string;
  toolCalls: ChatCompletionToolCall[];
  rawAssistantMessage: {
    role: 'assistant';
    content: string;
    tool_calls?: ChatCompletionToolCallPayload[];
  };
}

export interface ChatCompletionOptions {
  tools?: ChatToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
}

function normalizeAssistantContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (!part || typeof part !== 'object') return '';
      const text = (part as { text?: unknown }).text;
      return typeof text === 'string' ? text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function normalizeToolCalls(raw: unknown): ChatCompletionToolCall[] {
  if (!Array.isArray(raw)) return [];

  const normalized: ChatCompletionToolCall[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;

    const id = (item as { id?: unknown }).id;
    const fn = (item as { function?: unknown }).function;
    if (typeof id !== 'string' || !fn || typeof fn !== 'object') continue;

    const name = (fn as { name?: unknown }).name;
    const args = (fn as { arguments?: unknown }).arguments;
    if (typeof name !== 'string') continue;

    normalized.push({
      id,
      name,
      arguments: typeof args === 'string' ? args : '{}',
    });
  }

  return normalized;
}

function normalizeToolCallPayload(raw: unknown): ChatCompletionToolCallPayload[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const payload: ChatCompletionToolCallPayload[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = (item as { id?: unknown }).id;
    const fn = (item as { function?: unknown }).function;
    if (typeof id !== 'string' || !fn || typeof fn !== 'object') continue;

    const name = (fn as { name?: unknown }).name;
    const args = (fn as { arguments?: unknown }).arguments;
    if (typeof name !== 'string') continue;

    payload.push({
      id,
      type: 'function',
      function: {
        name,
        arguments: typeof args === 'string' ? args : '{}',
      },
    });
  }

  return payload.length > 0 ? payload : undefined;
}

export async function createChatCompletion(
  messages: ChatRequestMessage[],
  config: AIProviderConfig,
  options: ChatCompletionOptions = {}
): Promise<ChatCompletionResult> {
  if (!config.apiKey) {
    throw new Error("API Key not configured. Please go to Settings.");
  }

  const body: Record<string, unknown> = {
    model: config.modelId,
    messages,
    stream: false,
    temperature: options.temperature ?? config.temperature,
  };

  if (options.maxTokens !== undefined) {
    body.max_tokens = options.maxTokens;
  }
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? 'auto';
  } else if (options.toolChoice) {
    body.tool_choice = options.toolChoice;
  }

  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`API Error ${response.status}: ${responseText}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error("Invalid JSON response from chat completion API.");
  }

  const choice = (payload as { choices?: unknown[] })?.choices?.[0];
  if (!choice || typeof choice !== 'object') {
    throw new Error("Empty choices in chat completion response.");
  }

  const message = (choice as { message?: unknown }).message;
  if (!message || typeof message !== 'object') {
    throw new Error("Missing assistant message in chat completion response.");
  }

  const rawContent = (message as { content?: unknown }).content;
  const rawReasoning =
    (message as { reasoning_content?: unknown }).reasoning_content ??
    (message as { reasoning?: unknown }).reasoning;
  const rawToolCalls = (message as { tool_calls?: unknown }).tool_calls;

  const content = normalizeAssistantContent(rawContent);
  const reasoning = typeof rawReasoning === 'string' ? rawReasoning : '';
  const toolCalls = normalizeToolCalls(rawToolCalls);
  const toolCallsPayload = normalizeToolCallPayload(rawToolCalls);

  return {
    content,
    reasoning,
    toolCalls,
    rawAssistantMessage: {
      role: 'assistant',
      content,
      tool_calls: toolCallsPayload,
    },
  };
}

export async function streamChatCompletion(
  messages: ChatRequestMessage[],
  config: AIProviderConfig,
  onChunk: (contentDelta: string, reasoningDelta: string) => void,
  onError: (err: string) => void,
  onFinish: () => void
) {
  try {
    if (!config.apiKey) {
      throw new Error("API Key not configured. Please go to Settings.");
    }

    const body = {
      model: config.modelId,
      messages: messages,
      stream: true,
      temperature: config.temperature,
    };

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error ${response.status}: ${errorText}`);
    }

    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;

      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const dataStr = trimmed.replace("data: ", "");
        if (dataStr === "[DONE]") break;

        try {
          const json = JSON.parse(dataStr);
          const delta = json.choices?.[0]?.delta;

          if (delta) {
            const contentDelta = delta.content || "";
            const reasoningDelta = delta.reasoning_content || delta.reasoning || "";

            if (contentDelta || reasoningDelta) {
                onChunk(contentDelta, reasoningDelta);
            }
          }
        } catch (e) {
        }
      }
    }

    onFinish();

  } catch (error: any) {
    onError(error.message || "Unknown error");
    onFinish();
  }
}
