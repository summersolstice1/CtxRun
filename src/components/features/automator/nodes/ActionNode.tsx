import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { MousePointer2, Keyboard, Clock, Move, MousePointerClick, Type } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AutomatorAction, MouseButton } from '@/types/automator';

const ICONS: Record<AutomatorAction['type'], any> = {
  'MoveTo': Move,
  'Click': MousePointerClick,
  'DoubleClick': MousePointer2,
  'Type': Type,
  'KeyPress': Keyboard,
  'Wait': Clock,
  'Scroll': Move,
  'CheckColor': MousePointer2,
};

const TITLES: Record<AutomatorAction['type'], string> = {
  'MoveTo': 'Move Mouse',
  'Click': 'Click',
  'DoubleClick': 'Double Click',
  'Type': 'Input Text',
  'KeyPress': 'Press Key',
  'Wait': 'Wait',
  'Scroll': 'Scroll',
  'CheckColor': 'Check Color',
};

interface ActionNodeData {
  actionType: AutomatorAction['type'];
  payload: AutomatorAction['payload'];
  onChange: (payload: AutomatorAction['payload']) => void;
  isExecuting?: boolean;
}

export const ActionNode = memo((props: NodeProps) => {
  const data = props.data as unknown as ActionNodeData;
  const selected = props.selected;

  const actionType = data.actionType;
  const payload = data.payload;
  const isExecuting = data.isExecuting;

  const Icon = ICONS[actionType] || MousePointer2;
  const title = TITLES[actionType] || actionType;

  const handleChange = (key: string, value: any) => {
    const newPayload = { ...payload, [key]: value };
    data.onChange(newPayload);
  };

  return (
    <div className={cn(
      "min-w-[180px] bg-card border rounded-lg shadow-sm transition-all duration-300 text-xs",
      selected ? "border-primary ring-1 ring-primary" : "border-border",
      isExecuting && "border-primary ring-4 ring-primary/20 shadow-[0_0_15px_rgba(59,130,246,0.5)] scale-105 z-50"
    )}>
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 border-b rounded-t-lg transition-colors",
        isExecuting ? "bg-primary text-primary-foreground" : "bg-secondary/30 text-foreground/80"
      )}>
        <Icon size={12} />
        <span className="font-bold text-[10px] uppercase">{title}</span>
        {isExecuting && <div className="ml-auto w-2 h-2 bg-white rounded-full animate-ping" />}
      </div>

      <div className="p-3 space-y-2 nodrag">

        {actionType === 'MoveTo' && (
          <div className="flex gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">X</label>
              <input
                type="number"
                className="w-full bg-background border border-border rounded px-1 py-0.5 text-center font-mono"
                value={(payload as { x: number }).x}
                onChange={(e) => handleChange('x', parseInt(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Y</label>
              <input
                type="number"
                className="w-full bg-background border border-border rounded px-1 py-0.5 text-center font-mono"
                value={(payload as { y: number }).y}
                onChange={(e) => handleChange('y', parseInt(e.target.value) || 0)}
              />
            </div>
          </div>
        )}

        {actionType === 'Type' && (
          <div>
             <input
                type="text"
                className="w-full bg-background border border-border rounded px-2 py-1"
                placeholder="Text to type..."
                value={(payload as { text: string }).text}
                onChange={(e) => handleChange('text', e.target.value)}
              />
          </div>
        )}

        {(actionType === 'Click' || actionType === 'DoubleClick') && (
           <select
             className="w-full bg-background border border-border rounded px-2 py-1"
             value={(payload as { button: MouseButton }).button}
             onChange={(e) => handleChange('button', e.target.value as MouseButton)}
           >
             <option value="Left">Left Button</option>
             <option value="Right">Right Button</option>
             <option value="Middle">Middle</option>
           </select>
        )}

        {actionType === 'Wait' && (
           <div className="flex items-center gap-2">
              <input
                type="number"
                className="w-full bg-background border border-border rounded px-2 py-1 text-right font-mono"
                value={(payload as { ms: number }).ms}
                onChange={(e) => handleChange('ms', parseInt(e.target.value) || 0)}
              />
              <span className="text-muted-foreground">ms</span>
           </div>
        )}

      </div>

      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-muted-foreground/50 hover:!bg-primary" />
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-muted-foreground/50 hover:!bg-primary" />
    </div>
  );
});
