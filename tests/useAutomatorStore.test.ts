import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock, listenMock, storageMap } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
  storageMap: new Map<string, string>(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}));

vi.mock('@/lib/storage', () => ({
  fileStorage: {
    getItem: vi.fn(async (name: string) => storageMap.get(name) ?? null),
    setItem: vi.fn(async (name: string, value: string) => {
      storageMap.set(name, value);
    }),
    removeItem: vi.fn(async (name: string) => {
      storageMap.delete(name);
    }),
  },
}));

type AutomatorStore = typeof import('@/store/useAutomatorStore')['useAutomatorStore'];

async function importFreshAutomatorStore(): Promise<AutomatorStore> {
  vi.resetModules();
  const mod = await import('@/store/useAutomatorStore');
  return mod.useAutomatorStore;
}

describe('useAutomatorStore', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    storageMap.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('supports workflow CRUD while keeping at least one workflow', async () => {
    const useAutomatorStore = await importFreshAutomatorStore();
    const initial = useAutomatorStore.getState();
    const initialId = initial.workflows[0].id;

    const createdId = useAutomatorStore.getState().createWorkflow('Flow A');
    expect(useAutomatorStore.getState().activeWorkflowId).toBe(createdId);
    expect(useAutomatorStore.getState().workflows.some((w) => w.id === createdId)).toBe(true);

    useAutomatorStore.getState().deleteWorkflow(createdId);
    expect(useAutomatorStore.getState().workflows.some((w) => w.id === createdId)).toBe(false);

    useAutomatorStore.getState().deleteWorkflow(initialId);
    const finalState = useAutomatorStore.getState();
    expect(finalState.workflows.length).toBe(1);
    expect(finalState.activeWorkflowId).toBe(finalState.workflows[0].id);
  });

  it('duplicates workflow and activates the duplicate', async () => {
    const useAutomatorStore = await importFreshAutomatorStore();
    const originalId = useAutomatorStore.getState().workflows[0].id;

    useAutomatorStore.getState().addAction({ type: 'Wait', payload: { ms: 100 } });
    useAutomatorStore.getState().updateCurrentWorkflow({ repeatCount: 3 });

    const duplicateId = useAutomatorStore.getState().duplicateWorkflow(originalId);
    expect(duplicateId).not.toBe('');
    expect(useAutomatorStore.getState().activeWorkflowId).toBe(duplicateId);

    const duplicate = useAutomatorStore.getState().workflows.find((w) => w.id === duplicateId)!;
    expect(duplicate.name).toContain('(Copy)');
    expect(duplicate.repeatCount).toBe(3);
    expect(duplicate.actions).toHaveLength(1);
    expect(duplicate.actions[0].type).toBe('Wait');
  });

  it('supports legacy action operations on current workflow', async () => {
    const useAutomatorStore = await importFreshAutomatorStore();

    useAutomatorStore.getState().addAction({ type: 'Wait', payload: { ms: 100 } });
    useAutomatorStore.getState().addAction({ type: 'Scroll', payload: { delta: 5 } });
    useAutomatorStore.getState().updateAction(0, { type: 'Wait', payload: { ms: 200 } });
    useAutomatorStore.getState().reorderActions(0, 1);
    useAutomatorStore.getState().removeAction(0);

    const actions = useAutomatorStore.getState().getCurrentWorkflow().actions;
    expect(actions).toHaveLength(1);
    expect(actions[0]).toEqual({ type: 'Wait', payload: { ms: 200 } });
  });

  it('start and toggle invoke backend workflow commands', async () => {
    invokeMock.mockResolvedValue(undefined);
    const useAutomatorStore = await importFreshAutomatorStore();

    useAutomatorStore.getState().updateCurrentWorkflow({
      name: 'Runner',
      repeatCount: 2,
      actions: [{ type: 'Wait', payload: { ms: 1 } }],
    });

    await useAutomatorStore.getState().start();
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-automator|execute_workflow',
      expect.objectContaining({
        workflow: expect.objectContaining({
          name: 'Runner',
          repeatCount: 2,
        }),
      })
    );
    expect(useAutomatorStore.getState().currentLoop).toBe(0);
    expect(useAutomatorStore.getState().currentStepIndex).toBe(-1);

    useAutomatorStore.setState({ isRunning: true });
    await useAutomatorStore.getState().toggle();
    expect(invokeMock).toHaveBeenCalledWith('plugin:ctxrun-plugin-automator|stop_workflow');
  });

  it('pickLocation records coordinate action after timer delay', async () => {
    vi.useFakeTimers();
    invokeMock.mockImplementation((command: string) => {
      if (command === 'plugin:ctxrun-plugin-automator|get_mouse_position') {
        return Promise.resolve([12, 34]);
      }
      return Promise.resolve(undefined);
    });

    const useAutomatorStore = await importFreshAutomatorStore();
    await useAutomatorStore.getState().pickLocation();
    expect(useAutomatorStore.getState().isPicking).toBe(true);

    await vi.advanceTimersByTimeAsync(3000);
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith('plugin:ctxrun-plugin-automator|get_mouse_position');
    const actions = useAutomatorStore.getState().getCurrentWorkflow().actions;
    const last = actions[actions.length - 1];
    expect(last.type).toBe('MoveTo');
    expect(last.payload).toEqual({
      target: { type: 'Coordinate', x: 12, y: 34 },
    });
    expect(useAutomatorStore.getState().isPicking).toBe(false);
  });

  it('initListeners registers once and updates runtime state from events', async () => {
    const handlers: Record<string, (event: any) => void> = {};
    const unlistenStatus = vi.fn();
    const unlistenLoop = vi.fn();
    const unlistenStep = vi.fn();

    listenMock.mockImplementation(async (eventName: string, cb: (event: any) => void) => {
      handlers[eventName] = cb;
      if (eventName === 'automator:status') return unlistenStatus;
      if (eventName === 'automator:loop_count') return unlistenLoop;
      return unlistenStep;
    });

    const useAutomatorStore = await importFreshAutomatorStore();
    await useAutomatorStore.getState().initListeners();
    await useAutomatorStore.getState().initListeners();

    expect(listenMock).toHaveBeenCalledTimes(3);

    handlers['automator:status']({ payload: true });
    expect(useAutomatorStore.getState().isRunning).toBe(true);

    handlers['automator:step']({ payload: 7 });
    expect(useAutomatorStore.getState().currentStepIndex).toBe(7);

    handlers['automator:loop_count']({ payload: 2 });
    expect(useAutomatorStore.getState().currentLoop).toBe(2);

    handlers['automator:status']({ payload: false });
    expect(useAutomatorStore.getState().isRunning).toBe(false);
    expect(useAutomatorStore.getState().currentStepIndex).toBe(-1);

    useAutomatorStore.getState().unlisten();
    expect(unlistenStatus).toHaveBeenCalledTimes(1);
    expect(unlistenLoop).toHaveBeenCalledTimes(1);
    expect(unlistenStep).toHaveBeenCalledTimes(1);
    expect(useAutomatorStore.getState()._unlistenFns).toEqual([]);
  });
});
