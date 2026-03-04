export type MouseButton = 'Left' | 'Right' | 'Middle';
export type NavigationWaitUntil = 'load' | 'domcontentloaded' | 'networkidle';
export type SelectorWaitState = 'attached' | 'visible' | 'hidden';
export type UrlMatchMode = 'contains' | 'equals' | 'regex';
export type TabSwitchStrategy = 'lastOpened' | 'index' | 'urlContains' | 'titleContains';
export type AssertKind = 'SelectorExists' | 'TextContains' | 'UrlContains' | 'UrlEquals' | 'UrlRegex';

export interface UIElementNode {
  name: string;
  role: string;
  className: string;
}

export interface PickedWebTarget {
  primarySelector: string;
  selectorCandidates: string[];
  strategy: string;
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
      selector_candidates?: string[];
      url_contain?: string;
      fallbackX: number;
      fallbackY: number;
    };

export type AutomatorAction =
  | { type: 'MoveTo'; payload: { target: ActionTarget } }
  | { type: 'Click'; payload: { button: MouseButton; target?: ActionTarget } }
  | { type: 'DoubleClick'; payload: { button: MouseButton; target?: ActionTarget } }
  | { type: 'Type'; payload: { text: string; target?: ActionTarget } }
  | { type: 'KeyPress'; payload: { key: string; target?: ActionTarget } }
  | {
      type: 'Navigate';
      payload: {
        url: string;
        wait_until?: NavigationWaitUntil;
        timeoutMs?: number;
        url_contain?: string;
      };
    }
  | {
      type: 'NewTab';
      payload: {
        url?: string;
      };
    }
  | {
      type: 'SwitchTab';
      payload: {
        strategy?: TabSwitchStrategy;
        value?: string;
        index?: number;
      };
    }
  | {
      type: 'WaitForSelector';
      payload: {
        selector: string;
        selector_candidates?: string[];
        state?: SelectorWaitState;
        timeoutMs?: number;
        url_contain?: string;
      };
    }
  | {
      type: 'WaitForURL';
      payload: {
        value: string;
        mode?: UrlMatchMode;
        timeoutMs?: number;
        url_contain?: string;
      };
    }
  | {
      type: 'Fill';
      payload: {
        selector: string;
        selector_candidates?: string[];
        text: string;
        clear?: boolean;
        url_contain?: string;
      };
    }
  | {
      type: 'Assert';
      payload: {
        kind: AssertKind;
        selector?: string;
        selector_candidates?: string[];
        value?: string;
        timeoutMs?: number;
        url_contain?: string;
      };
    }
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
  // React Flow graph state (for visual editor)
  flowNodes?: any[];
  flowEdges?: any[];
}

export const DEFAULT_WORKFLOW: Workflow = {
  id: 'default',
  name: 'New Workflow',
  actions: [],
  repeatCount: 1,
  flowNodes: [],
  flowEdges: []
};
