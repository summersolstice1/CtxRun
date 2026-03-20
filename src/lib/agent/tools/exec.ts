import { useAppStore } from '@/store/useAppStore';
import { useContextStore } from '@/store/useContextStore';
import { AgentToolRegistry } from '../registry';
import { AgentToolExecutionResult } from '../types';
import { runExecCommand } from '@/lib/exec/client';

interface ShellCommandArgs {
  command: string;
  workdir?: string;
  timeoutMs?: number;
  timeout_ms?: number;
}

function getWorkspaceRoot(): string {
  const appRoot = useAppStore.getState().projectRoot?.trim();
  if (appRoot) {
    return appRoot;
  }

  const contextRoot = useContextStore.getState().projectRoot?.trim();
  if (contextRoot) {
    return contextRoot;
  }

  throw new Error('projectRoot is not configured. Please select a workspace folder first.');
}

function normalizeArgs(input: unknown): ShellCommandArgs {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid arguments, object expected.');
  }

  const raw = input as Record<string, unknown>;
  const command = typeof raw.command === 'string' ? raw.command.trim() : '';
  if (!command) {
    throw new Error('command is required.');
  }

  const workdir = typeof raw.workdir === 'string' ? raw.workdir.trim() : undefined;
  const timeoutMsRaw =
    typeof raw.timeoutMs === 'number'
      ? raw.timeoutMs
      : typeof raw.timeout_ms === 'number'
        ? raw.timeout_ms
        : undefined;
  const timeoutMs =
    typeof timeoutMsRaw === 'number' && Number.isFinite(timeoutMsRaw)
      ? Math.max(1_000, Math.min(10 * 60_000, Math.floor(timeoutMsRaw)))
      : undefined;

  return {
    command,
    workdir: workdir && workdir.length > 0 ? workdir : undefined,
    timeoutMs,
  };
}

function buildResult(session: Awaited<ReturnType<typeof runExecCommand>>): AgentToolExecutionResult {
  const summaryLines = [`Command finished with state ${session.state}${typeof session.exitCode === 'number' ? ` (exit ${session.exitCode})` : ''}.`];
  const stdout = session.stdoutPreview.trim();
  const stderr = session.stderrPreview.trim();

  if (stdout) {
    summaryLines.push(`stdout:\n${stdout}`);
  }
  if (stderr) {
    summaryLines.push(`stderr:\n${stderr}`);
  }
  if (!stdout && !stderr) {
    summaryLines.push('[no output]');
  }

  if (session.state !== 'completed') {
    return {
      ok: false,
      error: summaryLines.join('\n\n'),
      structured: {
        sessionId: session.id,
        state: session.state,
        exitCode: session.exitCode ?? null,
        workdir: session.workdir,
        stdoutPreview: session.stdoutPreview,
        stderrPreview: session.stderrPreview,
        durationMs: session.durationMs ?? null,
      },
    };
  }

  return {
    ok: true,
    text: summaryLines.join('\n\n'),
    structured: {
      sessionId: session.id,
      state: session.state,
      exitCode: session.exitCode ?? null,
      workdir: session.workdir,
      stdoutPreview: session.stdoutPreview,
      stderrPreview: session.stderrPreview,
      durationMs: session.durationMs ?? null,
    },
  };
}

function toToolError(error: unknown): AgentToolExecutionResult {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

export function registerExecTools(registry: AgentToolRegistry): void {
  registry.register({
    definition: {
      name: 'shell_command',
      description:
        'Run a workspace-scoped shell command through the guarded exec runtime. Read-only commands may auto-run; mutating or unknown commands require approval.',
      inputSchema: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'PowerShell command text to run inside the current workspace.',
          },
          workdir: {
            type: 'string',
            description: 'Optional working directory relative to workspace root.',
          },
          timeoutMs: {
            type: 'integer',
            minimum: 1000,
            maximum: 600000,
            description: 'Optional execution timeout in milliseconds.',
          },
        },
        required: ['command'],
      },
      riskLevel: 'medium',
      timeoutMs: 10 * 60_000,
    },
    handler: async (input, context) => {
      try {
        const args = normalizeArgs(input);
        const session = await runExecCommand({
          command: args.command,
          workspaceRoot: getWorkspaceRoot(),
          workdir: args.workdir,
          timeoutMs: args.timeoutMs,
          toolCallId: context.callId,
        });
        return buildResult(session);
      } catch (error) {
        return toToolError(error);
      }
    },
  });
}
