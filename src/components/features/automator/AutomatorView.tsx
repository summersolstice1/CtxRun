import { useEffect, useState } from 'react';
import {
  Play, Square, MousePointerClick, Crosshair,
  Clock, RotateCcw, AlertCircle, Hash, Mouse
} from 'lucide-react';
import { useAutomatorStore } from '@/store/useAutomatorStore';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { getText } from '@/lib/i18n';
import { Toast, ToastType } from '@/components/ui/Toast';

export function AutomatorView() {
  const { language } = useAppStore();
  const {
    config, isRunning, clickCount, isPicking,
    setConfig, toggle, pickLocation, initListeners, unlisten
  } = useAutomatorStore();

  const [toast, setToast] = useState<{show: boolean, msg: string, type: ToastType}>({
    show: false, msg: '', type: 'info'
  });

  // 初始化监听器
  useEffect(() => {
    initListeners();
    return () => {
      unlisten();
    };
  }, []);

  // 监听拾取状态
  useEffect(() => {
    if (isPicking) {
        setToast({
            show: true,
            msg: getText('automator', 'pickingMessage', language),
            type: 'info'
        });
    }
  }, [isPicking, language]);

  const handleStopCountChange = (val: string) => {
    const count = parseInt(val) || 0;
    setConfig({ stopCondition: { MaxCount: count } });
  };

  const getStopCountValue = () => {
    if (typeof config.stopCondition === 'object' && 'MaxCount' in config.stopCondition) {
        return config.stopCondition.MaxCount;
    }
    return 100;
  };

  const isInfinite = config.stopCondition === 'Infinite';

  return (
    <div className="h-full flex flex-col bg-background animate-in fade-in duration-300">
      {/* 顶部标题栏 */}
      <div className="h-14 border-b border-border flex items-center px-6 shrink-0 bg-secondary/5">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <MousePointerClick className="text-primary" size={20} />
          {getText('automator', 'title', language)}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">

          {/* 左侧：配置面板 */}
          <div className={cn(
            "bg-card border border-border rounded-xl p-5 shadow-sm space-y-6 transition-opacity",
            isRunning && "opacity-60 pointer-events-none grayscale-[0.5]"
          )}>

            {/* 点击间隔 */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Clock size={14} /> {getText('automator', 'interval', language)}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  value={config.intervalMs}
                  onChange={(e) => setConfig({ intervalMs: Math.max(1, parseInt(e.target.value) || 100) })}
                  className="flex-1 bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none font-mono"
                />
                <div className="text-xs text-muted-foreground">ms</div>
              </div>
              <input
                type="range"
                min="1"
                max="5000"
                step="10"
                value={config.intervalMs}
                onChange={(e) => setConfig({ intervalMs: parseInt(e.target.value) })}
                className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>

            <div className="h-px bg-border/50" />

            {/* 按键类型 */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Mouse size={14} /> {getText('automator', 'clickType', language)}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['Left', 'Right', 'Middle'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setConfig({ clickType: type as any })}
                    className={cn(
                      "px-3 py-2 rounded-md text-sm border transition-all",
                      config.clickType === type
                        ? "bg-primary/10 border-primary text-primary font-bold"
                        : "bg-secondary/30 border-border hover:bg-secondary/50"
                    )}
                  >
                    {getText('automator', type.toLowerCase() as any, language)}
                  </button>
                ))}
              </div>
            </div>

            {/* 停止条件 */}
            <div className="space-y-3">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <AlertCircle size={14} /> {getText('automator', 'stopCondition', language)}
              </label>
              <div className="flex flex-col gap-3">
                <label className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-secondary/20 transition-colors">
                  <input
                    type="radio"
                    checked={isInfinite}
                    onChange={() => setConfig({ stopCondition: 'Infinite' })}
                    className="accent-primary w-4 h-4"
                  />
                  <span className="text-sm font-medium">{getText('automator', 'conditionInfinite', language)}</span>
                  <RotateCcw size={14} className="ml-auto text-muted-foreground" />
                </label>

                <label className="flex items-center gap-3 p-3 border border-border rounded-lg cursor-pointer hover:bg-secondary/20 transition-colors">
                  <input
                    type="radio"
                    checked={!isInfinite}
                    onChange={() => setConfig({ stopCondition: { MaxCount: 100 } })}
                    className="accent-primary w-4 h-4"
                  />
                  <span className="text-sm font-medium">{getText('automator', 'conditionCount', language)}</span>
                  <Hash size={14} className="ml-auto text-muted-foreground" />
                </label>

                {!isInfinite && (
                  <div className="pl-7 animate-in slide-in-from-top-1 fade-in">
                    <input
                      type="number"
                      min="1"
                      value={getStopCountValue()}
                      onChange={(e) => handleStopCountChange(e.target.value)}
                      className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 坐标设置 */}
            <div className="space-y-3">
               <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                <Crosshair size={14} /> {getText('automator', 'location', language)}
              </label>
              <div className="flex flex-col gap-3">
                 <div className="flex items-center gap-2">
                    <button
                        onClick={() => setConfig({ useFixedLocation: false })}
                        className={cn("flex-1 py-2 text-xs rounded-md border transition-all", !config.useFixedLocation ? "bg-primary/10 border-primary text-primary font-bold" : "bg-secondary/30 border-border")}
                    >
                        {getText('automator', 'locCurrent', language)}
                    </button>
                    <button
                        onClick={() => setConfig({ useFixedLocation: true })}
                        className={cn("flex-1 py-2 text-xs rounded-md border transition-all", config.useFixedLocation ? "bg-primary/10 border-primary text-primary font-bold" : "bg-secondary/30 border-border")}
                    >
                        {getText('automator', 'locFixed', language)}
                    </button>
                 </div>

                 {config.useFixedLocation && (
                     <div className="flex items-center gap-2 animate-in fade-in">
                        <div className="flex-1 flex gap-2">
                            <input disabled value={config.fixedX} className="w-1/2 bg-secondary/50 border border-border rounded px-2 py-1 text-xs text-center font-mono" />
                            <input disabled value={config.fixedY} className="w-1/2 bg-secondary/50 border border-border rounded px-2 py-1 text-xs text-center font-mono" />
                        </div>
                        <button
                            onClick={pickLocation}
                            disabled={isPicking}
                            className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-md hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
                            title={getText('automator', 'pickTooltip', language)}
                        >
                            {isPicking ? '...' : getText('automator', 'pickBtn', language)}
                        </button>
                     </div>
                 )}
              </div>
            </div>

          </div>

          {/* 右侧：状态与控制 */}
          <div className="flex flex-col gap-6">

             {/* 状态卡片 */}
             <div className="flex-1 bg-gradient-to-br from-secondary/30 to-background border border-border rounded-xl p-8 flex flex-col items-center justify-center text-center shadow-inner relative overflow-hidden">
                <div className="absolute inset-0 bg-grid-slate-900/[0.04] bg-[bottom_1px_center] dark:bg-grid-slate-400/[0.05] [mask-image:linear-gradient(to_bottom,transparent,black)] pointer-events-none" />

                <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-widest mb-4 z-10">
                    {getText('automator', 'countLabel', language)}
                </h3>
                <div className="text-7xl font-bold tabular-nums tracking-tighter text-foreground z-10 mb-2">
                    {clickCount.toLocaleString()}
                </div>
                <div className={cn(
                    "text-xs font-bold px-3 py-1 rounded-full z-10 transition-colors",
                    isRunning
                        ? "bg-green-500/10 text-green-600 border border-green-500/20 animate-pulse"
                        : "bg-secondary text-muted-foreground border border-border"
                )}>
                    {isRunning ? getText('automator', 'statusRunning', language) : getText('automator', 'statusStopped', language)}
                </div>
             </div>

             {/* 巨型控制按钮 */}
             <button
                onClick={toggle}
                className={cn(
                    "h-24 w-full rounded-2xl flex items-center justify-center gap-4 text-2xl font-bold transition-all shadow-lg active:scale-[0.98] ring-offset-2 focus:ring-2",
                    isRunning
                        ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-destructive/20 ring-destructive/50"
                        : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/20 ring-primary/50"
                )}
             >
                {isRunning ? (
                    <>
                        <Square className="fill-current" size={32} />
                        {getText('automator', 'stopBtn', language)}
                    </>
                ) : (
                    <>
                        <Play className="fill-current" size={32} />
                        {getText('automator', 'startBtn', language)}
                    </>
                )}
             </button>

             <div className="text-center text-xs text-muted-foreground/60">
                ⚠️ {language === 'zh' ? '请确保在使用前设置好停止快捷键，以防无法控制。' : 'Please ensure the stop shortcut works before use.'}
             </div>
          </div>

        </div>
      </div>

      <Toast
        show={toast.show}
        message={toast.msg}
        type={toast.type}
        onDismiss={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </div>
  );
}
