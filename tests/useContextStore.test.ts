import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_PROJECT_IGNORE, FileNode } from '@/types/context';

const { invokeMock, storageMap } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  storageMap: new Map<string, string>(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
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

type ContextStore = typeof import('@/store/useContextStore')['useContextStore'];

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function importFreshContextStore(): Promise<ContextStore> {
  vi.resetModules();
  const mod = await import('@/store/useContextStore');
  return mod.useContextStore;
}

function makeNode(overrides: Partial<FileNode>): FileNode {
  return {
    id: 'n',
    name: 'node',
    path: '/node',
    kind: 'file',
    isSelected: true,
    ...overrides,
  };
}

describe('useContextStore', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    storageMap.clear();
  });

  it('setProjectRoot keeps newest config when older request resolves later', async () => {
    const first = deferred<any>();
    const second = deferred<any>();

    invokeMock.mockImplementation((command: string, args: any) => {
      if (command !== 'get_project_config') return Promise.resolve(null);
      if (args.path === '/project-a') return first.promise;
      if (args.path === '/project-b') return second.promise;
      return Promise.resolve(null);
    });

    const useContextStore = await importFreshContextStore();
    const firstLoad = useContextStore.getState().setProjectRoot('/project-a');
    const secondLoad = useContextStore.getState().setProjectRoot('/project-b');

    second.resolve({ dirs: ['b'], files: [], extensions: [] });
    await secondLoad;

    first.resolve({ dirs: ['a'], files: [], extensions: [] });
    await firstLoad;

    const state = useContextStore.getState();
    expect(state.projectRoot).toBe('/project-b');
    expect(state.projectIgnore).toEqual({ dirs: ['b'], files: [], extensions: [] });
  });

  it('updateProjectIgnore deduplicates add operations and persists config', async () => {
    invokeMock.mockResolvedValue(null);
    const useContextStore = await importFreshContextStore();

    useContextStore.setState({
      projectRoot: '/project',
      projectIgnore: { dirs: [], files: [], extensions: [] },
    });

    useContextStore.getState().updateProjectIgnore('dirs', 'add', 'dist');
    useContextStore.getState().updateProjectIgnore('dirs', 'add', 'dist');
    useContextStore.getState().updateProjectIgnore('dirs', 'remove', 'dist');

    const state = useContextStore.getState();
    expect(state.projectIgnore.dirs).toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith(
      'save_project_config',
      expect.objectContaining({
        path: '/project',
      })
    );
  });

  it('refreshTreeStatus applies config lock and git-ignore lock correctly', async () => {
    const useContextStore = await importFreshContextStore();
    useContextStore.setState({
      projectIgnore: { dirs: [], files: ['secret.txt'], extensions: [] },
      isIgnoreSyncActive: false,
      fileTree: [
        makeNode({
          id: 'secret',
          name: 'secret.txt',
          path: '/secret.txt',
          kind: 'file',
          isSelected: true,
        }),
        makeNode({
          id: 'git-file',
          name: 'git-only.txt',
          path: '/git-only.txt',
          kind: 'file',
          isSelected: false,
          ignoreSource: 'git',
        }),
      ],
    });

    await useContextStore.getState().refreshTreeStatus(DEFAULT_PROJECT_IGNORE);
    let state = useContextStore.getState();
    const secret = state.fileTree.find((x) => x.id === 'secret')!;
    const gitOnly = state.fileTree.find((x) => x.id === 'git-file')!;

    expect(secret.isLocked).toBe(true);
    expect(secret.isSelected).toBe(false);
    expect(secret.ignoreSource).toBe('filter');

    expect(gitOnly.isLocked).toBe(false);
    expect(gitOnly.isSelected).toBe(true);
    expect(gitOnly.ignoreSource).toBeUndefined();

    useContextStore.setState({
      isIgnoreSyncActive: true,
      fileTree: [
        makeNode({
          id: 'git-file',
          name: 'git-only.txt',
          path: '/git-only.txt',
          kind: 'file',
          isSelected: true,
          ignoreSource: 'git',
        }),
      ],
    });
    await useContextStore.getState().refreshTreeStatus(DEFAULT_PROJECT_IGNORE);
    state = useContextStore.getState();
    const gitLocked = state.fileTree.find((x) => x.id === 'git-file')!;
    expect(gitLocked.isLocked).toBe(true);
    expect(gitLocked.isSelected).toBe(false);
    expect(gitLocked.ignoreSource).toBe('git');
  });

  it('setAllExpanded collects only directory ids and supports collapse all', async () => {
    const useContextStore = await importFreshContextStore();
    useContextStore.setState({
      fileTree: [
        makeNode({
          id: 'dir-1',
          name: 'src',
          kind: 'dir',
          children: [
            makeNode({ id: 'file-1', name: 'a.ts', path: '/src/a.ts' }),
            makeNode({
              id: 'dir-2',
              name: 'nested',
              kind: 'dir',
              children: [makeNode({ id: 'file-2', name: 'b.ts', path: '/src/nested/b.ts' })],
            }),
          ],
        }),
      ],
      expandedIds: [],
    });

    useContextStore.getState().setAllExpanded(true);
    expect(useContextStore.getState().expandedIds.sort()).toEqual(['dir-1', 'dir-2']);

    useContextStore.getState().setAllExpanded(false);
    expect(useContextStore.getState().expandedIds).toEqual([]);
  });
});
