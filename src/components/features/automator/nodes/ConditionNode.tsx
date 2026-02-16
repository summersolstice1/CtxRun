import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Pipette, Crosshair } from 'lucide-react';
import { cn } from '@/lib/utils';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/store/useAppStore';
import { getText } from '@/lib/i18n';
import { NumberInput } from '@/components/ui/NumberInput';

interface ConditionNodeData {
  payload: { x: number; y: number; expectedHex: string; tolerance: number };
  onChange: (payload: ConditionNodeData['payload']) => void;
  isExecuting?: boolean;
}

const PLUGIN_PREFIX = 'plugin:ctxrun-plugin-automator|';

export const ConditionNode = memo((props: NodeProps) => {
  const data = props.data as unknown as ConditionNodeData;
  const selected = props.selected;

  const payload = data.payload;
  const isExecuting = data.isExecuting;
  const [isPicking, setIsPicking] = useState(false);

  const { language } = useAppStore();

  const t = (key: string, vars?: Record<string, string>) => getText('automator', key, language, vars);

  const handleChange = (key: string, value: any) => {
    const newPayload = { ...payload, [key]: value };
    data.onChange(newPayload);
  };

  const handlePickColor = async () => {
    setIsPicking(true);

    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      const [x, y] = await invoke<[number, number]>(`${PLUGIN_PREFIX}get_mouse_position`);

      const color = await invoke<string>(`${PLUGIN_PREFIX}get_pixel_color`, { x, y });

      data.onChange({
        ...payload,
        x,
        y,
        expectedHex: color
      });
    } catch (error) {
      console.error('取色失败:', error);
    } finally {
      setIsPicking(false);
    }
  };

  return (
    <div className={cn(
      "w-[450px] bg-card border-2 rounded-lg shadow-sm transition-all duration-300 text-xs",
      selected ? "border-orange-500 ring-1 ring-primary" : "border-border",
      isExecuting && "border-orange-400 ring-4 ring-orange-500/20 shadow-[0_0_15px_rgba(249,115,22,0.5)] scale-105 z-50"
    )}>
      <div className={cn(
        "bg-orange-500/10 text-orange-600 px-3 py-2 text-[10px] font-bold border-b border-orange-500/20 flex items-center gap-2 rounded-t-lg"
      )}>
        <Pipette size={12} />
        <span>{t('colorCondition')}</span>
        {isExecuting && <div className="ml-auto w-2 h-2 bg-orange-500 rounded-full animate-ping" />}
      </div>

      <div className="p-3 space-y-2 nodrag">
        <div className="flex items-center gap-2">
          <div className="relative">
            <div
              className="w-10 h-10 rounded border shadow-inner shrink-0"
              style={{ backgroundColor: payload.expectedHex || '#000000' }}
            />
            <button
              onClick={handlePickColor}
              disabled={isPicking}
              className={cn(
                "absolute inset-0 flex items-center justify-center rounded transition-all",
                "hover:bg-black/20 active:bg-black/30",
                isPicking && "bg-black/10 animate-pulse"
              )}
              title={isPicking ? t('pickingColor') : t('pickCoordsTooltip')}
            >
              <Crosshair size={14} className={cn("text-white drop-shadow-md", isPicking && "animate-spin")} />
            </button>
          </div>
          <div className="flex-1">
            <input
              type="text"
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-center font-mono text-xs uppercase"
              value={payload.expectedHex || '#000000'}
              onChange={(e) => handleChange('expectedHex', e.target.value)}
              placeholder="#RRGGBB"
            />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <NumberInput
            label="X"
            value={payload.x ?? 0}
            onChange={(val) => handleChange('x', val)}
          />
          <NumberInput
            label="Y"
            value={payload.y ?? 0}
            onChange={(val) => handleChange('y', val)}
          />
          <NumberInput
            label={t('toleranceRange')}
            value={payload.tolerance ?? 10}
            min={0}
            max={255}
            onChange={(val) => handleChange('tolerance', Math.max(0, Math.min(255, val)))}
            className="col-span-2"
          />
        </div>

        {isPicking && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded px-2 py-1.5 text-center">
            <span className="text-[9px] text-orange-600 font-medium">{t('pickingColor')}</span>
          </div>
        )}

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

      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-muted-foreground/50 hover:!bg-orange-500 !border-2 !border-orange-500/30"
      />

      <Handle
        type="source"
        position={Position.Left}
        id="false"
        className="!bg-red-500 !w-3 !h-3 !border-red-600 hover:!bg-red-400 !border-2"
        style={{ top: '70%' }}
      />

      <Handle
        type="source"
        position={Position.Right}
        id="true"
        className="!bg-green-500 !w-3 !h-3 !border-green-600 hover:!bg-green-400 !border-2"
        style={{ top: '70%' }}
      />
    </div>
  );
});
