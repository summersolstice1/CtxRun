import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  invokeMock,
  existsMock,
  readTextFileMock,
  fetchFromMirrorsMock,
  storageMap,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  existsMock: vi.fn(),
  readTextFileMock: vi.fn(),
  fetchFromMirrorsMock: vi.fn(),
  storageMap: new Map<string, string>(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppLocalData: 'AppLocalData' },
  exists: existsMock,
  readTextFile: readTextFileMock,
}));

vi.mock('@/lib/network', () => ({
  fetchFromMirrors: fetchFromMirrorsMock,
  PROMPT_MIRROR_BASES: ['https://mirror.local'],
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

type PromptStore = typeof import('@/store/usePromptStore')['usePromptStore'];

function makePrompt(id: string, title: string) {
  return {
    id,
    title,
    content: `content-${id}`,
    group: 'Default',
    description: '',
    tags: [],
    isFavorite: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    source: 'local',
    type: 'prompt',
    isExecutable: false,
    useAsChatTemplate: false,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function importFreshPromptStore(): Promise<PromptStore> {
  vi.resetModules();
  const mod = await import('@/store/usePromptStore');
  return mod.usePromptStore;
}

describe('usePromptStore loadPrompts', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    existsMock.mockReset();
    readTextFileMock.mockReset();
    fetchFromMirrorsMock.mockReset();
    storageMap.clear();

    existsMock.mockResolvedValue(false);
    readTextFileMock.mockResolvedValue('');
    fetchFromMirrorsMock.mockRejectedValue(new Error('unused in this suite'));
  });

  it('keeps newest reset result when older request resolves later', async () => {
    const first = deferred<any[]>();
    const second = deferred<any[]>();

    invokeMock.mockImplementation((command: string, args: any) => {
      if (command !== 'search_prompts') {
        return Promise.resolve([]);
      }
      if (args.query === 'first') {
        return first.promise;
      }
      if (args.query === 'second') {
        return second.promise;
      }
      return Promise.resolve([]);
    });

    const usePromptStore = await importFreshPromptStore();

    usePromptStore.setState({ searchQuery: 'first' });
    const firstLoad = usePromptStore.getState().loadPrompts(true);

    usePromptStore.setState({ searchQuery: 'second' });
    const secondLoad = usePromptStore.getState().loadPrompts(true);

    second.resolve([makePrompt('second', 'Second Prompt')]);
    await secondLoad;

    first.resolve([makePrompt('first', 'First Prompt')]);
    await firstLoad;

    const state = usePromptStore.getState();
    expect(state.prompts.map((p) => p.id)).toEqual(['second']);
    expect(state.page).toBe(2);
    expect(state.isLoading).toBe(false);
  });

  it('skips non-reset load when already loading', async () => {
    const usePromptStore = await importFreshPromptStore();

    usePromptStore.setState({
      isLoading: true,
      searchQuery: 'blocked',
      page: 2,
    });

    await usePromptStore.getState().loadPrompts(false);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('restores previous prompts when reset load fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    invokeMock.mockRejectedValue(new Error('search failed'));
    const usePromptStore = await importFreshPromptStore();

    usePromptStore.setState({
      prompts: [makePrompt('old', 'Old Prompt')],
      page: 3,
      hasMore: false,
      searchQuery: 'will-fail',
    });

    await usePromptStore.getState().loadPrompts(true);

    const state = usePromptStore.getState();
    expect(invokeMock).toHaveBeenCalledWith(
      'search_prompts',
      expect.objectContaining({
        query: 'will-fail',
        page: 1,
      })
    );
    expect(state.prompts.map((p) => p.id)).toEqual(['old']);
    expect(state.page).toBe(3);
    expect(state.hasMore).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('allows reset load while already loading', async () => {
    invokeMock.mockResolvedValue([makePrompt('reset', 'Reset Prompt')]);
    const usePromptStore = await importFreshPromptStore();

    usePromptStore.setState({
      isLoading: true,
      searchQuery: 'reset-query',
    });

    await usePromptStore.getState().loadPrompts(true);

    expect(invokeMock).toHaveBeenCalledWith(
      'search_prompts',
      expect.objectContaining({
        query: 'reset-query',
        page: 1,
      })
    );
    expect(usePromptStore.getState().prompts.map((p) => p.id)).toEqual(['reset']);
  });
});
