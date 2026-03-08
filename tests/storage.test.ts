import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  readTextFileMock,
  writeTextFileMock,
  mkdirMock,
  existsMock,
  readDirMock,
  removeMock,
} = vi.hoisted(() => ({
  readTextFileMock: vi.fn(),
  writeTextFileMock: vi.fn(),
  mkdirMock: vi.fn(),
  existsMock: vi.fn(),
  readDirMock: vi.fn(),
  removeMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
  mkdir: mkdirMock,
  exists: existsMock,
  readDir: readDirMock,
  remove: removeMock,
  BaseDirectory: { AppLocalData: 'AppLocalData' },
}));

type FileStorage = typeof import('@/lib/storage')['fileStorage'];

async function importFreshStorage(): Promise<FileStorage> {
  vi.resetModules();
  const mod = await import('@/lib/storage');
  return mod.fileStorage;
}

describe('fileStorage', () => {
  beforeEach(() => {
    readTextFileMock.mockReset();
    writeTextFileMock.mockReset();
    mkdirMock.mockReset();
    existsMock.mockReset();
    readDirMock.mockReset();
    removeMock.mockReset();
  });

  it('getItem returns null when file does not exist', async () => {
    existsMock.mockResolvedValue(false);
    const fileStorage = await importFreshStorage();

    const result = await fileStorage.getItem('app-config');
    expect(result).toBeNull();
    expect(readTextFileMock).not.toHaveBeenCalled();
  });

  it('setItem creates base dir when missing and writes json file', async () => {
    existsMock.mockResolvedValue(false);
    writeTextFileMock.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    const fileStorage = await importFreshStorage();

    await fileStorage.setItem('app-config', '{"theme":"dark"}');

    expect(mkdirMock).toHaveBeenCalledWith(
      '',
      expect.objectContaining({ baseDir: 'AppLocalData', recursive: true })
    );
    expect(writeTextFileMock).toHaveBeenCalledWith(
      'app-config.json',
      '{"theme":"dark"}',
      expect.objectContaining({ baseDir: 'AppLocalData' })
    );
  });

  it('removeItem removes only when target file exists', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    removeMock.mockResolvedValue(undefined);
    const fileStorage = await importFreshStorage();

    await fileStorage.removeItem('app-config');
    await fileStorage.removeItem('missing');

    expect(removeMock).toHaveBeenCalledTimes(1);
    expect(removeMock).toHaveBeenCalledWith(
      'app-config.json',
      expect.objectContaining({ baseDir: 'AppLocalData' })
    );
  });

  it('packs listInstalled filters only json files', async () => {
    existsMock.mockResolvedValue(true);
    readDirMock.mockResolvedValue([
      { name: 'a.json' },
      { name: 'b.txt' },
      { name: undefined },
      { name: 'c.json' },
    ]);
    const fileStorage = await importFreshStorage();

    const files = await fileStorage.packs.listInstalled();
    expect(files).toEqual(['a.json', 'c.json']);
  });

  it('packs save/read/remove use packs subdir paths', async () => {
    existsMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);
    writeTextFileMock.mockResolvedValue(undefined);
    readTextFileMock.mockResolvedValue('{"name":"Pack"}');
    removeMock.mockResolvedValue(undefined);
    const fileStorage = await importFreshStorage();

    await fileStorage.packs.savePack('demo.json', '{"name":"Pack"}');
    const content = await fileStorage.packs.readPack('demo.json');
    await fileStorage.packs.removePack('demo.json');

    expect(writeTextFileMock).toHaveBeenCalledWith(
      'packs/demo.json',
      '{"name":"Pack"}',
      expect.objectContaining({ baseDir: 'AppLocalData' })
    );
    expect(content).toBe('{"name":"Pack"}');
    expect(removeMock).toHaveBeenCalledWith(
      'packs/demo.json',
      expect.objectContaining({ baseDir: 'AppLocalData' })
    );
  });
});
