import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  emitMock,
  invokeMock,
  fetchFromMirrorsMock,
  changeLanguageMock,
  storageMap,
} = vi.hoisted(() => ({
  emitMock: vi.fn(),
  invokeMock: vi.fn(),
  fetchFromMirrorsMock: vi.fn(),
  changeLanguageMock: vi.fn(),
  storageMap: new Map<string, string>(),
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
});
