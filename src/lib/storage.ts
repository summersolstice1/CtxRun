import {
  readTextFile,
  writeTextFile,
  mkdir,
  exists,
  readDir,
  remove,
  BaseDirectory
} from '@tauri-apps/plugin-fs';

const BASE_DIR_OPT = { baseDir: BaseDirectory.AppLocalData };
const PACKS_SUBDIR = 'packs';

export const fileStorage = {
  getItem: async (name: string): Promise<string | null> => {
    const fileName = `${name}.json`;
    try {
      const fileExists = await exists(fileName, BASE_DIR_OPT);
      if (!fileExists) return null;

      return await readTextFile(fileName, BASE_DIR_OPT);
    } catch (err) {
      return null;
    }
  },

  setItem: async (name: string, value: string): Promise<void> => {
    const fileName = `${name}.json`;
    try {
      const rootExists = await exists('', BASE_DIR_OPT);
      if (!rootExists) {
         await mkdir('', { ...BASE_DIR_OPT, recursive: true });
      }

      await writeTextFile(fileName, value, BASE_DIR_OPT);
    } catch (err) {
    }
  },

  removeItem: async (name: string): Promise<void> => {
    const fileName = `${name}.json`;
    try {
      if (await exists(fileName, BASE_DIR_OPT)) {
        await remove(fileName, BASE_DIR_OPT);
      }
    } catch (err) {
    }
  },

  packs: {
    ensureDir: async () => {
      try {
        if (!(await exists(PACKS_SUBDIR, BASE_DIR_OPT))) {
          await mkdir(PACKS_SUBDIR, { ...BASE_DIR_OPT, recursive: true });
        }
      } catch (e) {
      }
    },

    savePack: async (filename: string, content: string) => {
      try {
        await fileStorage.packs.ensureDir();
        await writeTextFile(`${PACKS_SUBDIR}/${filename}`, content, BASE_DIR_OPT);
      } catch (e) {
        throw e;
      }
    },

    readPack: async (filename: string): Promise<string | null> => {
      try {
        const filePath = `${PACKS_SUBDIR}/${filename}`;
        if (await exists(filePath, BASE_DIR_OPT)) {
          return await readTextFile(filePath, BASE_DIR_OPT);
        }
        return null;
      } catch (e) {
        return null;
      }
    },

    listInstalled: async (): Promise<string[]> => {
      try {
        await fileStorage.packs.ensureDir();
        const entries = await readDir(PACKS_SUBDIR, BASE_DIR_OPT);
        return entries
          .map(e => e.name || '')
          .filter(n => n.endsWith('.json'));
      } catch (e) {
        return [];
      }
    },

    removePack: async (filename: string) => {
      try {
        const filePath = `${PACKS_SUBDIR}/${filename}`;
        if(await exists(filePath, BASE_DIR_OPT)) {
            await remove(filePath, BASE_DIR_OPT);
        }
      } catch (e) {
      }
    }
  }
};
