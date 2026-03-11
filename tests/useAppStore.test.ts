import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  emitMock,
  invokeMock,
  fetchFromMirrorsMock,
  changeLanguageMock,
  storageMap,
  contextStoreState,
} = vi.hoisted(() => ({
  emitMock: vi.fn(),
  invokeMock: vi.fn(),
  fetchFromMirrorsMock: vi.fn(),
  changeLanguageMock: vi.fn(),
  storageMap: new Map<string, string>(),
  contextStoreState: {
    projectRoot: null as string | null,
    setProjectRoot: vi.fn(async (path: string | null) => {
      contextStoreState.projectRoot = path;
    }),
  },
}));

vi.mock('@tauri-apps/api/event', () => ({
  emit: emitMock,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@/lib/network', () => ({
  fetchFromMirrors: fetchFromMirrorsMock,
  MODEL_MIRROR_BASES: ['https://mirror.local'],
}));

vi.mock('@/i18n/config', () => ({
  default: {
    changeLanguage: changeLanguageMock,
  },
}));

vi.mock('@/store/useContextStore', () => ({
  useContextStore: {
    getState: () => contextStoreState,
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

type AppStore = typeof import('@/store/useAppStore')['useAppStore'];

async function importFreshAppStore(): Promise<AppStore> {
  vi.resetModules();
  const mod = await import('@/store/useAppStore');
  return mod.useAppStore;
}

describe('useAppStore setTheme', () => {
  beforeEach(() => {
    emitMock.mockReset();
    invokeMock.mockReset();
    fetchFromMirrorsMock.mockReset();
    changeLanguageMock.mockReset();
    storageMap.clear();
    contextStoreState.projectRoot = null;
    contextStoreState.setProjectRoot.mockReset();
    contextStoreState.setProjectRoot.mockImplementation(async (path: string | null) => {
      contextStoreState.projectRoot = path;
    });
    emitMock.mockResolvedValue(undefined);
  });

  it('updates theme and emits theme-changed by default', async () => {
    const useAppStore = await importFreshAppStore();

    useAppStore.getState().setTheme('light');
    await Promise.resolve();

    expect(useAppStore.getState().theme).toBe('light');
    expect(emitMock).toHaveBeenCalledWith('theme-changed', 'light');
  });

  it('updates theme without emit when skipEmit is true', async () => {
    const useAppStore = await importFreshAppStore();

    useAppStore.getState().setTheme('black', true);
    await Promise.resolve();

    expect(useAppStore.getState().theme).toBe('black');
    expect(emitMock).not.toHaveBeenCalled();
  });

  it('setProjectRoot normalizes path and keeps latest 5 recent roots', async () => {
    const useAppStore = await importFreshAppStore();

    useAppStore.getState().setProjectRoot('  /a  ');
    useAppStore.getState().setProjectRoot('/b');
    useAppStore.getState().setProjectRoot('/c');
    useAppStore.getState().setProjectRoot('/d');
    useAppStore.getState().setProjectRoot('/e');
    useAppStore.getState().setProjectRoot('/f');
    useAppStore.getState().setProjectRoot('/d');

    const state = useAppStore.getState();
    expect(state.projectRoot).toBe('/d');
    expect(state.recentProjectRoots).toEqual(['/d', '/f', '/e', '/c', '/b']);
  });

  it('clearProjectRoot clears current root and keeps recent history', async () => {
    const useAppStore = await importFreshAppStore();

    useAppStore.getState().setProjectRoot('/workspace-a');
    useAppStore.getState().setProjectRoot('/workspace-b');
    useAppStore.getState().clearProjectRoot();

    const state = useAppStore.getState();
    expect(state.projectRoot).toBeNull();
    expect(state.recentProjectRoots).toEqual(['/workspace-b', '/workspace-a']);
  });

  it('setProjectRoot does not call context sync when context root already matches', async () => {
    const useAppStore = await importFreshAppStore();

    contextStoreState.projectRoot = '/same-path';
    useAppStore.getState().setProjectRoot('/same-path');

    expect(useAppStore.getState().projectRoot).toBe('/same-path');
    expect(contextStoreState.setProjectRoot).not.toHaveBeenCalled();
  });

  it('updates language and global ignore lists with add/duplicate/remove paths', async () => {
    const useAppStore = await importFreshAppStore();

    useAppStore.getState().setLanguage('en');
    useAppStore.getState().updateGlobalIgnore('extensions', 'add', 'tmp');
    useAppStore.getState().updateGlobalIgnore('extensions', 'add', 'tmp');
    useAppStore.getState().updateGlobalIgnore('extensions', 'remove', 'tmp');

    expect(useAppStore.getState().language).toBe('en');
    expect(changeLanguageMock).toHaveBeenCalledWith('en');
    expect(useAppStore.getState().globalIgnore.extensions.includes('tmp')).toBe(false);
  });

  it('setAIConfig switches provider using saved settings and updates saved values', async () => {
    const useAppStore = await importFreshAppStore();

    useAppStore.setState({
      aiConfig: {
        providerId: 'deepseek',
        apiKey: 'old',
        baseUrl: 'https://old.example',
        modelId: 'old-model',
        temperature: 0.1,
      },
      savedProviderSettings: {
        deepseek: {
          apiKey: 'deepseek-key',
          baseUrl: 'https://api.deepseek.com',
          modelId: 'deepseek-chat',
          temperature: 0.7,
        },
        openai: {
          apiKey: 'open-key',
          baseUrl: 'https://api.openai.com/v1',
          modelId: 'gpt-4o',
          temperature: 0.3,
        },
      },
    });

    useAppStore.getState().setAIConfig({ providerId: 'openai' });
    expect(useAppStore.getState().aiConfig).toEqual({
      providerId: 'openai',
      apiKey: 'open-key',
      baseUrl: 'https://api.openai.com/v1',
      modelId: 'gpt-4o',
      temperature: 0.3,
    });

    useAppStore.getState().setAIConfig({
      apiKey: 'new-open-key',
      baseUrl: 'https://proxy.example/v1',
      modelId: 'gpt-custom',
      temperature: 0.9,
    });

    expect(useAppStore.getState().savedProviderSettings.openai).toEqual({
      apiKey: 'new-open-key',
      baseUrl: 'https://proxy.example/v1',
      modelId: 'gpt-custom',
      temperature: 0.9,
    });
  });

  it('setAIConfig falls back to default values when switching to unknown provider', async () => {
    const useAppStore = await importFreshAppStore();

    useAppStore.getState().setAIConfig({ providerId: 'custom-provider' });

    expect(useAppStore.getState().aiConfig).toEqual({
      providerId: 'custom-provider',
      apiKey: '',
      baseUrl: '',
      modelId: '',
      temperature: 0.7,
    });
  });

  it('renameAIProvider handles success and no-op branches', async () => {
    const useAppStore = await importFreshAppStore();

    useAppStore.setState({
      aiConfig: {
        providerId: 'deepseek',
        apiKey: '',
        baseUrl: 'https://api.deepseek.com',
        modelId: 'deepseek-chat',
        temperature: 0.7,
      },
      savedProviderSettings: {
        deepseek: {
          apiKey: 'deep-key',
          baseUrl: 'https://api.deepseek.com',
          modelId: 'deepseek-chat',
          temperature: 0.7,
        },
        openai: {
          apiKey: 'open-key',
          baseUrl: 'https://api.openai.com/v1',
          modelId: 'gpt-4o',
          temperature: 0.7,
        },
      },
    });

    useAppStore.getState().renameAIProvider('deepseek', 'deepseek-new');
    expect(useAppStore.getState().savedProviderSettings.deepseek).toBeUndefined();
    expect(useAppStore.getState().savedProviderSettings['deepseek-new']).toBeDefined();
    expect(useAppStore.getState().aiConfig.providerId).toBe('deepseek-new');

    const snapshot = useAppStore.getState().savedProviderSettings;
    useAppStore.getState().renameAIProvider('deepseek-new', 'deepseek-new');
    useAppStore.getState().renameAIProvider('deepseek-new', 'openai');
    useAppStore.getState().renameAIProvider('missing-provider', 'renamed');
    useAppStore.getState().renameAIProvider('deepseek-new', '   ');

    expect(useAppStore.getState().savedProviderSettings).toEqual(snapshot);
  });

  it('renameAIProvider keeps active provider when renaming a non-active provider', async () => {
    const useAppStore = await importFreshAppStore();

    useAppStore.setState({
      aiConfig: {
        providerId: 'openai',
        apiKey: '',
        baseUrl: 'https://api.openai.com/v1',
        modelId: 'gpt-4o',
        temperature: 0.7,
      },
      savedProviderSettings: {
        deepseek: {
          apiKey: 'deep-key',
          baseUrl: 'https://api.deepseek.com',
          modelId: 'deepseek-chat',
          temperature: 0.7,
        },
        openai: {
          apiKey: 'open-key',
          baseUrl: 'https://api.openai.com/v1',
          modelId: 'gpt-4o',
          temperature: 0.7,
        },
      },
    });

    useAppStore.getState().renameAIProvider('deepseek', 'deepseek-labs');
    expect(useAppStore.getState().aiConfig.providerId).toBe('openai');
    expect(useAppStore.getState().savedProviderSettings['deepseek-labs']).toBeDefined();
  });

  it('syncModels updates state on success and logs on failure', async () => {
    const useAppStore = await importFreshAppStore();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    fetchFromMirrorsMock.mockResolvedValueOnce({
      data: [
        {
          id: 'model-1',
          name: 'Model 1',
          provider: 'Other',
          contextLimit: 1000,
          inputPricePerMillion: 1,
          color: 'bg-gray-500',
        },
      ],
      sourceUrl: 'https://mirror.local/',
    });

    await useAppStore.getState().syncModels();
    expect(useAppStore.getState().models).toEqual([
      {
        id: 'model-1',
        name: 'Model 1',
        provider: 'Other',
        contextLimit: 1000,
        inputPricePerMillion: 1,
        color: 'bg-gray-500',
      },
    ]);
    expect(useAppStore.getState().lastUpdated).toBe(1700000000000);

    fetchFromMirrorsMock.mockRejectedValueOnce(new Error('mirror failed'));
    await useAppStore.getState().syncModels();
    expect(errorSpy).toHaveBeenCalledWith(
      '[AppStore] Failed to sync models from mirrors:',
      expect.any(Error)
    );

    const { DEFAULT_MODELS } = await import('@/store/useAppStore');
    useAppStore.getState().resetModels();
    expect(useAppStore.getState().models).toEqual(DEFAULT_MODELS);

    nowSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('updates shortcuts and logs when backend refresh fails', async () => {
    const useAppStore = await importFreshAppStore();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    invokeMock
      .mockRejectedValueOnce(new Error('spotlight shortcut failed'))
      .mockRejectedValueOnce(new Error('automator shortcut failed'));

    useAppStore.getState().setSpotlightShortcut('Ctrl+Shift+S');
    useAppStore.getState().setAutomatorShortcut('Ctrl+Shift+A');
    await Promise.resolve();

    expect(useAppStore.getState().spotlightShortcut).toBe('Ctrl+Shift+S');
    expect(useAppStore.getState().automatorShortcut).toBe('Ctrl+Shift+A');
    expect(invokeMock).toHaveBeenCalledWith('refresh_shortcuts');
    expect(errorSpy).toHaveBeenCalledWith(
      '[AppStore] Failed to refresh shortcuts after spotlight update:',
      expect.any(Error)
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[AppStore] Failed to refresh shortcuts after automator update:',
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it('merges search, refinery, and reminder settings', async () => {
    const useAppStore = await importFreshAppStore();

    useAppStore.getState().setSearchSettings({ defaultEngine: 'bing' });
    useAppStore.getState().setRefinerySettings({ strategy: 'both', maxCount: 1234 });
    useAppStore.getState().setRestReminder({ enabled: true, intervalMinutes: 30 });
    useAppStore.getState().setSpotlightAppearance({ width: 700 });
    useAppStore.getState().setWindowDestroyDelay(120);

    const state = useAppStore.getState();
    expect(state.searchSettings.defaultEngine).toBe('bing');
    expect(state.refinerySettings.strategy).toBe('both');
    expect(state.refinerySettings.maxCount).toBe(1234);
    expect(state.restReminder).toEqual({ enabled: true, intervalMinutes: 30 });
    expect(state.spotlightAppearance.width).toBe(700);
    expect(state.windowDestroyDelay).toBe(120);
  });
});
