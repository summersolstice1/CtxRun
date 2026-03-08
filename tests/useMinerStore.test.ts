import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  invokeMock,
  listenMock,
  storageMap,
  appStoreState,
  uuidCounter,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
  storageMap: new Map<string, string>(),
  appStoreState: { projectRoot: null as string | null },
  uuidCounter: { value: 0 },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}));

vi.mock('uuid', () => ({
  v4: () => `uuid-${++uuidCounter.value}`,
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: {
    getState: () => appStoreState,
  },
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

type MinerStore = typeof import('@/store/useMinerStore')['useMinerStore'];

async function importFreshMinerStore(): Promise<MinerStore> {
  vi.resetModules();
  const mod = await import('@/store/useMinerStore');
  return mod.useMinerStore;
}

describe('useMinerStore', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    storageMap.clear();
    appStoreState.projectRoot = null;
    uuidCounter.value = 0;
  });

  it('startMining validates projectRoot before invoking backend', async () => {
    const useMinerStore = await importFreshMinerStore();
    await useMinerStore.getState().startMining();

    expect(invokeMock).not.toHaveBeenCalled();
    expect(useMinerStore.getState().logs[0].type).toBe('error');
    expect(useMinerStore.getState().logs[0].message).toContain('project root');
  });

  it('startMining sends merged config and outputDir to backend', async () => {
    appStoreState.projectRoot = '/workspace';
    invokeMock.mockResolvedValue(undefined);
    const useMinerStore = await importFreshMinerStore();

    useMinerStore.getState().setConfig({
      url: 'https://example.com/docs',
      matchPrefix: 'https://example.com',
      maxDepth: 3,
    });

    await useMinerStore.getState().startMining();

    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-miner|start_mining',
      expect.objectContaining({
        config: expect.objectContaining({
          url: 'https://example.com/docs',
          matchPrefix: 'https://example.com',
          outputDir: '/workspace',
        }),
      })
    );
    expect(useMinerStore.getState().isRunning).toBe(true);
    expect(useMinerStore.getState().logs[0].type).toBe('info');
  });

  it('startMining records error and resets running state when invoke fails', async () => {
    appStoreState.projectRoot = '/workspace';
    invokeMock.mockRejectedValue(new Error('boom'));
    const useMinerStore = await importFreshMinerStore();

    await useMinerStore.getState().startMining();

    expect(useMinerStore.getState().isRunning).toBe(false);
    expect(useMinerStore.getState().logs[0].type).toBe('error');
    expect(useMinerStore.getState().logs[0].message).toContain('Failed to start');
  });

  it('extractSinglePage trims URL, applies defaults, and rejects blank input', async () => {
    appStoreState.projectRoot = '/workspace';
    invokeMock.mockResolvedValue({
      url: 'https://example.com',
      title: 'Example',
      markdown: '# Example',
      links: [],
      crawledAt: '2026-03-08T00:00:00.000Z',
      warnings: [],
      savedPath: null,
    });
    const useMinerStore = await importFreshMinerStore();

    await useMinerStore.getState().extractSinglePage('  https://example.com  ', {
      timeoutMs: 1234,
      saveToDisk: true,
    });

    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-miner|extract_single_page',
      expect.objectContaining({
        request: expect.objectContaining({
          url: 'https://example.com',
          includeLinks: true,
          saveToDisk: true,
          timeoutMs: 1234,
        }),
      })
    );

    await expect(useMinerStore.getState().extractSinglePage('   ')).rejects.toThrow(
      'URL is required.'
    );
  });

  it('addLog keeps only latest 200 records', async () => {
    const useMinerStore = await importFreshMinerStore();

    for (let i = 0; i < 205; i++) {
      useMinerStore.getState().addLog('info', `log-${i}`);
    }

    const logs = useMinerStore.getState().logs;
    expect(logs).toHaveLength(200);
    expect(logs[0].message).toBe('log-204');
    expect(logs[199].message).toBe('log-5');
  });

  it('initListeners normalizes events, avoids duplicate registration, and unlistens', async () => {
    const handlers: Record<string, (event: any) => void> = {};
    const unlistenProgress = vi.fn();
    const unlistenFinished = vi.fn();
    const unlistenError = vi.fn();

    listenMock.mockImplementation(async (eventName: string, cb: (event: any) => void) => {
      handlers[eventName] = cb;
      if (eventName === 'miner:progress') return unlistenProgress;
      if (eventName === 'miner:finished') return unlistenFinished;
      return unlistenError;
    });

    const useMinerStore = await importFreshMinerStore();
    await useMinerStore.getState().initListeners();
    await useMinerStore.getState().initListeners();

    expect(listenMock).toHaveBeenCalledTimes(3);

    handlers['miner:progress']({
      payload: {
        progress: {
          current: 2,
          total_discovered: 8,
          current_url: 'https://example.com/a',
          status: 'Saved',
        },
      },
    });
    expect(useMinerStore.getState().progress).toEqual({
      current: 2,
      totalDiscovered: 8,
      currentUrl: 'https://example.com/a',
      status: 'Saved',
    });
    expect(useMinerStore.getState().logs[0].message).toContain('Saved');

    useMinerStore.setState({ isRunning: true });
    handlers['miner:error']({ payload: { message: 'net error', url: 'https://example.com/b' } });
    expect(useMinerStore.getState().logs[0].message).toContain('Error: net error');

    handlers['miner:finished']({ payload: { totalPages: 3, outputDir: '/tmp/out' } });
    expect(useMinerStore.getState().isRunning).toBe(false);
    expect(useMinerStore.getState().progress).toBeNull();
    expect(useMinerStore.getState().logs[0].message).toContain('Total pages saved: 3');

    useMinerStore.getState().unlisten();
    expect(unlistenProgress).toHaveBeenCalledTimes(1);
    expect(unlistenFinished).toHaveBeenCalledTimes(1);
    expect(unlistenError).toHaveBeenCalledTimes(1);
    expect(useMinerStore.getState()._unlistenFns).toEqual([]);
  });
});
