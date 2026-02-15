import { useCallback, useRef, useEffect } from 'react';
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
import { ActionPalette } from './sidebar/ActionPalette';
import { AutomatorAction } from '@/types/automator';
import { cn } from '@/lib/utils';

// 自定义节点注册
const nodeTypes = {
  actionNode: ActionNode,
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
    start, stop, isRunning, setWorkflow 
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

      const payload = payloadStr ? JSON.parse(payloadStr) : {};

      // V12 推荐的坐标转换方法
      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNodeId = getId();
      const newNode: Node = {
        id: newNodeId,
        type: 'actionNode', 
        position,
        data: { 
            actionType: type as AutomatorAction['type'], 
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

  // 运行逻辑
  const handleRun = async () => {
    // 简单的拓扑排序，转成线性列表
    if (nodes.length === 0) return;
    const targets = new Set(edges.map((e) => e.target));
    let startNode = nodes.find((n) => !targets.has(n.id)) || nodes[0];
    const sortedActions: AutomatorAction[] = [];
    const visited = new Set<string>();
    let current: Node | undefined = startNode;

    while (current) {
        if (visited.has(current.id)) break;
        visited.add(current.id);
        const actionData = current.data as any;
        sortedActions.push({
            type: actionData.actionType,
            payload: actionData.payload
        });
        const outgoingEdge = edges.find((e) => e.source === current!.id);
        current = outgoingEdge ? nodes.find((n) => n.id === outgoingEdge.target) : undefined;
    }
    
    if (sortedActions.length === 0) return;
    setWorkflow({ actions: sortedActions });
    await start();
  };

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
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onDrop={onDrop}
                onDragOver={onDragOver}
                nodeTypes={nodeTypes}
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