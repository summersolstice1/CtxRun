import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { fileStorage } from '@/lib/storage';
import { ClickerConfig, DEFAULT_CLICKER_CONFIG } from '@/types/automator';

interface AutomatorState {
  config: ClickerConfig;
  isRunning: boolean;
  clickCount: number;
  isPicking: boolean; // 是否正在倒计时拾取坐标

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

        // 监听运行状态变化（例如被后端死人开关强制停止）
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
          // 重置计数
          set({ clickCount: 0 });
          await invoke('start_clicker', { config });
        } catch (e) {
          console.error("Failed to start clicker:", e);
        }
      },

      stop: async () => {
        try {
          await invoke('stop_clicker');
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

        // 给予用户 3 秒时间移动鼠标
        setTimeout(async () => {
          try {
            const [x, y] = await invoke<[number, number]>('get_mouse_position');
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
      // 只持久化配置，不持久化运行状态
      partialize: (state) => ({ config: state.config }),
    }
  )
);
