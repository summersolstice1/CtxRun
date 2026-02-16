import { memo, useState } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { MousePointer2, Keyboard, Clock, Move, MousePointerClick, Type, Repeat, Crosshair } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AutomatorAction, MouseButton } from '@/types/automator';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/store/useAppStore';
import { getText } from '@/lib/i18n';

const ICONS: Record<AutomatorAction['type'], any> = {
  'MoveTo': Move,
  'Click': MousePointerClick,
  'DoubleClick': MousePointer2,
  'Type': Type,
  'KeyPress': Keyboard,
  'Wait': Clock,
  'Scroll': Move,
  'CheckColor': MousePointer2,
  'Iterate': Repeat,
};

// Title key mapping for i18n
const TITLE_KEYS: Record<AutomatorAction['type'], string> = {
  'MoveTo': 'moveTo',
  'Click': 'clickLabel',
  'DoubleClick': 'doubleClickLabel',
  'Type': 'type',
  'KeyPress': 'keyPress',
  'Wait': 'wait',
  'Scroll': 'scroll',
  'CheckColor': 'checkColorLabel',
  'Iterate': 'loopIteratorLabel',
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

  const { language } = useAppStore();

  const Icon = ICONS[actionType] || MousePointer2;
  const title = getText('automator', TITLE_KEYS[actionType] || actionType, language);

  // 取坐标状态（仅用于 MoveTo）
  const [isPickingCoords, setIsPickingCoords] = useState(false);

  const handleChange = (key: string, value: any) => {
    const newPayload = { ...payload, [key]: value };
    data.onChange(newPayload);
  };

  // 取坐标功能：延迟 3 秒后获取鼠标位置
  const handlePickCoordinates = async () => {
    setIsPickingCoords(true);

    // 延迟 3 秒让用户移动鼠标到目标位置
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      // 获取鼠标位置
      const [x, y] = await invoke<[number, number]>('plugin:ctxrun-plugin-automator|get_mouse_position');

      // 一次性更新所有坐标字段
      data.onChange({
        ...payload,
        x,
        y
      });
    } catch (error) {
      console.error('取坐标失败:', error);
    } finally {
      setIsPickingCoords(false);
    }
  };

  const t = (key: string, vars?: Record<string, string>) => getText('automator', key, language, vars);

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
          <div className="space-y-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground block mb-0.5">X</label>
                <input
                  type="number"
                  className="w-full bg-background border border-border rounded px-1 py-0.5 text-center font-mono"
                  value={(payload as { x: number }).x}
                  onChange={(e) => handleChange('x', parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground block mb-0.5">Y</label>
                <input
                  type="number"
                  className="w-full bg-background border border-border rounded px-1 py-0.5 text-center font-mono"
                  value={(payload as { y: number }).y}
                  onChange={(e) => handleChange('y', parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            {/* 取坐标按钮 */}
            <button
              onClick={handlePickCoordinates}
              disabled={isPickingCoords}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded text-[10px] font-medium transition-all",
                "bg-primary/10 text-primary hover:bg-primary/20",
                isPickingCoords && "bg-primary/5 animate-pulse"
              )}
              title={isPickingCoords ? t('pickingCoordsMessage') : t('pickCoordsTooltip')}
            >
              <Crosshair size={12} className={cn(isPickingCoords && "animate-spin")} />
              <span>{isPickingCoords ? t('pickingCoords') : t('pickCoords')}</span>
            </button>
            {/* 取坐标状态提示 */}
            {isPickingCoords && (
              <div className="bg-primary/10 border border-primary/30 rounded px-2 py-1 text-center">
                <span className="text-[9px] text-primary font-medium">{t('pickingCoordsMessage')}</span>
              </div>
            )}
          </div>
        )}

        {actionType === 'Type' && (
          <div>
             <input
                type="text"
                className="w-full bg-background border border-border rounded px-2 py-1"
                placeholder={t('textToType')}
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
             <option value="Left">{t('leftButton')}</option>
             <option value="Right">{t('rightButton')}</option>
             <option value="Middle">{t('middleButton')}</option>
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
