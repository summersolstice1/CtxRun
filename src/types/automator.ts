export type MouseButton = 'Left' | 'Right' | 'Middle';

// 🚀 新增节点接口
export interface UIElementNode {
  name: string;
  role: string;
  className: string;
}

// 核心：统一目标类型
export type ActionTarget =
  | { type: 'Coordinate'; x: number; y: number }
  | {
      type: 'Semantic';
      name: string;
      role: string;
      window_title?: string;
      process_name?: string;
      path: UIElementNode[]; // 🚀 新增路径数组
      fallbackX: number;
      fallbackY: number
    };

// 动作定义
export type AutomatorAction =
  | { type: 'MoveTo'; payload: { target: ActionTarget } }
  | { type: 'Click'; payload: { button: MouseButton; target?: ActionTarget } }
  | { type: 'DoubleClick'; payload: { button: MouseButton; target?: ActionTarget } }
  | { type: 'Type'; payload: { text: string; target?: ActionTarget } }
  | { type: 'KeyPress'; payload: { key: string } }
  | { type: 'Scroll'; payload: { delta: number } }
  | { type: 'Wait'; payload: { ms: number } }
  | { type: 'CheckColor'; payload: { x: number; y: number; expectedHex: string; tolerance: number } }
  | { type: 'Iterate'; payload: { targetCount: number } };

// 图节点结构：通过 action.type 自动判断是否为条件节点
export interface WorkflowNode {
  id: string;
  action: AutomatorAction;
  // 连线关系
  nextId?: string;     // 普通节点执行完走这里
  trueId?: string;     // CheckColor 节点匹配成功走这里
  falseId?: string;    // CheckColor 节点匹配失败走这里
}

export interface WorkflowGraph {
  nodes: Record<string, WorkflowNode>;
  startNodeId: string;
}

// ============ 保留旧的 Workflow 类型用于兼容 ============
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
