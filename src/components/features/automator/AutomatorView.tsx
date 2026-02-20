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

const nodeTypes = {
  actionNode: ActionNode,
  conditionNode: ConditionNode,
  iteratorNode: IteratorNode,
  startNode: StartNode,
  endNode: EndNode,
};

let id = 0;
const getId = () => `node_${Date.now()}_${id++}`;

const getEdgeColor = (str: string) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 70%, 50%)`;
};

function DnDFlow() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);

  const [executingNodeIds, setExecutingNodeIds] = useState<string[]>([]);

  const { screenToFlowPosition } = useReactFlow();

  const {
    stop, isRunning, currentStepIndex
  } = useAutomatorStore();

  const { t } = useTranslation();

  useEffect(() => {
    if (!isRunning) {
        setNodes((nds) => nds.map((node) => ({
            ...node,
            data: { ...node.data, isExecuting: false }
        })));
        setExecutingNodeIds([]);
    }
  }, [isRunning, setNodes]);

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
  }, []);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      if (!reactFlowWrapper.current) return;

      const type = event.dataTransfer.getData('application/reactflow');
      const payloadStr = event.dataTransfer.getData('application/payload');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      if (type === 'startNode' && nodes.some((n) => n.type === 'startNode')) {
        return;
      }

      const payload = payloadStr ? JSON.parse(payloadStr) : {};

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

  const handleRun = async () => {
    if (nodes.length === 0) return;

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

      const outgoingEdges = edges.filter((e) => e.source === node.id);

      const workflowNode: WorkflowNode = {
        id: node.id,
        action,
        nextId: undefined,
        trueId: undefined,
        falseId: undefined,
      };

      const isConditionNode = action.type === 'CheckColor' || action.type === 'Iterate';

      for (const edge of outgoingEdges) {
        if (isConditionNode) {
          if (edge.sourceHandle === 'true') {
            workflowNode.trueId = edge.target;
          } else if (edge.sourceHandle === 'false') {
            workflowNode.falseId = edge.target;
          } else {
            workflowNode.falseId = edge.target;
          }
        } else {
          workflowNode.nextId = edge.target;
        }
      }

      graphNodes[node.id] = workflowNode;
    }

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
      const node: WorkflowNode | undefined = graphNodes[currentId];
      if (!node) {
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