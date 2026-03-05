import { AIProviderConfig } from '@/types/model';
import { ChatRequestMessage } from '@/lib/llm';

export type ToolRiskLevel = 'low' | 'medium' | 'high';

export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  riskLevel?: ToolRiskLevel;
  timeoutMs?: number;
}

export interface AgentToolExecutionContext {
  sessionId: string;
  callId: string;
}

export interface AgentToolSuccessResult {
  ok: true;
  text: string;
  structured?: Record<string, unknown>;
  warnings?: string[];
}

export interface AgentToolErrorResult {
  ok: false;
  error: string;
  structured?: Record<string, unknown>;
  warnings?: string[];
}

export type AgentToolExecutionResult = AgentToolSuccessResult | AgentToolErrorResult;

export type AgentToolHandler = (
  input: unknown,
  context: AgentToolExecutionContext
) => Promise<AgentToolExecutionResult>;

export interface AgentToolRegistration {
  definition: AgentToolDefinition;
  handler: AgentToolHandler;
}

export interface AgentToolCallInfo {
  id: string;
  name: string;
  argumentsRaw: string;
  argumentsParsed: unknown;
}

export interface AgentToolPolicy {
  mode: 'allowAll' | 'allowList' | 'denyList';
  toolNames?: string[];
}

export interface AgentRuntimeCallbacks {
  onAssistantDelta?: (delta: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onToolStart?: (info: AgentToolCallInfo) => void;
  onToolFinish?: (info: AgentToolCallInfo, result: AgentToolExecutionResult) => void;
}

export interface AgentRunOptions {
  sessionId: string;
  messages: ChatRequestMessage[];
  config: AIProviderConfig;
  toolPolicy?: AgentToolPolicy;
  maxToolRounds?: number;
  maxTotalToolCalls?: number;
  maxRuntimeMs?: number;
  callbacks?: AgentRuntimeCallbacks;
}

export interface AgentRunResult {
  assistantContent: string;
  assistantReasoning: string;
  history: ChatRequestMessage[];
}
