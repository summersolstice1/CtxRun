// src/components/features/miner/MinerView.tsx
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMinerStore } from '@/store/useMinerStore';
import { useAppStore } from '@/store/useAppStore';
import { open } from '@tauri-apps/plugin-dialog';
import { Globe, FolderOpen, Play, Square, Settings2, ShieldCheck, TerminalSquare, AlertCircle, CheckCircle2, Loader2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NumberInput } from '@/components/ui/NumberInput';

export function MinerView() {
  const { t } = useTranslation();
  const projectRoot = useAppStore(state => state.projectRoot);
  const setProjectRoot = useAppStore(state => state.setProjectRoot);
  const {
    config, setConfig,
    isRunning, progress, logs,
    startMining, stopMining, clearLogs,
    initListeners
  } = useMinerStore();

  // 只做初始化，不在切页时卸载，避免事件链路丢失
  useEffect(() => {
    void initListeners();
  }, []);

  const handleSelectProjectRoot = async () => {
    if (isRunning) return;
    try {
      const selected = await open({ directory: true, multiple: false });
      if (selected && typeof selected === 'string') {
        setProjectRoot(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleUrlChange = (val: string) => {
    // 智能联动：当用户输入 URL 时，自动把 Match Prefix 设为同样的值（大部分情况下的默认需求）
    setConfig({ url: val, matchPrefix: val });
  };

  return (
    <div className="h-full flex flex-col bg-background animate-in fade-in duration-300">
      {/* 顶部标题栏 */}
      <div className="h-14 border-b border-border flex items-center px-6 justify-between bg-secondary/5 shrink-0">
        <div className="flex items-center gap-3">
          <Globe className="text-primary" size={20} />
          <h2 className="font-semibold text-foreground">{t('miner.title')}</h2>
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <button onClick={stopMining} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-destructive text-white hover:bg-destructive/90 transition-all shadow-sm">
              <Square size={14} fill="currentColor" /> {t('miner.stopTask')}
            </button>
          ) : (
            <button onClick={startMining} className="flex items-center gap-2 px-6 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-sm">
              <Play size={14} fill="currentColor" /> {t('miner.startMining')}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* 左侧：配置区域 */}
        <div className="w-[400px] border-r border-border bg-card p-6 overflow-y-auto custom-scrollbar flex flex-col gap-6">

          <div className="space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <Settings2 size={14} /> {t('miner.basicSettings')}
            </h3>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">{t('miner.seedUrl')}</label>
              <input
                disabled={isRunning}
                value={config.url}
                onChange={e => handleUrlChange(e.target.value)}
                placeholder={t('miner.urlPlaceholder')}
                className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all disabled:opacity-50 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">{t('miner.scopeMatchPrefix')}</label>
              <input
                disabled={isRunning}
                value={config.matchPrefix}
                onChange={e => setConfig({ matchPrefix: e.target.value })}
                className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all font-mono"
              />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {t('miner.scopePrefixTooltip')}
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">{t('miner.outputDirectory')}</label>
              <button
                disabled={isRunning}
                onClick={handleSelectProjectRoot}
                className="w-full flex items-center justify-between bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm hover:border-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="truncate flex-1 text-left mr-2">
                  {projectRoot || t('miner.selectFolder')}
                </span>
                <FolderOpen size={16} className="text-muted-foreground shrink-0" />
              </button>
            </div>
          </div>

          <div className="w-full h-px bg-border/50" />

          <div className="space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck size={14} /> {t('miner.limitsSafety')}
            </h3>

            <div className="grid grid-cols-3 gap-4">
              <NumberInput
                label={t('miner.maxDepth')}
                value={config.maxDepth}
                onChange={v => setConfig({ maxDepth: v })}
                min={0} max={10}
                className={isRunning ? "opacity-50 pointer-events-none" : ""}
              />
              <NumberInput
                label={t('miner.maxPages')}
                value={config.maxPages}
                onChange={v => setConfig({ maxPages: v })}
                min={1} max={5000} step={10}
                className={isRunning ? "opacity-50 pointer-events-none" : ""}
              />
              <NumberInput
                label={t('miner.concurrency')}
                value={config.concurrency ?? 5}
                onChange={v => setConfig({ concurrency: Math.max(1, Math.min(10, v)) })}
                min={1} max={10}
                className={isRunning ? "opacity-50 pointer-events-none" : ""}
              />
            </div>

            <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg flex gap-2 items-start text-xs text-blue-500/80">
                <Info size={14} className="shrink-0 mt-0.5" />
                <p dangerouslySetInnerHTML={{ __html: t('miner.contextForgeTip') }} />
            </div>
          </div>
        </div>

        {/* 右侧：日志与监控台 */}
        <div className="flex-1 flex flex-col bg-background relative">
          <div className="h-10 border-b border-border/50 bg-secondary/5 flex items-center justify-between px-4 shrink-0">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <TerminalSquare size={12} /> {t('miner.executionConsole')}
            </span>
            <button onClick={clearLogs} className="text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors">
              {t('miner.clearLogs')}
            </button>
          </div>

          {/* 进度条展示区 - 使用固定高度避免跳动 */}
          <div className="p-4 border-b border-border bg-primary/5 shrink-0" style={{ minHeight: isRunning ? 'auto' : '0', padding: isRunning ? '16px' : '0' }}>
            {isRunning && progress && (
              <div className="flex flex-col gap-3">
                <div className="flex justify-between items-end">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-semibold text-foreground truncate max-w-md">{t('miner.processing')} {progress.currentUrl.replace(/^https?:\/\//, '')}</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-2">
                      {progress.status === 'Fetching' ? <Loader2 size={12} className="animate-spin text-primary" /> : <CheckCircle2 size={12} className="text-green-500" />}
                      {progress.status === 'Fetching' ? t('miner.logStatusFetching') : t('miner.logStatusSaved')}...
                    </span>
                  </div>
                  <div className="text-right flex flex-col items-end">
                     <span className="text-xs font-mono font-bold">{progress.current} / {Math.min(progress.totalDiscovered, config.maxPages)}</span>
                     <span className="text-[10px] text-muted-foreground">{progress.totalDiscovered} {t('miner.discovered')}</span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300 ease-out"
                    style={{ width: `${Math.min((progress.current / Math.max(Math.min(progress.totalDiscovered, config.maxPages), 1)) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* 日志输出区 */}
          <div className="flex-1 overflow-y-auto p-4 font-mono text-[11px] leading-relaxed custom-scrollbar bg-[#0f111a] text-slate-300">
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-30 select-none">
                <TerminalSquare size={32} className="mb-2" />
                <span>{t('miner.readyToExecute')}</span>
              </div>
            ) : (
              <div className="space-y-1.5 flex flex-col-reverse">
                {logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-3 break-all hover:bg-white/5 px-2 py-1 rounded">
                    <span className="text-slate-500 shrink-0">
                      [{new Date(log.timestamp).toLocaleTimeString()}]
                    </span>
                    <span className={cn(
                      "shrink-0",
                      log.type === 'error' ? "text-red-400" :
                      log.type === 'success' ? "text-green-400" :
                      log.type === 'warning' ? "text-yellow-400" : "text-blue-400"
                    )}>
                      {log.type === 'error' ? <AlertCircle size={12} className="mt-0.5" /> :
                       log.type === 'success' ? <CheckCircle2 size={12} className="mt-0.5" /> :
                       log.type === 'warning' ? <Info size={12} className="mt-0.5" /> :
                       <Globe size={12} className="mt-0.5" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className={cn(log.type === 'error' && "text-red-300")}>{log.message}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
