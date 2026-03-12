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

  it('migrates legacy prompts, refreshes derived state, and marks migration complete', async () => {
    existsMock.mockResolvedValue(true);
    readTextFileMock.mockResolvedValue(
      JSON.stringify({
        state: {
          localPrompts: [
            {
              title: 'Legacy Prompt',
              content: 'legacy content',
              group: '',
              isFavorite: true,
              tags: 'invalid',
              isExecutable: true,
            },
          ],
        },
      })
    );
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_prompt_groups') return ['Ops'];
      if (command === 'get_prompt_counts') return { prompt: 2, command: 1 };
      return null;
    });

    const usePromptStore = await importFreshPromptStore();
    await usePromptStore.getState().initStore();

    expect(invokeMock).toHaveBeenCalledWith(
      'batch_import_local_prompts',
      expect.objectContaining({
        prompts: [
          expect.objectContaining({
            title: 'Legacy Prompt',
            content: 'legacy content',
            group: 'Default',
            source: 'local',
            isFavorite: true,
            tags: [],
            isExecutable: true,
          }),
        ],
      })
    );
    expect(usePromptStore.getState().migrationVersion).toBe(1);
    expect(usePromptStore.getState().groups).toEqual(['Default', 'Ops']);
    expect(usePromptStore.getState().counts).toEqual({ prompt: 2, command: 1 });
  });

  it('fetches chat templates and logs refresh failures without throwing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'get_chat_templates') {
        return [makePrompt('template-1', 'Template One')];
      }
      if (command === 'get_prompt_counts') {
        throw new Error('counts failed');
      }
      return null;
    });

    const usePromptStore = await importFreshPromptStore();
    await usePromptStore.getState().fetchChatTemplates();
    await usePromptStore.getState().refreshCounts();

    expect(usePromptStore.getState().chatTemplates.map((p) => p.id)).toEqual(['template-1']);
    expect(usePromptStore.getState().counts).toEqual({ prompt: 0, command: 0 });
    expect(errorSpy).toHaveBeenCalled();
  });

  it('loads prompt pages with group filters and appends non-reset results', async () => {
    invokeMock.mockImplementation(async (command: string, args: any) => {
      if (command !== 'get_prompts') return null;
      if (args.page === 1) {
        return Array.from({ length: 20 }, (_, index) =>
          makePrompt(`page1-${index}`, `Prompt ${index + 1}`)
        );
      }
      return [makePrompt('page2-0', 'Prompt 21')];
    });

    const usePromptStore = await importFreshPromptStore();
    usePromptStore.setState({
      activeGroup: 'Ops',
      activeCategory: 'command',
    });

    await usePromptStore.getState().loadPrompts(true);
    expect(invokeMock).toHaveBeenCalledWith(
      'get_prompts',
      expect.objectContaining({
        page: 1,
        group: 'Ops',
        category: 'command',
      })
    );
    expect(usePromptStore.getState().prompts).toHaveLength(20);
    expect(usePromptStore.getState().hasMore).toBe(true);

    await usePromptStore.getState().loadPrompts(false);
    expect(usePromptStore.getState().prompts).toHaveLength(21);
    expect(usePromptStore.getState().page).toBe(3);
    expect(usePromptStore.getState().hasMore).toBe(false);
  });

  it('setters trigger reset loading with the latest filters', async () => {
    invokeMock.mockResolvedValue([]);
    const usePromptStore = await importFreshPromptStore();

    usePromptStore.getState().setSearchQuery(' build ');
    await Promise.resolve();
    expect(usePromptStore.getState().searchQuery).toBe(' build ');
    expect(invokeMock).toHaveBeenLastCalledWith(
      'search_prompts',
      expect.objectContaining({
        query: ' build ',
        page: 1,
      })
    );

    usePromptStore.getState().setActiveGroup('Ops');
    await Promise.resolve();
    expect(usePromptStore.getState().activeGroup).toBe('Ops');
    expect(invokeMock).toHaveBeenLastCalledWith(
      'search_prompts',
      expect.objectContaining({
        query: ' build ',
        page: 1,
      })
    );

    usePromptStore.getState().setActiveCategory('command');
    await Promise.resolve();
    expect(usePromptStore.getState().activeCategory).toBe('command');
    expect(usePromptStore.getState().activeGroup).toBe('all');
    expect(invokeMock).toHaveBeenLastCalledWith(
      'search_prompts',
      expect.objectContaining({
        category: 'command',
      })
    );
  });

  it('addPrompt saves a local prompt and refreshes related views', async () => {
    invokeMock.mockResolvedValue(null);
    const usePromptStore = await importFreshPromptStore();
    const loadPrompts = vi.fn(async () => {});
    const refreshGroups = vi.fn(async () => {});
    const refreshCounts = vi.fn(async () => {});
    usePromptStore.setState({ loadPrompts, refreshGroups, refreshCounts });

    await usePromptStore.getState().addPrompt({
      title: 'New Prompt',
      content: 'echo 1',
      group: 'Ops',
      description: 'desc',
      tags: ['a'],
      type: 'command',
      isExecutable: true,
      shellType: 'bash',
      useAsChatTemplate: true,
    });

    expect(invokeMock).toHaveBeenCalledWith(
      'save_prompt',
      expect.objectContaining({
        prompt: expect.objectContaining({
          title: 'New Prompt',
          group: 'Ops',
          source: 'local',
          isFavorite: false,
          type: 'command',
          shellType: 'bash',
          useAsChatTemplate: true,
        }),
      })
    );
    expect(loadPrompts).toHaveBeenCalledWith(true);
    expect(refreshGroups).toHaveBeenCalledTimes(1);
    expect(refreshCounts).toHaveBeenCalledTimes(1);
  });

  it('updates prompts in memory, optionally refreshes groups, and ignores missing ids', async () => {
    invokeMock.mockResolvedValue(null);
    const usePromptStore = await importFreshPromptStore();
    const refreshGroups = vi.fn(async () => {});
    usePromptStore.setState({
      prompts: [makePrompt('p1', 'Existing Prompt')],
      refreshGroups,
    });

    await usePromptStore.getState().updatePrompt('missing', { title: 'Ignored' });
    expect(invokeMock).not.toHaveBeenCalled();

    await usePromptStore.getState().updatePrompt('p1', {
      title: 'Updated Prompt',
      group: 'Ops',
    });

    expect(invokeMock).toHaveBeenCalledWith(
      'save_prompt',
      expect.objectContaining({
        prompt: expect.objectContaining({
          id: 'p1',
          title: 'Updated Prompt',
          group: 'Ops',
        }),
      })
    );
    expect(usePromptStore.getState().prompts[0].title).toBe('Updated Prompt');
    expect(refreshGroups).toHaveBeenCalledTimes(1);
  });

  it('deletes prompts, toggles favorites, and switches away from deleted active groups', async () => {
    invokeMock.mockResolvedValue(null);
    const usePromptStore = await importFreshPromptStore();
    const refreshCounts = vi.fn(async () => {});
    const setActiveGroup = vi.fn();
    usePromptStore.setState({
      prompts: [makePrompt('p1', 'One'), makePrompt('p2', 'Two')],
      activeGroup: 'Ops',
      refreshCounts,
      setActiveGroup,
    });

    await usePromptStore.getState().deletePrompt('p1');
    expect(invokeMock).toHaveBeenCalledWith('delete_prompt', { id: 'p1' });
    expect(usePromptStore.getState().prompts.map((p) => p.id)).toEqual(['p2']);
    expect(refreshCounts).toHaveBeenCalledTimes(1);

    usePromptStore.setState({ prompts: [makePrompt('p2', 'Two')] });
    await usePromptStore.getState().toggleFavorite('p2');
    expect(invokeMock).toHaveBeenCalledWith('toggle_prompt_favorite', { id: 'p2' });
    expect(usePromptStore.getState().prompts[0].isFavorite).toBe(true);

    await usePromptStore.getState().deleteGroup('Ops');
    expect(setActiveGroup).toHaveBeenCalledWith('all');
  });

  it('fetchManifest stores the active source URL and recovers from failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchFromMirrorsMock.mockResolvedValueOnce({
      data: {
        updated_at: 1,
        version: '1.0.0',
        packages: [],
      },
      sourceUrl: 'https://mirror.local/manifest.json',
    });
    const usePromptStore = await importFreshPromptStore();

    await usePromptStore.getState().fetchManifest();
    expect(usePromptStore.getState().manifest).toEqual({
      updated_at: 1,
      version: '1.0.0',
      packages: [],
    });
    expect(usePromptStore.getState().activeManifestUrl).toBe('https://mirror.local/manifest.json');
    expect(usePromptStore.getState().isStoreLoading).toBe(false);

    fetchFromMirrorsMock.mockRejectedValueOnce(new Error('manifest failed'));
    await usePromptStore.getState().fetchManifest();
    expect(usePromptStore.getState().isStoreLoading).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('installs and uninstalls packs while keeping store loading state consistent', async () => {
    invokeMock.mockResolvedValue(null);
    fetchFromMirrorsMock.mockResolvedValue({
      data: [
        {
          id: 'prompt-1',
          title: 'Pack Prompt',
          content: 'packed',
          group: 'Pack',
          type: 'prompt',
        },
      ],
      sourceUrl: 'https://mirror.local/packs/dev.json',
    });
    const usePromptStore = await importFreshPromptStore();
    const loadPrompts = vi.fn(async () => {});
    const refreshGroups = vi.fn(async () => {});
    const refreshCounts = vi.fn(async () => {});
    usePromptStore.setState({
      installedPackIds: ['existing-pack'],
      loadPrompts,
      refreshGroups,
      refreshCounts,
    });

    const pack = {
      id: 'pack-alpha',
      language: 'zh-CN',
      platform: 'all',
      name: 'Alpha',
      description: 'Alpha pack',
      count: 1,
      size_kb: 1,
      url: 'packs/alpha.json',
      category: 'prompt' as const,
    };

    await usePromptStore.getState().installPack(pack);
    expect(fetchFromMirrorsMock).toHaveBeenCalledWith(
      ['https://mirror.local'],
      expect.objectContaining({
        path: 'packs/alpha.json',
      })
    );
    expect(invokeMock).toHaveBeenCalledWith(
      'import_prompt_pack',
      expect.objectContaining({
        packId: 'pack-alpha',
        prompts: [
          expect.objectContaining({
            title: 'Pack Prompt',
            group: 'Pack',
            source: 'official',
            packId: 'pack-alpha',
            originalId: 'prompt-1',
          }),
        ],
      })
    );
    expect(usePromptStore.getState().installedPackIds.sort()).toEqual([
      'existing-pack',
      'pack-alpha',
    ]);
    expect(usePromptStore.getState().isStoreLoading).toBe(false);
    expect(loadPrompts).toHaveBeenCalledWith(true);
    expect(refreshGroups).toHaveBeenCalledTimes(1);
    expect(refreshCounts).toHaveBeenCalledTimes(1);

    invokeMock.mockClear();
    await usePromptStore.getState().uninstallPack('pack-alpha');
    expect(invokeMock).toHaveBeenCalledWith('import_prompt_pack', {
      packId: 'pack-alpha',
      prompts: [],
    });
    expect(usePromptStore.getState().installedPackIds).toEqual(['existing-pack']);
    expect(usePromptStore.getState().isStoreLoading).toBe(false);
  });

  it('propagates install failures and logs uninstall failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchFromMirrorsMock.mockRejectedValueOnce(new Error('pack fetch failed'));
    invokeMock.mockRejectedValueOnce(new Error('uninstall failed'));
    const usePromptStore = await importFreshPromptStore();

    await expect(
      usePromptStore.getState().installPack({
        id: 'pack-alpha',
        language: 'zh-CN',
        platform: 'all',
        name: 'Alpha',
        description: 'Alpha pack',
        count: 1,
        size_kb: 1,
        url: 'packs/alpha.json',
        category: 'prompt',
      })
    ).rejects.toThrow('pack fetch failed');
    expect(usePromptStore.getState().isStoreLoading).toBe(false);

    await usePromptStore.getState().uninstallPack('pack-alpha');
    expect(usePromptStore.getState().isStoreLoading).toBe(false);
    expect(errorSpy).toHaveBeenCalled();
  });
});
