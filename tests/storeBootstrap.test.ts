import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  rehydrateAppMock,
  rehydrateContextMock,
  rehydratePromptMock,
  rehydrateAutomatorMock,
  rehydrateMinerMock,
} = vi.hoisted(() => ({
  rehydrateAppMock: vi.fn(),
  rehydrateContextMock: vi.fn(),
  rehydratePromptMock: vi.fn(),
  rehydrateAutomatorMock: vi.fn(),
  rehydrateMinerMock: vi.fn(),
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: {
    persist: {
      rehydrate: rehydrateAppMock,
    },
  },
}));

vi.mock('@/store/useContextStore', () => ({
  useContextStore: {
    persist: {
      rehydrate: rehydrateContextMock,
    },
  },
}));

vi.mock('@/store/usePromptStore', () => ({
  usePromptStore: {
    persist: {
      rehydrate: rehydratePromptMock,
    },
  },
}));

vi.mock('@/store/useAutomatorStore', () => ({
  useAutomatorStore: {
    persist: {
      rehydrate: rehydrateAutomatorMock,
    },
  },
}));

vi.mock('@/store/useMinerStore', () => ({
  useMinerStore: {
    persist: {
      rehydrate: rehydrateMinerMock,
    },
  },
}));

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function importFreshBootstrap() {
  vi.resetModules();
  return import('@/lib/store_bootstrap');
}

describe('hydratePersistedStores', () => {
  beforeEach(() => {
    rehydrateAppMock.mockReset();
    rehydrateContextMock.mockReset();
    rehydratePromptMock.mockReset();
    rehydrateAutomatorMock.mockReset();
    rehydrateMinerMock.mockReset();

    rehydrateAppMock.mockResolvedValue(undefined);
    rehydrateContextMock.mockResolvedValue(undefined);
    rehydratePromptMock.mockResolvedValue(undefined);
    rehydrateAutomatorMock.mockResolvedValue(undefined);
    rehydrateMinerMock.mockResolvedValue(undefined);
  });

  it('rehydrates each persisted store only once during bootstrap', async () => {
    const appDeferred = deferred<void>();
    rehydrateAppMock.mockReturnValue(appDeferred.promise);

    const { hydratePersistedStores } = await importFreshBootstrap();

    const first = hydratePersistedStores();
    const second = hydratePersistedStores();

    expect(rehydrateAppMock).toHaveBeenCalledTimes(1);
    expect(rehydrateContextMock).toHaveBeenCalledTimes(1);
    expect(rehydratePromptMock).toHaveBeenCalledTimes(1);
    expect(rehydrateAutomatorMock).toHaveBeenCalledTimes(1);
    expect(rehydrateMinerMock).toHaveBeenCalledTimes(1);

    appDeferred.resolve();
    await Promise.all([first, second]);
  });
});
