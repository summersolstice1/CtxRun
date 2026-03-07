import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { fileStorage } from '@/lib/storage';
import { IgnoreConfig, DEFAULT_PROJECT_IGNORE, FileNode } from '@/types/context';
import { invoke } from '@tauri-apps/api/core';

const CONTEXT_PLUGIN_PREFIX = 'plugin:ctxrun-plugin-context|';
let projectConfigLoadSeq = 0;
let projectIgnoreEditSeq = 0;

const setAllChildren = (node: FileNode, isSelected: boolean): FileNode => {
  const newNode = { ...node, isSelected };
  if (newNode.children) {
    newNode.children = newNode.children.map(child => setAllChildren(child, isSelected));
  }
  return newNode;
};

const updateNodeState = (nodes: FileNode[], targetId: string, isSelected: boolean): FileNode[] => {
  return nodes.map(node => {
    if (node.id === targetId) {
      return setAllChildren(node, isSelected);
    }
    if (node.children) {
      return {
        ...node,
        children: updateNodeState(node.children, targetId, isSelected)
      };
    }
    return node;
  });
};

const invertTreeSelection = (nodes: FileNode[]): FileNode[] => {
  return nodes.map(node => {
    if (node.isLocked) return node;

    return {
      ...node,
      isSelected: !node.isSelected,
      children: node.children ? invertTreeSelection(node.children) : undefined
    };
  });
};

const collectDirIds = (nodes: FileNode[]): string[] => {
  let ids: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'dir') {
      ids.push(node.id);
      if (node.children) ids = ids.concat(collectDirIds(node.children));
    }
  }
  return ids;
};

interface ContextState {
  projectIgnore: IgnoreConfig;
  removeComments: boolean;

  projectRoot: string | null;
  fileTree: FileNode[];
  isScanning: boolean;
  detectSecrets: boolean;

  // 展开状态管理
  expandedIds: string[];
  toggleExpand: (id: string) => void;
  setAllExpanded: (expanded: boolean) => void;

  setProjectRoot: (path: string) => Promise<void>;
  setFileTree: (tree: FileNode[]) => void;
  setIsScanning: (status: boolean) => void;

  updateProjectIgnore: (type: keyof IgnoreConfig, action: 'add' | 'remove', value: string) => void;
  resetProjectIgnore: () => void;
  refreshTreeStatus: (globalConfig: IgnoreConfig) => Promise<void>;
  toggleSelect: (nodeId: string, checked: boolean) => void;
  invertSelection: () => void;
  setRemoveComments: (enable: boolean) => void;
  setDetectSecrets: (enable: boolean) => void;

  // Git ignore 同步相关
  isIgnoreSyncActive: boolean;
  hasProjectIgnoreFiles: boolean;
  toggleIgnoreSync: () => void;
  checkIgnoreFiles: (projectRoot?: string) => Promise<void>;
}

