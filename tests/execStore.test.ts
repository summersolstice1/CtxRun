import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listenMock, invokeMock, listeners, unlistenFns } = vi.hoisted(() => {
  const listeners = new Map<string, (event: { payload: any }) => void>();
  const unlistenFns: Array<ReturnType<typeof vi.fn>> = [];

  return {
    listenMock: vi.fn(async (event: string, handler: (event: { payload: any }) => void) => {
      listeners.set(event, handler);
      const unlisten = vi.fn();
      unlistenFns.push(unlisten);
      return unlisten;
    }),
    invokeMock: vi.fn(),
    listeners,
    unlistenFns,
  };
});

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

type ExecStore = typeof import('@/store/useExecStore')['useExecStore'];

async function importFreshExecStore(): Promise<ExecStore> {
  vi.resetModules();
  const mod = await import('@/store/useExecStore');
  return mod.useExecStore;
}

describe('useExecStore', () => {
  beforeEach(() => {
    listenMock.mockClear();
    invokeMock.mockReset();
    listeners.clear();
    unlistenFns.length = 0;
  });

  it('initializes listeners once and updates sessions from runtime events', async () => {
    const store = await importFreshExecStore();

    await store.getState().initListeners();
    await store.getState().initListeners();

    expect(listenMock).toHaveBeenCalledTimes(3);
    expect(store.getState()._unlistenFns).toHaveLength(3);

    listeners.get('exec://output')?.({
      payload: {
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        stream: 'stdout',
        text: 'hello',
      },
    });
    listeners.get('exec://output')?.({
      payload: {
        sessionId: 'session-1',
        toolCallId: 'tool-1',
        stream: 'stderr',
        text: 'oops',
      },
    });
    listeners.get('exec://state')?.({
      payload: {
        sessionId: 'session-2',
        toolCallId: 'tool-2',
        state: 'running',
      },
    });

    const completion = store.getState().awaitCompletion('session-3');
    listeners.get('exec://exit')?.({
      payload: {
        sessionId: 'session-3',
        toolCallId: 'tool-3',
        state: 'completed',
        exitCode: 0,
        exitReason: 'exit_zero',
        stdoutPreview: 'done',
        stderrPreview: '',
        durationMs: 33,
      },
    });

    const completed = await completion;
    expect(completed.combinedOutput).toBe('done');
    expect(store.getState().sessions['session-1'].stdout).toBe('hello');
    expect(store.getState().sessions['session-1'].stderr).toBe('oops');
    expect(store.getState().sessions['session-2'].state).toBe('running');
    expect(store.getState().toolCallToSessionId).toMatchObject({
      'tool-1': 'session-1',
      'tool-2': 'session-2',
      'tool-3': 'session-3',
    });

    const immediate = await store.getState().awaitCompletion('session-3');
    expect(immediate.state).toBe('completed');
    expect(immediate.exitCode).toBe(0);

    store.getState().registerSession({
      id: 'session-3',
      toolCallId: 'tool-3',
      command: 'cmd',
      workdir: '/repo',
      state: 'running',
      stdoutPreview: 'new-out',
      stderrPreview: 'new-err',
      startedAtMs: 1,
      updatedAtMs: 2,
    });

    expect(store.getState().sessions['session-3'].state).toBe('completed');
    expect(store.getState().sessions['session-3'].stdoutPreview).toBe('done');

    store.getState().markPendingApproval('tool-4', {
      command: 'git status',
      workdir: '/repo',
      reason: 'approval required',
    });
    expect(store.getState().pendingByToolCallId['tool-4']).toBeTruthy();
    store.getState().clearPendingApproval('tool-4');
    store.getState().clearPendingApproval('tool-4');
    expect(store.getState().pendingByToolCallId['tool-4']).toBeUndefined();

    await store.getState().terminateSession('session-3');
    expect(invokeMock).toHaveBeenCalledWith('plugin:ctxrun-plugin-exec-runtime|terminate_exec', {
      request: { sessionId: 'session-3' },
    });
  });

  it('unlistens listeners and keeps terminal completion resolvers isolated', async () => {
    const store = await importFreshExecStore();
    await store.getState().initListeners();

    const pending = store.getState().awaitCompletion('session-x');
    store.getState().unlisten();

    expect(unlistenFns).toHaveLength(3);
    expect(unlistenFns.every((fn) => fn.mock.calls.length === 1)).toBe(true);
    expect(store.getState()._unlistenFns).toEqual([]);

    listeners.get('exec://exit')?.({
      payload: {
        sessionId: 'session-x',
        toolCallId: 'tool-x',
        state: 'terminated',
        exitCode: 1,
        exitReason: 'user_terminated',
        stdoutPreview: 'bye',
        stderrPreview: '',
        durationMs: 1,
      },
    });

    const resolved = await pending;
    expect(resolved.state).toBe('terminated');
  });
});
