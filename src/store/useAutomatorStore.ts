import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { fileStorage } from '@/lib/storage';
import { Workflow, DEFAULT_WORKFLOW, AutomatorAction } from '@/types/automator';

const PLUGIN_PREFIX = 'plugin:ctxrun-plugin-automator|';

interface AutomatorState {
  activeWorkflow: Workflow;
  isRunning: boolean;
  currentLoop: number;
  currentStepIndex: number;
  isPicking: boolean;

  setWorkflow: (workflow: Partial<Workflow>) => void;
  addAction: (action: AutomatorAction) => void;
  updateAction: (index: number, action: AutomatorAction) => void;
  removeAction: (index: number) => void;
  reorderActions: (oldIndex: number, newIndex: number) => void;

  start: () => Promise<void>;
  stop: () => Promise<void>;
  toggle: () => Promise<void>;

  pickLocation: () => Promise<void>;
  initListeners: () => Promise<void>;
  unlisten: () => void;

  _unlistenFns: UnlistenFn[];
}

export const useAutomatorStore = create<AutomatorState>()(
  persist(
    (set, get) => ({
      activeWorkflow: DEFAULT_WORKFLOW,
      isRunning: false,
      currentLoop: 0,
      currentStepIndex: -1,
      isPicking: false,
      _unlistenFns: [],

      setWorkflow: (updates) => set((state) => ({
        activeWorkflow: { ...state.activeWorkflow, ...updates }
      })),

      addAction: (action) => set((state) => ({
        activeWorkflow: {
          ...state.activeWorkflow,
          actions: [...state.activeWorkflow.actions, action]
        }
      })),

      updateAction: (index, action) => set((state) => {
        const newActions = [...state.activeWorkflow.actions];
        newActions[index] = action;
        return {
          activeWorkflow: { ...state.activeWorkflow, actions: newActions }
        };
      }),

      removeAction: (index) => set((state) => ({
        activeWorkflow: {
          ...state.activeWorkflow,
          actions: state.activeWorkflow.actions.filter((_, i) => i !== index)
        }
      })),

      reorderActions: (oldIndex, newIndex) => set((state) => {
        const items = Array.from(state.activeWorkflow.actions);
        const [reorderedItem] = items.splice(oldIndex, 1);
        items.splice(newIndex, 0, reorderedItem);
        return {
          activeWorkflow: { ...state.activeWorkflow, actions: items }
        };
      }),

      initListeners: async () => {
        if (get()._unlistenFns.length > 0) return;

        const unlistenStatus = await listen<boolean>('automator:status', (event) => {
          set({ isRunning: event.payload });
          if (!event.payload) {
             set({ currentStepIndex: -1 });
          }
        });

        const unlistenLoop = await listen<number>('automator:loop_count', (event) => {
          set({ currentLoop: event.payload });
        });

        const unlistenStep = await listen<number>('automator:step', (event) => {
          set({ currentStepIndex: event.payload });
        });

        set({ _unlistenFns: [unlistenStatus, unlistenLoop, unlistenStep] });
      },

      unlisten: () => {
        get()._unlistenFns.forEach(fn => fn());
        set({ _unlistenFns: [] });
      },

      start: async () => {
        const { activeWorkflow } = get();
        try {
          set({ currentLoop: 0, currentStepIndex: -1 });
          await invoke(`${PLUGIN_PREFIX}execute_workflow`, {
            workflow: {
                id: activeWorkflow.id,
                name: activeWorkflow.name,
                actions: activeWorkflow.actions,
                repeatCount: activeWorkflow.repeatCount
            }
          });
        } catch (e) {
          console.error("Failed to start workflow:", e);
        }
      },

      stop: async () => {
        try {
          await invoke(`${PLUGIN_PREFIX}stop_workflow`);
        } catch (e) {
          console.error("Failed to stop workflow:", e);
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
            const [x, y] = await invoke<[number, number]>(`${PLUGIN_PREFIX}get_mouse_position`);

            get().addAction({
                type: 'MoveTo',
                payload: { x, y }
            });

            set({ isPicking: false });
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
      partialize: (state) => ({
          activeWorkflow: state.activeWorkflow
      }),
    }
  )
);
