import { describe, expect, it, vi } from 'vitest';

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

type FsHelperModule = typeof import('@/lib/fs_helper');

async function importFreshFsHelper(): Promise<FsHelperModule> {
  vi.resetModules();
  return import('@/lib/fs_helper');
}

describe('scanProject', () => {
  it('calls plugin command with default options', async () => {
    const { scanProject } = await importFreshFsHelper();
    const config = { dirs: ['node_modules'], files: [], extensions: ['log'] };
    const response = { nodes: [], capped: false, scannedEntries: 1, maxEntries: 100000 };
    invokeMock.mockResolvedValue(response);

    const result = await scanProject('/repo', config);

    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-context|scan_project_tree',
      {
        projectRoot: '/repo',
        ignore: config,
        syncIgnoreFiles: false,
        maxDepth: 24,
        maxEntries: 100000,
      }
    );
    expect(result).toEqual(response);
  });

  it('passes through custom options', async () => {
    const { scanProject } = await importFreshFsHelper();
    const config = { dirs: [], files: ['a.txt'], extensions: [] };
    invokeMock.mockResolvedValue({ nodes: [], capped: true, scannedEntries: 2, maxEntries: 5 });

    await scanProject('/repo', config, {
      syncIgnoreFiles: true,
      maxDepth: 6,
      maxEntries: 5,
    });

    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-context|scan_project_tree',
      expect.objectContaining({
        syncIgnoreFiles: true,
        maxDepth: 6,
        maxEntries: 5,
      })
    );
  });
});
