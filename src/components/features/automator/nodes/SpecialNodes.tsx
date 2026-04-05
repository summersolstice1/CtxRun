import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { PlayCircle, StopCircle, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { AutomatorAction } from '@/types/automator';

export const StartNode = memo(() => {
  const { t } = useTranslation();
  return (
    <div className="px-5 py-2.5 shadow-lg rounded-full bg-emerald-500 border-2 border-emerald-600 text-white flex items-center gap-2 min-w-[120px] justify-center">
      <PlayCircle size={18} className="animate-pulse" />
      <span className="text-xs font-bold uppercase tracking-[0.1em]">{t('automator.startNode')}</span>
      {/* 只有输出桩，禁止输入 */}
      <Handle type="source" position={Position.Bottom} className="!bg-white !w-3 !h-3 border-2 border-emerald-600" />
    </div>
  );
});

export const EndNode = memo(() => {
  const { t } = useTranslation();
  return (
    <div className="px-5 py-2.5 shadow-lg rounded-full bg-rose-500 border-2 border-rose-600 text-white flex items-center gap-2 min-w-[120px] justify-center">
      <StopCircle size={18} />
      <span className="text-xs font-bold uppercase tracking-[0.1em]">{t('automator.endNode')}</span>
      {/* 只有输入桩，禁止输出 */}
      <Handle type="target" position={Position.Top} className="!bg-white !w-3 !h-3 border-2 border-rose-600" />
    </div>
  );
});

interface LaunchBrowserData {
  payload: Extract<AutomatorAction, { type: 'LaunchBrowser' }>['payload'];
  onChange: (payload: any) => void;
  isExecuting?: boolean;
}

export const LaunchBrowserNode = memo((props: NodeProps) => {
  const { t } = useTranslation();
  const data = props.data as unknown as LaunchBrowserData;
  const { payload, onChange, isExecuting } = data;

  const handleChange = (key: string, val: any) => {
    onChange({ ...payload, [key]: val });
  };

  return (
    <div className={cn(
      "w-[240px] bg-card border-2 rounded-lg shadow-sm transition-all duration-300 text-xs",
      props.selected ? "border-purple-500 ring-1 ring-primary" : "border-border",
      isExecuting && "border-purple-400 ring-4 ring-purple-500/20 scale-105 z-50"
    )}>
      <div className="bg-purple-500/10 text-purple-600 px-3 py-2 text-[10px] font-bold border-b border-purple-500/20 flex items-center gap-2 rounded-t-lg">
        <Globe size={12} />
        <span>{t('automator.launchBrowserCdp')}</span>
        {isExecuting && <div className="ml-auto w-2 h-2 bg-purple-500 rounded-full animate-ping" />}
      </div>

      <div className="p-3 space-y-3 nodrag">
        <div className="space-y-1">
          <label className="text-[9px] text-muted-foreground">{t('automator.browserType')}</label>
          <div className="flex gap-2">
            <button
                onClick={() => handleChange('browser', 'Chrome')}
                className={cn("flex-1 py-1 rounded border text-[10px] transition-colors", payload.browser === 'Chrome' ? "bg-purple-100 border-purple-300 text-purple-700" : "bg-background")}
            >Chrome</button>
            <button
                onClick={() => handleChange('browser', 'Edge')}
                className={cn("flex-1 py-1 rounded border text-[10px] transition-colors", payload.browser === 'Edge' ? "bg-purple-100 border-purple-300 text-purple-700" : "bg-background")}
            >Edge</button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[9px] text-muted-foreground">{t('automator.startUrl')}</label>
          <input
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs font-mono"
            placeholder="https://www.google.com"
            value={payload.url || ''}
            onChange={(e) => handleChange('url', e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
            <input
                type="checkbox"
                checked={payload.useTempProfile !== false}
                onChange={(e) => handleChange('useTempProfile', e.target.checked)}
                id="use-temp"
            />
            <label htmlFor="use-temp" className="text-[9px] text-muted-foreground cursor-pointer">
                {t('automator.useTempProfile')}
            </label>
        </div>
      </div>

      <Handle type="target" position={Position.Top} className="!w-3 !h-3 !bg-muted-foreground/50 hover:!bg-purple-500" />
      <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-muted-foreground/50 hover:!bg-purple-500" />
    </div>
  );
});
