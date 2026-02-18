import { useState, useEffect, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import {
  Search, Trash2, RefreshCw, Network, Shield, ShieldAlert,
  FileSearch, FolderOpen, FileQuestion, AlertTriangle
} from 'lucide-react';
import { useConfirmStore } from '@/store/useConfirmStore';
import { useTranslation } from 'react-i18next';
import { PortInfo, LockedFileProcess } from '@/types/monitor';
import { cn } from '@/lib/utils';
import { Toast, ToastType } from '@/components/ui/Toast';

type ViewMode = 'ports' | 'files';

export function PortManager() {
  const { t } = useTranslation();
  const confirm = useConfirmStore();
  
  const [mode, setMode] = useState<ViewMode>('ports');
  
  // --- Ports State ---
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [portSearch, setPortSearch] = useState('');
  const [isPortsLoading, setIsPortsLoading] = useState(false);

  // --- File Locks State ---
  const [lockPath, setLockPath] = useState('');
  const [lockedProcesses, setLockedProcesses] = useState<LockedFileProcess[]>([]);
  const [isCheckingLocks, setIsCheckingLocks] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const [toast, setToast] = useState<{show: boolean, msg: string, type: ToastType}>({ show: false, msg: '', type: 'success' });

  // ==========================
  // Ports Logic
  // ==========================
  const fetchPorts = async () => {
    setIsPortsLoading(true);
    try {
      const data = await invoke<PortInfo[]>('get_active_ports');
      setPorts(data.sort((a, b) => a.port - b.port));
    } catch (e) {
      console.error(e);
      setToast({ show: true, msg: t('toast.portScanFailed'), type: 'error' });
    } finally {
      setIsPortsLoading(false);
    }
  };

  const filteredPorts = useMemo(() => {
    const q = portSearch.toLowerCase();
    return ports.filter(p => 
      p.port.toString().includes(q) || 
      p.process_name.toLowerCase().includes(q) ||
      p.pid.toString().includes(q) ||
      (p.local_addr && p.local_addr.includes(q))
    );
  }, [ports, portSearch]);

  // ==========================
  // File Locks Logic
  // ==========================
  const checkFileLocks = async (path: string = lockPath) => {
    if (!path.trim()) return;
    setIsCheckingLocks(true);
    setLockedProcesses([]);
    setHasChecked(false); 
    try {
      const cleanPath = path.replace(/^["']|["']$/g, '');
      const data = await invoke<LockedFileProcess[]>('check_file_locks', { path: cleanPath });
      setLockedProcesses(data);
      setHasChecked(true);
    } catch (e: any) {
      console.error(e);
      setToast({ show: true, msg: t('monitor.fileLockCheckFailed'), type: 'error' });
    } finally {
      setIsCheckingLocks(false);
    }
  };

  const handleBrowse = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false, 
      });
      
      if (selected && typeof selected === 'string') {
        setLockPath(selected);
        checkFileLocks(selected);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // ==========================
  // Shared Actions
  // ==========================
  useEffect(() => {
    if (mode === 'ports') fetchPorts();
  }, [mode]);

  const handleKill = async (pid: number, name: string, isSystem: boolean) => {
    if (isSystem) {
        setToast({ show: true, msg: t('toast.cannotKillSystem'), type: 'warning' });
        return;
    }

    const isExplorer = name.toLowerCase() === 'explorer.exe';

    const title = isExplorer ? 'Restart Explorer?' : t('monitor.confirmKill');
    const message = isExplorer
        ? t('monitor.killWarnExplorer')
        : t('monitor.killMsg', { name, pid: pid.toString() });

    const confirmed = await confirm.ask({
        title,
        message,
        type: isExplorer ? 'warning' : 'danger',
        confirmText: t('monitor.kill'),
        cancelText: t('prompts.cancel')
    });

    if (!confirmed) return;

    try {
        await invoke('kill_process', { pid });
        setToast({ show: true, msg: t('monitor.killSuccess'), type: 'success' });

        if (mode === 'ports') {
            setTimeout(fetchPorts, 800);
        } else {
            setTimeout(() => checkFileLocks(), 800);
        }
    } catch (err: any) {
        setToast({ show: true, msg: t('toast.error', { msg: err }), type: 'error' });
    }
  };

  return (
    <div className="h-full flex flex-col p-6 animate-in fade-in duration-300">
        
        {/* Top Control Bar */}
        <div className="flex flex-col gap-4 mb-4 shrink-0">
            {/* Tabs */}
            <div className="flex p-1 bg-secondary/50 rounded-lg border border-border/50 self-start">
                <button
                    onClick={() => setMode('ports')}
                    className={cn(
                        "flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-md transition-all",
                        mode === 'ports' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Network size={14} />
                    {t('monitor.tabPorts')}
                </button>
                <button
                    onClick={() => setMode('files')}
                    className={cn(
                        "flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-md transition-all",
                        mode === 'files' ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <FileSearch size={14} />
                    {t('monitor.tabFiles')}
                </button>
            </div>

            {/* Function Bar */}
            <div className="flex gap-3">
                {mode === 'ports' ? (
                    <>
                        <div className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                            <input
                                className="w-full bg-secondary/30 border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50"
                                placeholder={t('monitor.searchPorts')}
                                value={portSearch}
                                onChange={e => setPortSearch(e.target.value)}
                                autoFocus
                            />
                        </div>
                        <button
                            onClick={fetchPorts}
                            disabled={isPortsLoading}
                            className="px-4 bg-secondary hover:bg-secondary/80 border border-border rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            <RefreshCw size={16} className={cn(isPortsLoading && "animate-spin")} />
                            {t('monitor.refresh')}
                        </button>
                    </>
                ) : (
                    <>
                        <div className="flex-1 relative flex gap-2">
                            <div className="relative flex-1">
                                <FileSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                                <input
                                    className="w-full bg-secondary/30 border border-border rounded-lg pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50"
                                    placeholder={t('monitor.pathPlaceholder')}
                                    value={lockPath}
                                    onChange={e => setLockPath(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && checkFileLocks()}
                                />
                            </div>
                            <button
                                onClick={handleBrowse}
                                className="px-3 bg-secondary/50 hover:bg-secondary border border-border rounded-lg text-muted-foreground transition-colors"
                                title={t('monitor.browse')}
                            >
                                <FolderOpen size={16} />
                            </button>
                        </div>
                        <button
                            onClick={() => checkFileLocks()}
                            disabled={isCheckingLocks || !lockPath}
                            className="px-6 bg-primary text-primary-foreground hover:bg-primary/90 border border-transparent rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm"
                        >
                            {isCheckingLocks ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                            {t('monitor.checkLocks')}
                        </button>
                    </>
                )}
            </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 border border-border rounded-xl bg-background overflow-hidden flex flex-col shadow-sm min-h-0 relative">
            
            {/* View: Active Ports */}
            {mode === 'ports' && (
                <>
                    <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-secondary/30 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                        <div className="col-span-2">{t('monitor.port')}</div>
                        <div className="col-span-1">{t('monitor.proto')}</div>
                        <div className="col-span-3">{t('monitor.localAddr')}</div>
                        <div className="col-span-2">{t('monitor.procPid')}</div>
                        <div className="col-span-3">{t('monitor.procName')}</div>
                        <div className="col-span-1 text-right">{t('monitor.action')}</div>
                    </div>
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-1 space-y-1">
                        {filteredPorts.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 gap-2">
                                <Network size={32} />
                                <p className="text-sm">{t('monitor.emptyPorts')}</p>
                            </div>
                        ) : (
                            filteredPorts.map((p, i) => (
                                <div key={`${p.port}-${p.protocol}-${p.pid}-${p.local_addr}-${i}`} className={cn("grid grid-cols-12 gap-2 px-3 py-2.5 items-center hover:bg-secondary/40 rounded-lg transition-colors text-sm group", p.is_system && "opacity-80 bg-secondary/10")}>
                                    <div className="col-span-2 font-mono text-primary font-bold flex items-center gap-1.5">
                                        {p.port}
                                        {p.is_system && (
                                            <div title={t('monitor.systemPort')}>
                                                <Shield size={12} className="text-green-500" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="col-span-1 text-muted-foreground text-xs font-mono">{p.protocol}</div>
                                    <div className="col-span-3 text-muted-foreground text-xs font-mono truncate" title={p.local_addr}>{p.local_addr || '0.0.0.0'}</div>
                                    <div className="col-span-2 font-mono text-muted-foreground">{p.pid}</div>
                                    <div className="col-span-3 font-medium truncate flex items-center gap-1.5" title={p.process_name}>{p.process_name}</div>
                                    <div className="col-span-1 text-right">
                                        <ActionBtn
                                            isSystem={p.is_system}
                                            isExplorer={false}
                                            onClick={() => handleKill(p.pid, p.process_name, p.is_system)}
                                            label={t('monitor.kill')}
                                            sysLabel={t('monitor.protected')}
                                            t={t}
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </>
            )}

            {/* View: File Locks */}
            {mode === 'files' && (
                <>
                    {/* Empty State */}
                    {!hasChecked && !isCheckingLocks && (
                        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-4 opacity-60">
                            <div className="w-16 h-16 bg-secondary/50 rounded-full flex items-center justify-center">
                                <FileQuestion size={32} />
                            </div>
                            <div className="text-center max-w-xs">
                                <p className="text-sm">{t('monitor.enterPathHint')}</p>
                            </div>
                        </div>
                    )}

                    {/* Results */}
                    {hasChecked && (
                        <>
                            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-secondary/30 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
                                <div className="col-span-2">{t('monitor.procPid')}</div>
                                <div className="col-span-4">{t('monitor.procName')}</div>
                                <div className="col-span-4">{t('monitor.procUser')}</div>
                                <div className="col-span-2 text-right">{t('monitor.action')}</div>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-1 space-y-1">
                                {lockedProcesses.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-green-600/70 gap-2">
                                        <ShieldAlert size={32} className="opacity-50" />
                                        <p className="text-sm font-medium">{t('monitor.noLocks')}</p>
                                    </div>
                                ) : (
                                    lockedProcesses.map((p) => {
                                        const isExplorer = p.name.toLowerCase() === 'explorer.exe';
                                        return (
                                            <div key={p.pid} className={cn("grid grid-cols-12 gap-2 px-3 py-2.5 items-center hover:bg-secondary/40 rounded-lg transition-colors text-sm group", p.is_system && "opacity-80 bg-secondary/10")}>
                                                <div className="col-span-2 font-mono text-muted-foreground">{p.pid}</div>
                                                <div className="col-span-4 font-medium flex items-center gap-1.5">
                                                    <span className="truncate" title={p.name}>{p.name}</span>
                                                    {p.is_system && (
                                                        <div title={t('monitor.systemProcessProtected')}>
                                                            <Shield size={12} className="text-green-500 shrink-0" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="col-span-4 text-muted-foreground text-xs">{p.user}</div>
                                                <div className="col-span-2 text-right">
                                                    <ActionBtn
                                                        isSystem={p.is_system}
                                                        isExplorer={isExplorer}
                                                        onClick={() => handleKill(p.pid, p.name, p.is_system)}
                                                        label={t('monitor.kill')}
                                                        sysLabel={t('monitor.protected')}
                                                        t={t}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            <div className="px-4 py-2 bg-secondary/10 border-t border-border text-[10px] text-muted-foreground flex justify-between shrink-0">
                                <span><code className="bg-secondary/50 px-1 rounded">{lockPath}</code></span>
                                <span>{t('monitor.locksFound', { count: lockedProcesses.length })}</span>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>

        <Toast show={toast.show} message={toast.msg} type={toast.type} onDismiss={() => setToast(prev => ({...prev, show: false}))} />
    </div>
  );
}

// 提取的 Action Button 组件，处理复杂的按钮状态
function ActionBtn({ isSystem, isExplorer, onClick, label, sysLabel, t }: any) {
    if (isSystem) {
        return (
            <div className="flex justify-end text-muted-foreground/30 cursor-not-allowed" title={sysLabel}>
                <ShieldAlert size={14} />
            </div>
        );
    }

    if (isExplorer) {
        const restartLabel = t('monitor.restart');
        return (
            <button
                onClick={onClick}
                className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-500/10 text-yellow-600 border border-yellow-500/20 hover:bg-yellow-500/20 rounded-md transition-colors text-xs font-medium ml-auto"
                title={restartLabel}
            >
                <AlertTriangle size={12} />
                <span className="hidden sm:inline">{restartLabel}</span>
            </button>
        )
    }

    return (
        <button
            onClick={onClick}
            className="p-1.5 bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground rounded-md transition-colors opacity-0 group-hover:opacity-100 ml-auto"
            title={label}
        >
            <Trash2 size={14} />
        </button>
    );
}