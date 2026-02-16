import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Repeat } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { getText } from '@/lib/i18n';

interface IteratorNodeData {
  payload: { targetCount: number };
  onChange: (payload: IteratorNodeData['payload']) => void;
  isExecuting?: boolean;
}

export const IteratorNode = memo((props: NodeProps) => {
  const data = props.data as unknown as IteratorNodeData;
  const { payload, onChange, isExecuting } = data;

  const { language } = useAppStore();

  const t = (key: string, vars?: Record<string, string>) => getText('automator', key, language, vars);

  const handleChange = (val: string) => {
    onChange({ targetCount: Math.max(1, parseInt(val) || 1) });
  };

  return (
    <div className={cn(
      "w-[200px] bg-card border-2 rounded-lg shadow-sm transition-all duration-300 text-xs",
      props.selected ? "border-blue-500 ring-1 ring-primary" : "border-border",
      isExecuting && "border-blue-400 ring-4 ring-blue-500/20 scale-105 z-50"
    )}>
      <div className="bg-blue-500/10 text-blue-600 px-3 py-2 text-[10px] font-bold border-b border-blue-500/20 flex items-center gap-2 rounded-t-lg">
        <Repeat size={12} />
        <span>{t('loopIteratorNodeLabel')}</span>
        {isExecuting && <div className="ml-auto w-2 h-2 bg-blue-500 rounded-full animate-ping" />}
      </div>

      <div className="p-3 space-y-2 nodrag">
        <div>
          <label className="text-[9px] text-muted-foreground block mb-1">{t('targetCount')}</label>
          <input
            type="number"
            className="w-full bg-background border border-border rounded px-2 py-1 text-center font-mono text-sm"
            value={payload.targetCount}
            min={1}
            onChange={(e) => handleChange(e.target.value)}
          />
        </div>

        <div className="flex justify-between text-[9px] font-semibold pt-1">
          <div className="flex items-center gap-1 text-red-500">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>← {t('exit')}</span>
          </div>
          <div className="flex items-center gap-1 text-green-500">
            <span>{t('loop')} →</span>
            <div className="w-2 h-2 rounded-full bg-green-500" />
          </div>
        </div>
      </div>

      <Handle type="target" position={Position.Top} className="!bg-muted-foreground/50" />
      <Handle type="source" position={Position.Left} id="false" className="!bg-red-500 !w-3 !h-3" style={{ top: '75%' }} />
      <Handle type="source" position={Position.Right} id="true" className="!bg-green-500 !w-3 !h-3" style={{ top: '75%' }} />
    </div>
  );
});
