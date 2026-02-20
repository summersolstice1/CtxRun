export type MouseButton = 'Left' | 'Right' | 'Middle';

export interface UIElementNode {
  name: string;
  role: string;
  className: string;
}

export type ActionTarget =
  | { type: 'Coordinate'; x: number; y: number }
  | {
      type: 'Semantic';
      name: string;
      role: string;
      window_title?: string;
      process_name?: string;
      path: UIElementNode[];
      fallbackX: number;
      fallbackY: number
    }
  | {
      type: 'WebSelector';
      selector: string;
      url_contain?: string;
      fallbackX: number;
      fallbackY: number;
    };

export type AutomatorAction =
  | { type: 'MoveTo'; payload: { target: ActionTarget } }
  | { type: 'Click'; payload: { button: MouseButton; target?: ActionTarget } }
  | { type: 'DoubleClick'; payload: { button: MouseButton; target?: ActionTarget } }
  | { type: 'Type'; payload: { text: string; target?: ActionTarget } }
  | { type: 'KeyPress'; payload: { key: string } }
  | { type: 'Scroll'; payload: { delta: number } }
  | { type: 'Wait'; payload: { ms: number } }
  | { type: 'CheckColor'; payload: { x: number; y: number; expectedHex: string; tolerance: number } }
  | { type: 'Iterate'; payload: { targetCount: number } }
  | {
      type: 'LaunchBrowser';
      payload: {
        browser: 'Chrome' | 'Edge';
        url?: string;
        useTempProfile: boolean;
      };
    };

export interface WorkflowNode {
  id: string;
  action: AutomatorAction;
  nextId?: string;
  trueId?: string;
  falseId?: string;
}

export interface WorkflowGraph {
  nodes: Record<string, WorkflowNode>;
  startNodeId: string;
}

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
