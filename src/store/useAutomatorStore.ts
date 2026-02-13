import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { fileStorage } from '@/lib/storage';
import { ClickerConfig, DEFAULT_CLICKER_CONFIG } from '@/types/automator';

// 定义插件调用的前缀
const PLUGIN_PREFIX = 'plugin:ctxrun-plugin-automator|';

interface AutomatorState {
  config: ClickerConfig;
  isRunning: boolean;
  clickCount: number;
  isPicking: boolean;

  // Actions
  setConfig: (config: Partial<ClickerConfig>) => void;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  toggle: () => Promise<void>;
  pickLocation: () => Promise<void>;
  
  // Lifecycle
  initListeners: () => Promise<void>;
  unlisten: () => void;
  _unlistenFns: UnlistenFn[];
}

export const useAutomatorStore = create<AutomatorState>()(
  persist(
    (set, get) => ({
      config: DEFAULT_CLICKER_CONFIG,
      isRunning: false,
      clickCount: 0,
      isPicking: false,
      _unlistenFns: [],

      setConfig: (newConfig) => set((state) => ({
        config: { ...state.config, ...newConfig }
      })),

      initListeners: async () => {
        if (get()._unlistenFns.length > 0) return;

        // 监听运行状态 (事件名称保持不变，因为 Rust 端是全局 emit)
        const unlistenStatus = await listen<boolean>('automator:status', (event) => {
          set({ isRunning: event.payload });
        });

        // 监听点击计数
        const unlistenCount = await listen<number>('automator:count', (event) => {
          set({ clickCount: event.payload });
        });

        set({ _unlistenFns: [unlistenStatus, unlistenCount] });
      },

      unlisten: () => {
        get()._unlistenFns.forEach(fn => fn());
        set({ _unlistenFns: [] });
      },

      start: async () => {
        const { config } = get();
        try {
          set({ clickCount: 0 });
          // [修改点] 添加插件前缀
          await invoke(`${PLUGIN_PREFIX}start_clicker`, { config });
        } catch (e) {
          console.error("Failed to start clicker:", e);
        }
      },

      stop: async () => {
        try {
          // [修改点] 添加插件前缀
          await invoke(`${PLUGIN_PREFIX}stop_clicker`);
        } catch (e) {
          console.error("Failed to stop clicker:", e);
        }
      },

      toggle: async () => {
        const { isRunning, start, stop } = get();
        if (isRunning) {
          await stop();
        } else {
          await start();
        }
      },

      pickLocation: async () => {
        set({ isPicking: true });
        
        setTimeout(async () => {
          try {
            // [修改点] 添加插件前缀
            const [x, y] = await invoke<[number, number]>(`${PLUGIN_PREFIX}get_mouse_position`);
            set((state) => ({
              isPicking: false,
              config: {
                ...state.config,
                useFixedLocation: true,
                fixedX: x,
                fixedY: y
              }
            }));
          } catch (e) {
            console.error("Failed to pick location:", e);
            set({ isPicking: false });
          }
        }, 3000);
      }
    }),
    {
      name: 'automator-config',
      storage: createJSONStorage(() => fileStorage),
      partialize: (state) => ({ config: state.config }),
    }
  )
);