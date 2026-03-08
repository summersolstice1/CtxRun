import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

type PreviewStore = typeof import('@/store/usePreviewStore')['usePreviewStore'];

async function importFreshPreviewStore(): Promise<PreviewStore> {
  vi.resetModules();
  const mod = await import('@/store/usePreviewStore');
  return mod.usePreviewStore;
}

describe('usePreviewStore', () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it('openPreview loads metadata successfully and clears loading state', async () => {
    invokeMock.mockResolvedValue({
      path: '/tmp/a.txt',
      name: 'a.txt',
      size: 12,
      ext: 'txt',
      kind: 'text',
      language: 'plaintext',
      mime: 'text/plain',
      isBinary: false,
      isMedia: false,
      canPreview: true,
      absolutePath: '/tmp/a.txt',
    });

    const usePreviewStore = await importFreshPreviewStore();
    await usePreviewStore.getState().openPreview('/tmp/a.txt');

    const state = usePreviewStore.getState();
    expect(invokeMock).toHaveBeenCalledWith('get_file_meta', { path: '/tmp/a.txt' });
    expect(state.isOpen).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.activeFile?.name).toBe('a.txt');
  });

  it('openPreview stores error message on invoke failure', async () => {
    invokeMock.mockRejectedValue(new Error('boom'));

    const usePreviewStore = await importFreshPreviewStore();
    await usePreviewStore.getState().openPreview('/tmp/missing.txt');

    const state = usePreviewStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.activeFile).toBeNull();
    expect(state.error).toContain('boom');
  });

  it('closePreview closes dialog and clears active file', async () => {
    invokeMock.mockResolvedValue({
      path: '/tmp/b.txt',
      name: 'b.txt',
      size: 10,
      ext: 'txt',
      kind: 'text',
      language: 'plaintext',
      mime: 'text/plain',
      isBinary: false,
      isMedia: false,
      canPreview: true,
      absolutePath: '/tmp/b.txt',
    });

    const usePreviewStore = await importFreshPreviewStore();
    await usePreviewStore.getState().openPreview('/tmp/b.txt');
    usePreviewStore.getState().closePreview();

    const state = usePreviewStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.activeFile).toBeNull();
  });
});
