import { useCallback, useRef, useEffect, useMemo } from 'react';
import {
  ReactFlow, Background, Controls,
  useNodesState, useEdgesState, addEdge,
  ReactFlowProvider, Connection,
  BackgroundVariant, useReactFlow, Node
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Play, Square, Move } from 'lucide-react';
import { useAutomatorStore } from '@/store/useAutomatorStore';
import { ActionNode } from './nodes/ActionNode';
import { StartNode, EndNode } from './nodes/SpecialNodes';
import { ConditionNode } from './nodes/ConditionNode';
import { ActionPalette } from './sidebar/ActionPalette';
import { AutomatorAction, WorkflowNode, WorkflowGraph } from '@/types/automator';
import { cn } from '@/lib/utils';

// 自定义节点注册
const nodeTypes = {
  actionNode: ActionNode,
  conditionNode: ConditionNode,
  startNode: StartNode,
  endNode: EndNode,
};

let id = 0;
const getId = () => `node_${Date.now()}_${id++}`;

// --- 内部组件 (必须在 Provider 下) ---
function DnDFlow() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  
  // 核心 Hook：坐标转换
  const { screenToFlowPosition } = useReactFlow();

  const {
    stop, isRunning, currentStepIndex
  } = useAutomatorStore();

  // 状态同步：重置高亮
  useEffect(() => {
    if (!isRunning) {
        setNodes((nds) => nds.map((node) => ({
            ...node,
            data: { ...node.data, isExecuting: false }
        })));
    }
  }, [isRunning, setNodes]);

  // 初始模板：当画布为空时，默认生成 Start 和 End 节点
  useEffect(() => {
    if (nodes.length === 0) {
      const startNodeId = getId();
      const endNodeId = getId();

      const initialNodes = [
        {
          id: startNodeId,
          type: 'startNode',
          position: { x: 0, y: 0 },
          data: {},
        },
        {
          id: endNodeId,
          type: 'endNode',
          position: { x: 0, y: 150 },
          data: {},
        },
      ];

      const initialEdges = [
        {
          id: `e-${startNodeId}-${endNodeId}`,
          source: startNodeId,
          target: endNodeId,
          animated: true,
        },
      ];

      setNodes(initialNodes);
      setEdges(initialEdges);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  // --- 关键 1: DragOver 必须 PreventDefault ---
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // --- 关键 2: Drop 逻辑 ---
  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current) return;

      const type = event.dataTransfer.getData('application/reactflow');
      const payloadStr = event.dataTransfer.getData('application/payload');

      // 检查类型是否合法
      if (typeof type === 'undefined' || !type) {
        return;
      }

      // 唯一性校验：只能有一个 Start 节点
      if (type === 'startNode' && nodes.some((n) => n.type === 'startNode')) {
        // 弹出警告：工作流只能有一个起点
        return;
      }

      const payload = payloadStr ? JSON.parse(payloadStr) : {};

      // V12 推荐的坐标转换方法
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNodeId = getId();
      const newNode: Node = {
        id: newNodeId,
        type: type === 'startNode' || type === 'endNode' ? type : type === 'conditionNode' ? 'conditionNode' : 'actionNode',
        position,
        data: type === 'startNode' || type === 'endNode' ? {} : {
            actionType: type === 'conditionNode' ? 'CheckColor' : type as AutomatorAction['type'],
            payload: payload,
            onChange: (newData: any) => {
                setNodes((nds) => nds.map((node) => {
                    if (node.id === newNodeId) {
                        return { ...node, data: { ...node.data, payload: newData } };
                    }
                    return node;
                }));
            }
        },
      };

      setNodes((nds) => nds.concat(newNode));

      // 自动连线体验优化
      if (nodes.length > 0) {
          const lastNode = nodes[nodes.length - 1];
          setEdges((eds) => addEdge({
              id: `e-${lastNode.id}-${newNode.id}`,
              source: lastNode.id,
              target: newNode.id,
              animated: true
          }, eds));
      }
    },
    [screenToFlowPosition, nodes, setNodes, setEdges],
  );

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges],
  );

  // --- 2. 图结构解析算法 ---
  const handleRun = async () => {
    // 1. 基础检查
    if (nodes.length === 0) return;

    // 2. 找到唯一的起点
    const startNode = nodes.find((n) => n.type === 'startNode');
    if (!startNode) {
      alert("请添加 Start Point 节点作为起始。");
      return;
    }

    console.log("开始解析图结构工作流...");

    // 3. 构建图结构
    const graphNodes: Record<string, WorkflowNode> = {};

    for (const node of nodes) {
      if (node.type === 'startNode' || node.type === 'endNode') continue;

      let action: AutomatorAction;
      if (node.type === 'conditionNode') {
        const nodeData = node.data as { payload: any };
        action = {
          type: 'CheckColor',
          payload: nodeData.payload
        };
      } else {
        const nodeData = node.data as { actionType: AutomatorAction['type']; payload: any };
        action = {
          type: nodeData.actionType,
          payload: nodeData.payload
        };
      }

      // 查找连线关系
      const outgoingEdges = edges.filter((e) => e.source === node.id);

      const workflowNode: WorkflowNode = {
        id: node.id,
        action,
        nextId: undefined,
        trueId: undefined,
        falseId: undefined,
      };

      // 通过 action 类型判断是否为条件节点
      const isConditionNode = action.type === 'CheckColor';

      for (const edge of outgoingEdges) {
        if (isConditionNode) {
          // 条件节点的 true/false 分支
          if (edge.sourceHandle === 'true') {
            workflowNode.trueId = edge.target;
          } else if (edge.sourceHandle === 'false') {
            workflowNode.falseId = edge.target;
          } else {
            // 未指定 handle，默认 false
            workflowNode.falseId = edge.target;
          }
        } else {
          // 动作节点的下一个节点
          workflowNode.nextId = edge.target;
        }
      }

      graphNodes[node.id] = workflowNode;
    }

    // 4. 找到 startNode 连接的第一个节点
    const firstEdge = edges.find((e) => e.source === startNode.id);
    if (!firstEdge) {
      alert("起点没有连接任何节点。");
      return;
    }

    const workflowGraph: WorkflowGraph = {
      nodes: graphNodes,
      startNodeId: firstEdge.target,
    };

    console.log("图结构解析完成:", workflowGraph);

    // 5. 调用后端执行
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('ctxrun-plugin-automator:execute_workflow_graph', {
        graph: workflowGraph
      });
    } catch (error) {
      console.error('执行失败:', error);
      alert(`执行失败: ${error}`);
    }
  };

  // --- 3. 动态高亮逻辑 ---
  // 利用 store 中的 currentStepIndex 实时反馈 UI
  const processedNodes = useMemo(() => {
    const runIds = (window as any).currentRunIds || [];
    return nodes.map((node) => {
        const isActive = isRunning && runIds[currentStepIndex] === node.id;
        return {
            ...node,
            data: { ...node.data, isExecuting: isActive }
        };
    });
  }, [nodes, isRunning, currentStepIndex]);

  return (
    <div className="h-full flex flex-col bg-background">
       {/* 顶部栏 */}
      <div className="h-14 border-b border-border flex items-center px-4 justify-between bg-secondary/5 shrink-0 z-10">
         <div className="flex items-center gap-3">
            <h2 className="font-semibold text-foreground">Automator Designer</h2>
            <div className="px-2 py-0.5 rounded-full bg-secondary text-[10px] text-muted-foreground border border-border">Manual Mode</div>
         </div>
         <div className="flex items-center gap-2">
            <button onClick={isRunning ? stop : handleRun} className={cn("flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all shadow-sm", isRunning ? "bg-destructive text-white" : "bg-primary text-primary-foreground")}>
                {isRunning ? <><Square size={14} fill="currentColor"/> Stop</> : <><Play size={14} fill="currentColor"/> Run</>}
            </button>
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧面板 */}
        <ActionPalette />
        
        {/* 
            核心修复点：
            1. 使用 ref={reactFlowWrapper} 获取 DOM 边界
            2. 将 onDrop 和 onDragOver 放在这个 div 上
            3. 确保这个 div 有宽高 (flex-1 h-full)
        */}
        <div className="flex-1 h-full relative bg-secondary/5" ref={reactFlowWrapper}>
            <ReactFlow
                nodes={processedNodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onDrop={onDrop}
                onDragOver={onDragOver}
                nodeTypes={nodeTypes}
                // --- 新增：当节点被删除时，自动清理相关的连线 ---
                onNodesDelete={(deletedNodes) => {
                    const deletedIds = new Set(deletedNodes.map(n => n.id));
                    setEdges(eds => eds.filter(e => !deletedIds.has(e.source) && !deletedIds.has(e.target)));
                }}
                defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
                fitView
            >
                <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                <Controls />
            </ReactFlow>
            
            {nodes.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
                    <div className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-8 flex flex-col items-center">
                        <Move size={32} className="mb-2" />
                        <p className="text-sm font-medium">Drag actions here</p>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}

// 3. 根组件：Provider 包裹
export function AutomatorView() {
  return (
    <ReactFlowProvider>
      <DnDFlow />
    </ReactFlowProvider>
  );
}