export const useContextStore = create<ContextState>()(
  persist(
    (set, get) => ({
      projectIgnore: DEFAULT_PROJECT_IGNORE,
      removeComments: false,
      detectSecrets: true,
      projectRoot: null,
      fileTree: [],
      isScanning: false,
      isIgnoreSyncActive: false,
      hasProjectIgnoreFiles: false,

      expandedIds: [],

      // 展开/折叠逻辑
      toggleExpand: (id) => set((state) => {
        const exists = state.expandedIds.includes(id);
        if (exists) {
          return { expandedIds: state.expandedIds.filter(i => i !== id) };
        } else {
          return { expandedIds: [...state.expandedIds, id] };
        }
      }),

      setAllExpanded: (expanded) => {
        if (!expanded) {
          set({ expandedIds: [] });
          return;
        }
        set((state) => ({ expandedIds: collectDirIds(state.fileTree) }));
      },

      setProjectRoot: async (path) => {
        if (get().projectRoot === path) {
          return;
        }

        set({ projectRoot: path, projectIgnore: DEFAULT_PROJECT_IGNORE });
        const loadSeq = ++projectConfigLoadSeq;
        const editSeqAtStart = projectIgnoreEditSeq;

        try {
          const savedConfig = await invoke<IgnoreConfig | null>('get_project_config', { path });
          const latest = get();
          if (
            latest.projectRoot !== path ||
            loadSeq !== projectConfigLoadSeq ||
            editSeqAtStart !== projectIgnoreEditSeq
          ) {
            return;
          }
          set({ projectIgnore: savedConfig ?? DEFAULT_PROJECT_IGNORE });
        } catch (e) {
          const latest = get();
          if (
            latest.projectRoot !== path ||
            loadSeq !== projectConfigLoadSeq ||
            editSeqAtStart !== projectIgnoreEditSeq
          ) {
            return;
          }
          set({ projectIgnore: DEFAULT_PROJECT_IGNORE });
        }
      },
      setFileTree: (tree) => set({ fileTree: tree }),
      setIsScanning: (status) => set({ isScanning: status }),

      updateProjectIgnore: (type, action, value) => {
        projectIgnoreEditSeq += 1;
        set((state) => {
          const currentList = state.projectIgnore[type];
          let newList = currentList;
          if (action === 'add' && !currentList.includes(value)) {
            newList = [...currentList, value];
          } else if (action === 'remove') {
            newList = currentList.filter(item => item !== value);
          }

          const newProjectIgnore = { ...state.projectIgnore, [type]: newList };

          if (state.projectRoot) {
            invoke('save_project_config', { path: state.projectRoot, config: newProjectIgnore })
              .catch(() => {});
          }

          return { projectIgnore: newProjectIgnore };
        });
      },

      resetProjectIgnore: () => {
        projectIgnoreEditSeq += 1;
        set((state) => {
          if (state.projectRoot) {
            invoke('save_project_config', { path: state.projectRoot, config: DEFAULT_PROJECT_IGNORE })
              .catch(() => {});
          }
          return { projectIgnore: DEFAULT_PROJECT_IGNORE };
        });
      },

      refreshTreeStatus: async (globalConfig) => {
        const state = get();
        const { fileTree, isIgnoreSyncActive } = state;

        const applyStatus = (nodes: FileNode[], parentLocked = false, parentGitIgnored = false): FileNode[] => {
          return nodes.map(node => {
            let isConfigIgnored = parentLocked ||
                                  state.projectIgnore.dirs.includes(node.name) ||
                                  globalConfig.dirs.includes(node.name);
            if (node.kind === 'file') {
              isConfigIgnored = isConfigIgnored ||
                                state.projectIgnore.files.includes(node.name) ||
                                globalConfig.files.includes(node.name);
              const ext = node.name.split('.').pop()?.toLowerCase();
              if (ext) {
                isConfigIgnored = isConfigIgnored ||
                                  state.projectIgnore.extensions.includes(ext) ||
                                  globalConfig.extensions.includes(ext);
              }
            }

            // Git ignore 状态由扫描阶段产出，这里只做继承和开关控制。
            const isNodeGitIgnored = isIgnoreSyncActive && (node.ignoreSource === 'git' || parentGitIgnored);
            const shouldLock = isConfigIgnored || isNodeGitIgnored;
            const shouldAutoReselect = !isIgnoreSyncActive && node.ignoreSource === 'git' && !isConfigIgnored;

            let ignoreSource: 'git' | 'filter' | undefined = undefined;
            if (shouldLock) {
              ignoreSource = isNodeGitIgnored ? 'git' : 'filter';
            }

            const newNode: FileNode = {
              ...node,
              isSelected: shouldLock ? false : (shouldAutoReselect ? true : node.isSelected),
              isLocked: shouldLock,
              ignoreSource,
            };

            if (newNode.children) {
              newNode.children = applyStatus(newNode.children, shouldLock, isNodeGitIgnored);
            }
            return newNode;
          });
        };

        set({ fileTree: applyStatus(fileTree) });
      },

      toggleSelect: (nodeId, checked) => set((state) => ({
        fileTree: updateNodeState(state.fileTree, nodeId, checked)
      })),

      invertSelection: () => set((state) => ({
        fileTree: invertTreeSelection(state.fileTree)
      })),

      setRemoveComments: (enable) => set({ removeComments: enable }),
      setDetectSecrets: (enable) => set({ detectSecrets: enable }),

      // 切换开关
      toggleIgnoreSync: () => {
        set((state) => ({ isIgnoreSyncActive: !state.isIgnoreSyncActive }));
      },

      // 探测项目是否有 ignore 文件
      checkIgnoreFiles: async (projectRoot) => {
        const state = get();
        const root = projectRoot ?? state.projectRoot;
        if (!root) return;
        const hasFiles = await invoke<boolean>(`${CONTEXT_PLUGIN_PREFIX}has_ignore_files`, { projectRoot: root });
        set({ hasProjectIgnoreFiles: hasFiles });
      },
    }),
    {
      name: 'context-config',
      storage: createJSONStorage(() => fileStorage),
      partialize: (state) => ({
        projectRoot: state.projectRoot,
        removeComments: state.removeComments,
        detectSecrets: state.detectSecrets,
        expandedIds: state.expandedIds,
        isIgnoreSyncActive: state.isIgnoreSyncActive,
      }),
    }
  )
);
