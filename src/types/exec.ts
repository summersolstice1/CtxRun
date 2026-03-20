export const EXEC_PLUGIN_PREFIX = 'plugin:ctxrun-plugin-exec-runtime|';

export type ExecRequestStatus = 'started' | 'approval_required' | 'blocked';
export type ExecRiskLevel = 'low' | 'medium' | 'high';
export type ExecSessionState = 'running' | 'completed' | 'failed' | 'terminated';
export type ExecOutputStream = 'stdout' | 'stderr';
export type ExecApprovalDecision = 'once' | 'session' | 'prefix_rule';

export interface ExecApprovalRejectOutcome {
  decision: 'reject';
  note?: string;
}

export type ExecApprovalChoice = ExecApprovalDecision | ExecApprovalRejectOutcome;

export interface ExecCommandRequest {
  command: string;
  workspaceRoot: string;
  workdir?: string;
  timeoutMs?: number;
  toolCallId?: string;
}

export interface ExecApprovalPayload {
  reason: string;
  risk: ExecRiskLevel;
  workdir: string;
  parsedCommands: string[][];
  prefixRule?: string[];
}

export interface ExecSessionSnapshot {
  id: string;
  toolCallId?: string;
  command: string;
  workdir: string;
  state: ExecSessionState;
  exitCode?: number;
  stdoutPreview: string;
  stderrPreview: string;
  startedAtMs: number;
  updatedAtMs: number;
}

export interface ExecRequestResponse {
  status: ExecRequestStatus;
  session?: ExecSessionSnapshot;
  approval?: ExecApprovalPayload;
  message?: string;
}

export interface ExecApprovalRequest {
  request: ExecCommandRequest;
  decision: ExecApprovalDecision;
}

export interface ExecWriteRequest {
  sessionId: string;
  input: string;
}

export interface ExecResizeRequest {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface ExecTerminateRequest {
  sessionId: string;
}

export interface ExecOutputEvent {
  sessionId: string;
  toolCallId?: string;
  stream: ExecOutputStream;
  text: string;
}

export interface ExecStateEvent {
  sessionId: string;
  toolCallId?: string;
  state: ExecSessionState;
}

export interface ExecExitEvent {
  sessionId: string;
  toolCallId?: string;
  state: ExecSessionState;
  exitCode: number;
  stdoutPreview: string;
  stderrPreview: string;
  durationMs: number;
}

export interface ExecSessionRecord extends ExecSessionSnapshot {
  stdout: string;
  stderr: string;
  combinedOutput: string;
  durationMs?: number;
}

export interface PendingExecApproval {
  toolCallId: string;
  request: ExecCommandRequest;
  approval: ExecApprovalPayload;
}
