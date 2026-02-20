import { memo, useState, useEffect, useRef } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { MousePointer2, Keyboard, Clock, Move, MousePointerClick, Type, Repeat, Crosshair, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AutomatorAction, MouseButton, ActionTarget } from '@/types/automator';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
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

interface PickedElement {
  name: string;
  role: string;
  window_title?: string;
  process_name?: string;
  x: number;
  y: number;
}

interface ActionNodeData {
  actionType: AutomatorAction['type'];
  payload: AutomatorAction['payload'];
  onChange: (payload: AutomatorAction['payload']) => void;
  isExecuting?: boolean;
}

export const ActionNode = memo((props: NodeProps) => {
  const data = props.data as unknown as ActionNodeData;
  const { actionType, payload, isExecuting, onChange } = data;
  const { t } = useTranslation();

  const Icon = ICONS[actionType] || MousePointer2;
  const title = t(`automator.${TITLE_KEYS[actionType] || actionType}`);

  const [isPickingCoords, setIsPickingCoords] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [currentKeys, setCurrentKeys] = useState<Set<string>>(new Set());
  const recordingRef = useRef<HTMLDivElement>(null);

  const handleChange = (key: string, value: any) => {
    onChange({ ...payload, [key]: value });
  };

  // 核心：统一的 3 秒智能拾取逻辑
  const handleSmartPick = async () => {
    setIsPickingCoords(true);

    // 给予 3 秒钟时间，用户可以移动鼠标到目标、甚至点开下拉菜单
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      // 呼叫后端抓取当前鼠标位置的特征
      const element = await invoke<PickedElement>('plugin:ctxrun-plugin-automator|get_element_under_cursor');

      let target: ActionTarget;

      // 如果抓取到了有效语义 (Name非空)，就用语义定位；否则降级为绝对坐标
      if (element.name && element.name.trim() !== '') {
        target = {
          type: 'Semantic',
          name: element.name,
          role: element.role,
          window_title: element.window_title,
          process_name: element.process_name,
          fallbackX: element.x,
          fallbackY: element.y
        };
      } else {
        target = {
          type: 'Coordinate',
          x: element.x,
          y: element.y
        };
      }

      handleChange('target', target);
    } catch (error) {
      console.error('智能拾取失败:', error);
    } finally {
      setIsPickingCoords(false);
    }
  };

  // 键盘录制逻辑...
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

      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        let key = e.key;
        if (key === ' ') key = 'Space';
        if (key.length === 1) key = key.toUpperCase();
        keys.add(key);

        const shortcut = Array.from(keys).join('+');
        handleChange('key', shortcut);
        setIsRecording(false);
        setCurrentKeys(new Set());
      }
      setCurrentKeys(keys);
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isRecording) {
        e.preventDefault();
        setIsRecording(false);
        setCurrentKeys(new Set());
      }
    };

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

  // 渲染拾取到的目标信息
  const renderTargetInfo = (target?: ActionTarget) => {
    if (!target) return null;
    return (
      <div className="text-[10px] bg-secondary/50 p-2 rounded border border-border">
        {target.type === 'Semantic' ? (
          <>
            <div className="font-bold text-blue-500 mb-0.5">{target.role}</div>
            <div className="truncate opacity-80 font-medium" title={target.name}>
              "{target.name}"
            </div>
            <div className="text-[9px] text-muted-foreground mt-1">Fallback: {target.fallbackX}, {target.fallbackY}</div>
          </>
        ) : (
          <>
            <div className="font-bold text-orange-500 mb-0.5">绝对坐标 (Coordinate)</div>
            <div className="font-mono opacity-80">
              X: {target.x}, Y: {target.y}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className={cn(
      "w-[250px] bg-card border rounded-lg shadow-sm transition-all duration-300 text-xs",
      props.selected ? "border-primary ring-1 ring-primary" : "border-border",
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

        {/* 支持智能拾取的节点类型 */}
        {(actionType === 'MoveTo' || actionType === 'Click' || actionType === 'DoubleClick' || actionType === 'Type') && (
          <div className="space-y-2">
            {renderTargetInfo((payload as { target?: ActionTarget }).target)}

            <button
              onClick={handleSmartPick}
              disabled={isPickingCoords}
              className={cn(
                "w-full flex items-center justify-center gap-2 px-2 py-1.5 rounded text-xs font-medium transition-all",
                isPickingCoords
                  ? "bg-primary/20 text-primary animate-pulse"
                  : "bg-primary/10 text-primary hover:bg-primary/20 hover:shadow-sm"
              )}
            >
              <Crosshair size={14} className={cn(isPickingCoords && "animate-spin")} />
              {isPickingCoords ? "请将鼠标悬停在目标上..." : "智能拾取目标 (3秒延迟)"}
            </button>
          </div>
        )}

        {(actionType === 'Click' || actionType === 'DoubleClick') && (
          <select
            className="w-full bg-background border border-border rounded px-2 py-1 mt-2"
            value={(payload as { button: MouseButton }).button}
            onChange={(e) => handleChange('button', e.target.value as MouseButton)}
          >
            <option value="Left">{t('automator.leftButton')}</option>
            <option value="Right">{t('automator.rightButton')}</option>
            <option value="Middle">{t('automator.middleButton')}</option>
          </select>
        )}

        {actionType === 'Type' && (
           <input
              type="text"
              className="w-full bg-background border border-border rounded px-2 py-1 mt-2"
              placeholder={t('automator.textToType')}
              value={(payload as { text: string }).text}
              onChange={(e) => handleChange('text', e.target.value)}
            />
        )}

        {/* 其他如 KeyPress, Wait 等保持不变... */}
        {actionType === 'KeyPress' && (
          <div className="space-y-1">
             <label className="text-[10px] text-muted-foreground block">{t('automator.pressKey')}</label>
             <div className="flex gap-1">
               <div
                 ref={recordingRef}
                 onClick={() => { setIsRecording(true); setCurrentKeys(new Set()); }}
                 className={cn(
                   "flex-1 px-2 py-1.5 rounded border border-border bg-background text-center cursor-pointer transition-all select-none",
                   isRecording ? "border-primary bg-primary/10 ring-2 ring-primary/20" : "hover:border-primary/50"
                 )}
               >
                 <span className={cn("font-mono text-[11px]", isRecording ? "text-primary" : "text-foreground")}>
                   {isRecording ? (currentKeys.size > 0 ? Array.from(currentKeys).join(' + ') : "Press keys...") : ((payload as { key: string }).key || "Click to record")}
                 </span>
               </div>
               {((payload as { key: string }).key) && !isRecording && (
                 <button onClick={() => handleChange('key', '')} className="px-2 rounded border border-border bg-secondary/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors">
                   <X size={12} />
                 </button>
               )}
             </div>
          </div>
        )}

        {actionType === 'Wait' && (
           <NumberInput value={(payload as { ms: number }).ms} onChange={(val) => handleChange('ms', val)} className="flex-1" />
        )}

      </div>

      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-muted-foreground/50 hover:!bg-primary" />
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-muted-foreground/50 hover:!bg-primary" />
    </div>
  );
});
