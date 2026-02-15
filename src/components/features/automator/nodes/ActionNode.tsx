import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { MousePointer2, Keyboard, Clock, Move, MousePointerClick, Type } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONS: Record<string, any> = {
  'MoveTo': Move,
  'Click': MousePointerClick,
  'DoubleClick': MousePointer2,
  'Type': Type,
  'KeyPress': Keyboard,
  'Wait': Clock,
  'Scroll': Move
};

const TITLES: Record<string, string> = {
  'MoveTo': 'Move Mouse',
  'Click': 'Click',
  'DoubleClick': 'Double Click',
  'Type': 'Input Text',
  'KeyPress': 'Press Key',
  'Wait': 'Wait',
  'Scroll': 'Scroll'
};

export const ActionNode = memo(({ data, selected }: NodeProps) => {
  const actionType = (data as any).actionType as string;
  const payload = (data as any).payload as any;
  const isExecuting = (data as any).isExecuting as boolean | undefined;

  const Icon = ICONS[actionType] || MousePointer2;
  const title = TITLES[actionType] || actionType;

  const handleChange = (key: string, value: any) => {
    const newPayload = { ...payload, [key]: value };
    ((data as any).onChange as (d: any) => void)(newPayload);
  };

  return (
    <div className={cn(
      "min-w-[180px] bg-card border rounded-lg shadow-sm transition-all text-xs",
      selected ? "border-primary ring-1 ring-primary" : "border-border",
      isExecuting && "ring-2 ring-green-500 border-green-500 shadow-green-500/20"
    )}>
      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/30 border-b border-border rounded-t-lg handle">
        <Icon size={12} className="text-primary" />
        <span className="font-semibold text-foreground/80">{title}</span>
      </div>

      <div className="p-3 space-y-2 nodrag">

        {actionType === 'MoveTo' && (
          <div className="flex gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">X</label>
              <input
                type="number"
                className="w-full bg-background border border-border rounded px-1 py-0.5 text-center font-mono"
                value={payload.x}
                onChange={(e) => handleChange('x', parseInt(e.target.value))}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Y</label>
              <input
                type="number"
                className="w-full bg-background border border-border rounded px-1 py-0.5 text-center font-mono"
                value={payload.y}
                onChange={(e) => handleChange('y', parseInt(e.target.value))}
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
                value={payload.text}
                onChange={(e) => handleChange('text', e.target.value)}
              />
          </div>
        )}

        {(actionType === 'Click' || actionType === 'DoubleClick') && (
           <select
             className="w-full bg-background border border-border rounded px-2 py-1"
             value={payload.button}
             onChange={(e) => handleChange('button', e.target.value)}
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
                value={payload.ms}
                onChange={(e) => handleChange('ms', parseInt(e.target.value))}
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
