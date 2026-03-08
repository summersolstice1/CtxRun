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
});
