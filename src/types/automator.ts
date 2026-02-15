export type MouseButton = 'Left' | 'Right' | 'Middle';

export type AutomatorAction =
  | { type: 'MoveTo'; payload: { x: number; y: number } }
  | { type: 'Click'; payload: { button: MouseButton } }
  | { type: 'DoubleClick'; payload: { button: MouseButton } }
  | { type: 'Type'; payload: { text: string } }
  | { type: 'KeyPress'; payload: { key: string } }
  | { type: 'Scroll'; payload: { delta: number } }
  | { type: 'Wait'; payload: { ms: number } };

export interface Workflow {
  id: string;
  name: string;
  actions: AutomatorAction[];
  repeatCount: number;
  meta?: {
    description?: string;
    createdAt?: number;
  };
}

export const DEFAULT_WORKFLOW: Workflow = {
  id: 'default',
  name: 'New Workflow',
  actions: [],
  repeatCount: 1
};
