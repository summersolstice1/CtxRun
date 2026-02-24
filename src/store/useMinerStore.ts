// src/store/useMinerStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { fileStorage } from '@/lib/storage';
import { v4 as uuidv4 } from 'uuid';
import { MinerConfig, MinerProgressEvent, MinerFinishedEvent, MinerErrorEvent, MinerLog } from '@/types/miner';
import { useAppStore } from './useAppStore';

const PLUGIN_PREFIX = 'plugin:ctxrun-plugin-miner|';

// 默认配置
export const DEFAULT_MINER_CONFIG: MinerConfig = {
  url: 'https://react.dev/reference/react/',
  matchPrefix: 'https://react.dev/reference/react/',
  maxDepth: 2,
  maxPages: 100,
  concurrency: 5,
};

interface MinerState {
  config: MinerConfig;
  isRunning: boolean;
  progress: MinerProgressEvent | null;
  logs: MinerLog[];

  _unlistenFns: UnlistenFn[];

  // Actions
  setConfig: (updates: Partial<MinerConfig>) => void;
  startMining: () => Promise<void>;
  stopMining: () => Promise<void>;
  clearLogs: () => void;
  addLog: (type: MinerLog['type'], message: string, url?: string) => void;

  // Lifecycle
  initListeners: () => Promise<void>;
  unlisten: () => void;
}

export const useMinerStore = create<MinerState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_MINER_CONFIG,
      isRunning: false,
      progress: null,
      logs: [],
      _unlistenFns: [],

      setConfig: (updates) => set((state) => ({
        config: { ...state.config, ...updates }
      })),

      addLog: (type, message, url) => set((state) => {
        const newLog: MinerLog = { id: uuidv4(), timestamp: Date.now(), type, message, url };
        // 限制最多保存 200 条日志，防止内存溢出
        return { logs: [newLog, ...state.logs].slice(0, 200) };
      }),

      clearLogs: () => set({ logs: [], progress: null }),

      startMining: async () => {
        const { config, addLog } = get();
        const projectRoot = useAppStore.getState().projectRoot;
        if (!config.url || !config.matchPrefix) {
          addLog('error', 'Configuration incomplete (URL and Prefix are required).');
          return;
        }
        if (!projectRoot) {
          addLog('error', 'Please select a project root directory first.');
          return;
        }

        // 添加 outputDir 到配置（使用全局 projectRoot）
        const fullConfig = { ...config, outputDir: projectRoot };

        try {
          set({ isRunning: true, progress: null });
          addLog('info', `Starting miner engine for ${config.url}`);
          await invoke(`${PLUGIN_PREFIX}start_mining`, { config: fullConfig });
        } catch (e: any) {
          addLog('error', `Failed to start: ${e}`);
          set({ isRunning: false });
        }
      },

      stopMining: async () => {
        const { addLog } = get();
        try {
          addLog('warning', 'Sending stop signal to miner engine...');
          await invoke(`${PLUGIN_PREFIX}stop_mining`);
          // 注意：不要在这里直接把 isRunning 设为 false，等后端的 Finished 事件传来再设，保证优雅停机
        } catch (e: any) {
          addLog('error', `Failed to stop: ${e}`);
        }
      },

      initListeners: async () => {
        if (get()._unlistenFns.length > 0) return;

        const unlistenProgress = await listen<MinerProgressEvent>('miner:progress', (event) => {
          set({ progress: event.payload });
          if (event.payload.status === 'Saved') {
             get().addLog('success', `Saved: ${event.payload.currentUrl}`, event.payload.currentUrl);
          }
        });

        const unlistenFinished = await listen<MinerFinishedEvent>('miner:finished', (event) => {
          set({ isRunning: false, progress: null });
          get().addLog('info', `Task finished. Total pages saved: ${event.payload.totalPages}.`);
        });

        const unlistenError = await listen<MinerErrorEvent>('miner:error', (event) => {
          get().addLog('error', `Error: ${event.payload.message}`, event.payload.url);
        });

        set({ _unlistenFns: [unlistenProgress, unlistenFinished, unlistenError] });
      },

      unlisten: () => {
        get()._unlistenFns.forEach(fn => fn());
        set({ _unlistenFns: [] });
      }
    }),
    {
      name: 'miner-config',
      storage: createJSONStorage(() => fileStorage),
      // 只需要持久化用户的配置习惯，不需要持久化正在运行的日志和状态
      partialize: (state) => ({ config: state.config }),
    }
  )
);
