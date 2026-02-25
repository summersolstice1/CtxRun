import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { fileStorage } from '@/lib/storage';
import { Workflow, AutomatorAction } from '@/types/automator';

const PLUGIN_PREFIX = 'plugin:ctxrun-plugin-automator|';

interface AutomatorState {
  // Multi-workflow management
  workflows: Workflow[];
  activeWorkflowId: string;

  // Runtime state (not persisted)
  isRunning: boolean;
  currentLoop: number;
  currentStepIndex: number;
  isPicking: boolean;
  _unlistenFns: UnlistenFn[];

  // Workflow CRUD
  createWorkflow: (name?: string) => string;
  deleteWorkflow: (id: string) => void;
  duplicateWorkflow: (id: string) => string;
  renameWorkflow: (id: string, name: string) => void;
  switchWorkflow: (id: string) => void;

  // Current workflow operations
  getCurrentWorkflow: () => Workflow;
  updateCurrentWorkflow: (updates: Partial<Workflow>) => void;

  // Legacy action operations (for backward compatibility)
  addAction: (action: AutomatorAction) => void;
  updateAction: (index: number, action: AutomatorAction) => void;
  removeAction: (index: number) => void;
  reorderActions: (oldIndex: number, newIndex: number) => void;

  // Flow graph state management
  setFlowNodes: (nodes: any[]) => void;
  setFlowEdges: (edges: any[]) => void;
  updateFlowState: (nodes: any[], edges: any[]) => void;

  // Execution
  start: () => Promise<void>;
  stop: () => Promise<void>;
  toggle: () => Promise<void>;

  // Utilities
  pickLocation: () => Promise<void>;
  initListeners: () => Promise<void>;
  unlisten: () => void;
}

const generateId = () => `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

const createDefaultWorkflow = (name?: string): Workflow => ({
  id: generateId(),
  name: name || `Workflow ${new Date().toLocaleString()}`,
  actions: [],
  repeatCount: 1,
  flowNodes: [],
  flowEdges: [],
  meta: {
    createdAt: Date.now(),
  }
});

export const useAutomatorStore = create<AutomatorState>()(
  persist(
    (set, get) => ({
      // Initial state with one default workflow
      workflows: [createDefaultWorkflow('Default Workflow')],
      activeWorkflowId: '',

      isRunning: false,
      currentLoop: 0,
      currentStepIndex: -1,
      isPicking: false,
      _unlistenFns: [],

      // Initialize activeWorkflowId if empty
      ...((() => {
        const state = get();
        if (!state?.activeWorkflowId && state?.workflows?.length > 0) {
          return { activeWorkflowId: state.workflows[0].id };
        }
        return {};
      })()),

      // Workflow CRUD
      createWorkflow: (name) => {
        const newWorkflow = createDefaultWorkflow(name);
        set((state) => ({
          workflows: [...state.workflows, newWorkflow],
          activeWorkflowId: newWorkflow.id,
        }));
        return newWorkflow.id;
      },

      deleteWorkflow: (id) => set((state) => {
        const filtered = state.workflows.filter(w => w.id !== id);
        if (filtered.length === 0) {
          // Always keep at least one workflow
          const newWorkflow = createDefaultWorkflow('Default Workflow');
          return {
            workflows: [newWorkflow],
            activeWorkflowId: newWorkflow.id,
          };
        }
        // If deleting active workflow, switch to first remaining
        const newActiveId = state.activeWorkflowId === id
          ? filtered[0].id
          : state.activeWorkflowId;
        return {
          workflows: filtered,
          activeWorkflowId: newActiveId,
        };
      }),

      duplicateWorkflow: (id) => {
        const state = get();
        const original = state.workflows.find(w => w.id === id);
        if (!original) return '';

        const duplicate: Workflow = {
          ...original,
          id: generateId(),
          name: `${original.name} (Copy)`,
          meta: {
            ...original.meta,
            createdAt: Date.now(),
          }
        };

        set((state) => ({
          workflows: [...state.workflows, duplicate],
          activeWorkflowId: duplicate.id,
        }));
        return duplicate.id;
      },

      renameWorkflow: (id, name) => set((state) => ({
        workflows: state.workflows.map(w =>
          w.id === id ? { ...w, name } : w
        )
      })),

      switchWorkflow: (id) => set({ activeWorkflowId: id }),

      getCurrentWorkflow: () => {
        const state = get();
        return state.workflows.find(w => w.id === state.activeWorkflowId)
          || state.workflows[0]
          || createDefaultWorkflow();
      },

      updateCurrentWorkflow: (updates) => set((state) => ({
        workflows: state.workflows.map(w =>
          w.id === state.activeWorkflowId ? { ...w, ...updates } : w
        )
      })),

      // Legacy action operations (operate on current workflow)
      addAction: (action) => {
        const current = get().getCurrentWorkflow();
        get().updateCurrentWorkflow({
          actions: [...current.actions, action]
        });
      },

      updateAction: (index, action) => {
        const current = get().getCurrentWorkflow();
        const newActions = [...current.actions];
        newActions[index] = action;
        get().updateCurrentWorkflow({ actions: newActions });
      },

      removeAction: (index) => {
        const current = get().getCurrentWorkflow();
        get().updateCurrentWorkflow({
          actions: current.actions.filter((_, i) => i !== index)
        });
      },

      reorderActions: (oldIndex, newIndex) => {
        const current = get().getCurrentWorkflow();
        const items = Array.from(current.actions);
        const [reorderedItem] = items.splice(oldIndex, 1);
        items.splice(newIndex, 0, reorderedItem);
        get().updateCurrentWorkflow({ actions: items });
      },

      setFlowNodes: (nodes) => {
        get().updateCurrentWorkflow({ flowNodes: nodes });
      },

      setFlowEdges: (edges) => {
        get().updateCurrentWorkflow({ flowEdges: edges });
      },

      updateFlowState: (nodes, edges) => {
        get().updateCurrentWorkflow({ flowNodes: nodes, flowEdges: edges });
      },

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
        const current = get().getCurrentWorkflow();
        try {
          set({ currentLoop: 0, currentStepIndex: -1 });
          await invoke(`${PLUGIN_PREFIX}execute_workflow`, {
            workflow: {
                id: current.id,
                name: current.name,
                actions: current.actions,
                repeatCount: current.repeatCount
            }
          });
        } catch (e) {
          console.error('Failed to start workflow:', e);
        }
      },

      stop: async () => {
        try {
          await invoke(`${PLUGIN_PREFIX}stop_workflow`);
        } catch (e) {
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
                payload: {
                    target: { type: 'Coordinate', x, y }
                }
            });

            set({ isPicking: false });
          } catch (e) {
            set({ isPicking: false });
          }
        }, 3000);
      }
    }),
    {
      name: 'automator-config',
      storage: createJSONStorage(() => fileStorage),
      partialize: (state) => ({
        workflows: state.workflows,
        activeWorkflowId: state.activeWorkflowId,
      }),
      onRehydrateStorage: () => (state) => {
        // Ensure activeWorkflowId is valid after rehydration
        if (state && state.workflows.length > 0) {
          const hasActiveWorkflow = state.workflows.some(w => w.id === state.activeWorkflowId);
          if (!hasActiveWorkflow) {
            state.activeWorkflowId = state.workflows[0].id;
          }
        }
      },
    }
  )
);
