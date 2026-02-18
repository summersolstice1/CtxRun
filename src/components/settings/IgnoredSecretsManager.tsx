import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import {
  Trash2, ShieldCheck, AlertCircle, RefreshCw,
  Copy, Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface IgnoredSecret {
  id: string;
  value: string;
  rule_id: string;
  created_at: number;
}

export function IgnoredSecretsManager() {
  const { t } = useTranslation();
  const [secrets, setSecrets] = useState<IgnoredSecret[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchSecrets = async () => {
    setLoading(true);
    try {
      const data = await invoke<IgnoredSecret[]>('get_ignored_secrets');
      setSecrets(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecrets();
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm(t('settings.confirmDeleteSecret'))) return;
    try {
      await invoke('delete_ignored_secret', { id });
      setSecrets(prev => prev.filter(s => s.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleCopy = async (id: string, text: string) => {
      await writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
  };

  const formatDate = (ts: number) => new Date(ts).toLocaleDateString();

  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-200">

      <div className="mb-4 flex items-center justify-between shrink-0">
         <div>
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                <ShieldCheck size={16} className="text-green-600"/>
                {t('settings.securityTitle')}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
                {t('settings.securityDesc')}
            </p>
         </div>
         <button
           onClick={fetchSecrets}
           disabled={loading}
           className="p-2 hover:bg-secondary rounded-full transition-colors"
           title={t('library.refresh')}
         >
            <RefreshCw size={16} className={cn(loading && "animate-spin")} />
         </button>
      </div>

      <div className="flex-1 bg-secondary/5 border border-border rounded-lg overflow-hidden flex flex-col min-h-0">
          <div className="grid grid-cols-12 gap-4 px-4 py-2 bg-secondary/20 border-b border-border text-xs font-bold text-muted-foreground uppercase tracking-wider shrink-0">
             {/* 调整列宽：内容占9列，时间占3列 */}
             <div className="col-span-9">{t('settings.value')}</div>
             <div className="col-span-3 text-right">{t('settings.addedAt')}</div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
             {!loading && secrets.length === 0 && (
                 <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50 gap-2">
                     <ShieldCheck size={32} />
                     <span className="text-xs">{t('settings.noIgnored')}</span>
                 </div>
             )}

             {secrets.map(item => (
                <div key={item.id} className="grid grid-cols-12 gap-4 px-3 py-2.5 items-start hover:bg-secondary/40 rounded-md transition-colors text-xs group border-b border-border/30 last:border-0">

                    {/* 值显示区域：占9列 */}
                    <div className="col-span-9 flex gap-2 min-w-0">
                        <div className="font-mono text-foreground break-all select-text leading-relaxed">
                            {item.value}
                        </div>
                        {/* 复制按钮 */}
                        <button
                            onClick={() => handleCopy(item.id, item.value)}
                            className={cn(
                                "h-5 w-5 flex items-center justify-center rounded transition-all shrink-0 mt-0.5",
                                copiedId === item.id ? "text-green-500 bg-green-500/10" : "text-muted-foreground hover:text-foreground hover:bg-secondary opacity-0 group-hover:opacity-100"
                            )}
                            title={t('actions.copy')}
                        >
                            {copiedId === item.id ? <Check size={12} /> : <Copy size={12} />}
                        </button>
                    </div>

                    {/* 时间与操作：占3列 */}
                    <div className="col-span-3 flex items-center justify-end gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground/60">{formatDate(item.created_at)}</span>
                        <button
                            onClick={() => handleDelete(item.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/10 rounded"
                            title={t('actions.delete')}
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
             ))}
          </div>
      </div>

      <div className="mt-4 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg flex gap-2 items-start text-xs text-yellow-600/80 shrink-0">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <p>{t('common.whitelistNote')}</p>
      </div>
    </div>
  );
}
