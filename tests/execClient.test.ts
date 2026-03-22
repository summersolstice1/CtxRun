import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EXEC_PLUGIN_PREFIX } from '@/types/exec';

const { invokeMock, execStoreState, approvalStoreState } = vi.hoisted(() => {
  const execStoreState = {
    initListeners: vi.fn().mockResolvedValue(undefined),
    markPendingApproval: vi.fn(),
    clearPendingApproval: vi.fn(),
    registerSession: vi.fn(),
    awaitCompletion: vi.fn(),
    _unlistenFns: [],
  };

  const approvalStoreState = {
    ask: vi.fn(),
  };

  return {
    invokeMock: vi.fn(),
    execStoreState,
    approvalStoreState,
  };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@/store/useExecStore', () => ({
  useExecStore: {
    getState: () => execStoreState,
  },
}));

vi.mock('@/store/useExecApprovalStore', () => ({
  useExecApprovalStore: {
    getState: () => approvalStoreState,
  },
}));

type RunExecCommand = typeof import('@/lib/exec/client')['runExecCommand'];

async function importFreshRunExecCommand(): Promise<RunExecCommand> {
  vi.resetModules();
  const mod = await import('@/lib/exec/client');
  return mod.runExecCommand;
}

describe('runExecCommand', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    execStoreState.initListeners.mockClear();
    execStoreState.markPendingApproval.mockClear();
    execStoreState.clearPendingApproval.mockClear();
    execStoreState.registerSession.mockClear();
    execStoreState.awaitCompletion.mockReset();
    approvalStoreState.ask.mockReset();
  });

  it('throws when the runtime blocks the command or approval metadata is missing', async () => {
    const runExecCommand = await importFreshRunExecCommand();

    invokeMock.mockResolvedValueOnce({
      status: 'blocked',
      message: 'blocked by runtime',
    });

    await expect(
      runExecCommand({
        command: 'git clean -fd',
        workspaceRoot: '/repo',
      })
    ).rejects.toThrow('blocked by runtime');

    invokeMock.mockResolvedValueOnce({
      status: 'approval_required',
      approval: {
        reason: 'need approval',
        risk: 'medium',
        workdir: '/repo',
        parsedCommands: [['git', 'status']],
      },
    });

    await expect(
      runExecCommand({
        command: 'git status',
        workspaceRoot: '/repo',
      })
    ).rejects.toThrow('Approval flow is missing toolCallId or approval payload.');
  });

  it('supports rejected approvals and successful execution after approval', async () => {
    const runExecCommand = await importFreshRunExecCommand();

    invokeMock.mockResolvedValueOnce({
      status: 'approval_required',
      approval: {
        reason: 'need approval',
        risk: 'medium',
        workdir: '/repo',
        parsedCommands: [['npm', 'run', 'build']],
      },
    });
    approvalStoreState.ask.mockResolvedValueOnce({ decision: 'reject', note: 'nope' });

    await expect(
      runExecCommand({
        command: 'npm run build',
        workspaceRoot: '/repo',
        toolCallId: 'tool-1',
      })
    ).rejects.toThrow('Command execution was denied by the user. User guidance: nope');

    expect(execStoreState.markPendingApproval).toHaveBeenCalledWith('tool-1', {
      command: 'npm run build',
      workdir: '/repo',
      reason: 'need approval',
    });
    expect(execStoreState.clearPendingApproval).toHaveBeenCalledWith('tool-1');

    invokeMock.mockResolvedValueOnce({
      status: 'approval_required',
      approval: {
        reason: 'need approval',
        risk: 'medium',
        workdir: '/repo',
        parsedCommands: [['npm', 'run', 'build']],
      },
    });
    invokeMock.mockResolvedValueOnce({
      status: 'started',
      session: {
        id: 'session-1',
        command: 'npm run build',
        workdir: '/repo',
        state: 'running',
        stdoutPreview: '',
        stderrPreview: '',
        startedAtMs: 1,
        updatedAtMs: 1,
      },
    });
    approvalStoreState.ask.mockResolvedValueOnce('session');
    execStoreState.awaitCompletion.mockResolvedValueOnce({
      id: 'session-1',
      toolCallId: 'tool-2',
      command: 'npm run build',
      workdir: '/repo',
      state: 'completed',
      stdoutPreview: 'done',
      stderrPreview: '',
      startedAtMs: 1,
      updatedAtMs: 2,
      stdout: 'done',
      stderr: '',
      combinedOutput: 'done',
    });

    const result = await runExecCommand({
      command: 'npm run build',
      workspaceRoot: '/repo',
      toolCallId: 'tool-2',
    });

    expect(execStoreState.registerSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'session-1' })
    );
    expect(execStoreState.awaitCompletion).toHaveBeenCalledWith('session-1');
    expect(result.id).toBe('session-1');
    expect(
      invokeMock.mock.calls.some(
        ([command, payload]) =>
          command === `${EXEC_PLUGIN_PREFIX}approve_exec` &&
          payload?.request?.request?.command === 'npm run build' &&
          payload?.request?.decision === 'session'
      )
    ).toBe(true);
  });
});
