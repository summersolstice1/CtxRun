import { memo, useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { MousePointer2, Keyboard, Clock, Move, MousePointerClick, Type, Repeat, Crosshair, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AutomatorAction, MouseButton } from '@/types/automator';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/store/useAppStore';
import { getText } from '@/lib/i18n';
import { NumberInput } from '@/components/ui/NumberInput';

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

  // 按键录制状态（仅用于 KeyPress）
  const [isRecording, setIsRecording] = useState(false);
  const [currentKeys, setCurrentKeys] = useState<Set<string>>(new Set());
  const recordingRef = useRef<HTMLDivElement>(null);

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

  // 按键录制处理
  useEffect(() => {
    if (!isRecording || actionType !== 'KeyPress') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const keys = new Set<string>();
      if (e.ctrlKey) keys.add('Control');
      if (e.altKey) keys.add('Alt');
      if (e.shiftKey) keys.add('Shift');
      if (e.metaKey) keys.add('Meta');

      // 排除单纯的修饰键
      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        let key = e.key;
        // 标准化键名
        if (key === ' ') key = 'Space';
        if (key.length === 1) key = key.toUpperCase();
        keys.add(key);

        // 格式化为 "Alt+F1" 这种字符串
        const shortcut = Array.from(keys).join('+');
        handleChange('key', shortcut);
        setIsRecording(false);
        setCurrentKeys(new Set());
      }

      setCurrentKeys(keys);
    };

    // ESC 取消录制
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isRecording) {
        e.preventDefault();
        setIsRecording(false);
        setCurrentKeys(new Set());
      }
    };

    // 点击外部取消录制
    const handleClickOutside = (e: MouseEvent) => {
      if (recordingRef.current && !recordingRef.current.contains(e.target as Node)) {
        setIsRecording(false);
        setCurrentKeys(new Set());
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isRecording, actionType, payload]);

  return (
    <div className={cn(
      "w-[250px] bg-card border rounded-lg shadow-sm transition-all duration-300 text-xs",
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
              <NumberInput
                label="X"
                value={(payload as { x: number }).x}
                onChange={(val) => handleChange('x', val)}
                className="flex-1"
              />
              <NumberInput
                label="Y"
                value={(payload as { y: number }).y}
                onChange={(val) => handleChange('y', val)}
                className="flex-1"
              />
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

        {actionType === 'KeyPress' && (
          <div className="space-y-1">
            <label className="text-[10px] text-muted-foreground block">{t('pressKey')}</label>
            <div className="flex gap-1">
              <div
                ref={recordingRef}
                onClick={() => {
                  setIsRecording(true);
                  setCurrentKeys(new Set());
                }}
                className={cn(
                  "flex-1 px-2 py-1.5 rounded border border-border bg-background text-center cursor-pointer transition-all select-none",
                  isRecording
                    ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                    : "hover:border-primary/50"
                )}
              >
                <span className={cn(
                  "font-mono text-[11px]",
                  isRecording ? "text-primary" : "text-foreground"
                )}>
                  {isRecording
                    ? currentKeys.size > 0
                      ? Array.from(currentKeys).join(' + ')
                      : "Press keys..."
                    : ((payload as { key: string }).key || "Click to record")
                  }
                </span>
              </div>
              {((payload as { key: string }).key) && !isRecording && (
                <button
                  onClick={() => handleChange('key', '')}
                  className="px-2 rounded border border-border bg-secondary/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                  title={t('clear')}
                >
                  <X size={12} />
                </button>
              )}
            </div>
            {isRecording && (
              <p className="text-[9px] text-center text-muted-foreground">
                Press combination or ESC to cancel
              </p>
            )}
          </div>
        )}

        {actionType === 'Wait' && (
           <NumberInput
              value={(payload as { ms: number }).ms}
              onChange={(val) => handleChange('ms', val)}
              className="flex-1"
           />
        )}

      </div>

      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-muted-foreground/50 hover:!bg-primary" />
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-muted-foreground/50 hover:!bg-primary" />
    </div>
  );
});
