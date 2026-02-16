export type MouseButton = 'Left' | 'Right' | 'Middle';

// 动作定义
export type AutomatorAction =
  | { type: 'MoveTo'; payload: { x: number; y: number } }
  | { type: 'Click'; payload: { button: MouseButton } }
  | { type: 'DoubleClick'; payload: { button: MouseButton } }
  | { type: 'Type'; payload: { text: string } }
  | { type: 'KeyPress'; payload: { key: string } }
  | { type: 'Scroll'; payload: { delta: number } }
  | { type: 'Wait'; payload: { ms: number } }
  | { type: 'CheckColor'; payload: { x: number; y: number; expectedHex: string; tolerance: number } }
  // 迭代计数器
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
