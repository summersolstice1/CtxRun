import { useCallback, useRef, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, Background,
  useNodesState, useEdgesState, addEdge,
  ReactFlowProvider, Connection,
  BackgroundVariant, useReactFlow, Node
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { Play, Square, Move } from 'lucide-react';
import { useAutomatorStore } from '@/store/useAutomatorStore';
import { useTranslation } from 'react-i18next';
import { ActionNode } from './nodes/ActionNode';
import { StartNode, EndNode } from './nodes/SpecialNodes';
import { ConditionNode } from './nodes/ConditionNode';
import { IteratorNode } from './nodes/IteratorNode';
import { ActionPalette } from './sidebar/ActionPalette';
import { AutomatorAction, WorkflowNode, WorkflowGraph } from '@/types/automator';
import { cn } from '@/lib/utils';

// 自定义节点注册
const nodeTypes = {
  actionNode: ActionNode,
  conditionNode: ConditionNode,
  iteratorNode: IteratorNode,
  startNode: StartNode,
  endNode: EndNode,
};

let id = 0;
const getId = () => `node_${Date.now()}_${id++}`;

// 根据字符串生成唯一颜色
const getEdgeColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 50%)`;
};

// --- 内部组件 (必须在 Provider 下) ---
function DnDFlow() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);

  // 本地状态：当前执行的节点 ID 序列
  const [executingNodeIds, setExecutingNodeIds] = useState<string[]>([]);

  // 核心 Hook：坐标转换
  const { screenToFlowPosition } = useReactFlow();

  const {
    stop, isRunning, currentStepIndex
  } = useAutomatorStore();

  const { t } = useTranslation();

  // 状态同步：重置高亮
  useEffect(() => {
    if (!isRunning) {
        setNodes((nds) => nds.map((node) => ({
            ...node,
            data: { ...node.data, isExecuting: false }
        })));
        setExecutingNodeIds([]);
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
          style: { stroke: getEdgeColor(`e-${startNodeId}-${endNodeId}`) },
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
        type: type === 'startNode' || type === 'endNode'
          ? type
          : (type === 'conditionNode' || type === 'iteratorNode' ? type : 'actionNode'),
        position,
        data: type === 'startNode' || type === 'endNode' ? {} : {
            actionType: type === 'conditionNode' ? 'CheckColor' : (type === 'iteratorNode' ? 'Iterate' : type as AutomatorAction['type']),
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
          const edgeId = `e-${lastNode.id}-${newNode.id}`;
          setEdges((eds) => addEdge({
              id: edgeId,
              source: lastNode.id,
              target: newNode.id,
              animated: true,
              style: { stroke: getEdgeColor(edgeId) }
          }, eds));
      }
    },
    [screenToFlowPosition, nodes, setNodes, setEdges],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const edgeId = `e-${params.source}-${params.target}`;
      setEdges((eds) => addEdge({
        ...params,
        animated: true,
        style: { stroke: getEdgeColor(edgeId) }
      }, eds));
    },
    [setEdges],
  );

  // --- 2. 图结构解析算法 ---
  const handleRun = async () => {
    // 1. 基础检查
    if (nodes.length === 0) return;

    // 2. 找到唯一的起点
    const startNode = nodes.find((n) => n.type === 'startNode');
    if (!startNode) {
      alert(t('automator.needStartPoint'));
      return;
    }
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
      } else if (node.type === 'iteratorNode') {
        const nodeData = node.data as { payload: any };
        action = {
          type: 'Iterate',
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

      // 通过 action 类型判断是否为条件节点（有 true/false 分支）
      const isConditionNode = action.type === 'CheckColor' || action.type === 'Iterate';

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
      alert(t('automator.noConnection'));
      return;
    }

    const workflowGraph: WorkflowGraph = {
      nodes: graphNodes,
      startNodeId: firstEdge.target,
    };
    const runIds: string[] = [];
    const visited = new Set<string>();
    let currentId: string | undefined = workflowGraph.startNodeId;
    while (currentId && !visited.has(currentId)) {
      // 检查节点是否存在于 graphNodes 中（可能指向 endNode）
      const node: WorkflowNode | undefined = graphNodes[currentId];
      if (!node) {
        // 节点不存在（可能是 endNode），停止追踪
        break;
      }
      visited.add(currentId);
      runIds.push(currentId);
      if (node.action.type === 'CheckColor' || node.action.type === 'Iterate') {
        currentId = node.trueId || node.falseId || node.nextId;
      } else {
        currentId = node.nextId;
      }
    }
    setExecutingNodeIds(runIds);
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      await invoke('plugin:ctxrun-plugin-automator|execute_workflow_graph', {
        graph: workflowGraph
      });
    } catch (error) {
      alert(t('automator.executionFailed', { error: String(error) }));
    }
  };
  const processedNodes = useMemo(() => {
    return nodes.map((node) => {
        const isActive = isRunning && executingNodeIds[currentStepIndex] === node.id;
        return {
            ...node,
            data: { ...node.data, isExecuting: isActive }
        };
    });
  }, [nodes, isRunning, currentStepIndex, executingNodeIds]);

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="h-14 border-b border-border flex items-center px-4 justify-between bg-secondary/5 shrink-0 z-10">
         <div className="flex items-center gap-3">
            <h2 className="font-semibold text-foreground">{t('automator.designerTitle')}</h2>
            <div className="px-2 py-0.5 rounded-full bg-secondary text-[10px] text-muted-foreground border border-border">{t('automator.manualMode')}</div>
         </div>
         <div className="flex items-center gap-2">
            <button onClick={isRunning ? stop : handleRun} className={cn("flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all shadow-sm", isRunning ? "bg-destructive text-white" : "bg-primary text-primary-foreground")}>
                {isRunning ? <><Square size={14} fill="currentColor"/> {t('automator.stopBtn')}</> : <><Play size={14} fill="currentColor"/> {t('automator.runBtn')}</>}
            </button>
         </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <ActionPalette />
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
                proOptions={{ hideAttribution: true }}
                onNodesDelete={(deletedNodes) => {
                    const deletedIds = new Set(deletedNodes.map(n => n.id));
                    setEdges(eds => eds.filter(e => !deletedIds.has(e.source) && !deletedIds.has(e.target)));
                }}
                defaultEdgeOptions={{ type: 'smoothstep', animated: true }}
                fitView
            >
                <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
            </ReactFlow>
            
            {nodes.length === 0 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
                    <div className="border-2 border-dashed border-muted-foreground/30 rounded-xl p-8 flex flex-col items-center">
                        <Move size={32} className="mb-2" />
                        <p className="text-sm font-medium">{t('automator.dragActionsHere')}</p>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}

export function AutomatorView() {
  return (
    <ReactFlowProvider>
      <DnDFlow />
    </ReactFlowProvider>
  );
}