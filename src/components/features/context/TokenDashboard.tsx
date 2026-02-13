import { useMemo, useState, useEffect, cloneElement } from 'react';
import { invoke } from '@tauri-apps/api/core';

const CONTEXT_PLUGIN_PREFIX = 'plugin:ctxrun-plugin-context|';
import {
  CheckCircle2, AlertCircle, FileText, Database, Cpu, Save,
  DollarSign, PieChart, TrendingUp, AlertTriangle, Eraser, X, ShieldCheck, Loader2
} from 'lucide-react';
import { ContextStats, getSelectedPaths } from '@/lib/context_assembler';
import { analyzeContext } from '@/lib/context_analytics';
import { FileNode } from '@/types/context';
import { AIModelConfig } from '@/types/model';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { useContextStore } from '@/store/useContextStore';
import { getText } from '@/lib/i18n';
import { NumberTicker } from '@/components/ui/NumberTicker';

interface TokenDashboardProps {
  stats?: any;
  fileTree: FileNode[];
  models: AIModelConfig[];
  onCopy: () => void;
  onSave: () => void;
  isGenerating: boolean;
}

export function TokenDashboard({
  fileTree,
  models,
  onCopy,
  onSave,
  isGenerating
}: TokenDashboardProps) {
  const { language } = useAppStore();
  const { removeComments, setRemoveComments, toggleSelect, detectSecrets, setDetectSecrets } = useContextStore();

  const [stats, setStats] = useState<ContextStats>({ file_count: 0, total_size: 0, total_tokens: 0 });
  const [isCalculating, setIsCalculating] = useState(false);

  // 乐观更新：文件数量不需要问 Rust，前端直接算，实现 0 延迟响应
  const instantFileCount = useMemo(() => {
    let count = 0;
    const traverse = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (node.kind === 'file' && node.isSelected) count++;
        if (node.children) traverse(node.children);
      }
    };
    traverse(fileTree);
    return count;
  }, [fileTree]);

  useEffect(() => {
    let isMounted = true;

    const fetchStats = async () => {
      const paths = getSelectedPaths(fileTree);

      // 如果没有文件，直接归零
      if (paths.length === 0) {
        if (isMounted) setStats({ file_count: 0, total_size: 0, total_tokens: 0 });
        return;
      }

      // 不要在这里清空 stats！保留旧数据展示
      setIsCalculating(true);

      try {
        const res = await invoke<ContextStats>(`${CONTEXT_PLUGIN_PREFIX}calculate_context_stats`, {
          paths: paths,
          removeComments: removeComments
        });

        if (isMounted) setStats(res);
      } catch (err) {
        console.error("Stats calculation failed:", err);
      } finally {
        if (isMounted) setIsCalculating(false);
      }
    };

    const timer = setTimeout(fetchStats, 200);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [fileTree, removeComments]);

  const analytics = useMemo(() => {
    return analyzeContext(fileTree, stats.total_tokens, models);
  }, [fileTree, stats.total_tokens, models]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatCost = (val: number) => {
    if (val < 0.0001 && val > 0) return '< $0.0001';
    return `$${val.toFixed(4)}`;
  };

  return (
    <div className="flex flex-col min-h-full max-w-6xl w-full mx-auto p-4 md:p-6 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* 1. 核心统计 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 文件数：直接使用 instantFileCount，永远不会 loading */}
        <StatCard
            icon={<FileText className="text-blue-500" />}
            label={getText('context', 'statSelected', language)}
            value={instantFileCount}
            rawValue={instantFileCount}
            loading={false}
        />
        {/* 大小和 Token：传入 isCalculating */}
        <StatCard
            icon={<Database className="text-purple-500" />}
            label={getText('context', 'statSize', language)}
            value={formatSize(stats.total_size)}
            loading={isCalculating}
        />
        <StatCard
            icon={<Cpu className="text-orange-500" />}
            label={getText('context', 'statTokens', language)}
            value={stats.total_tokens.toLocaleString()}
            rawValue={stats.total_tokens}
            highlight
            loading={isCalculating}
        />
      </div>

      {/* 功能开关区 */}
      <div className="flex items-center justify-end px-2 gap-3">
         {/* 安全检测开关 */}
         <button
           onClick={() => setDetectSecrets(!detectSecrets)}
           className={cn(
             "flex items-center gap-3 px-4 py-2 rounded-lg border transition-all duration-200 shadow-sm",
             detectSecrets
               ? "bg-orange-500/10 border-orange-500/30 text-orange-600"
               : "bg-card border-border text-muted-foreground hover:bg-secondary/50"
           )}
           title={getText('context', 'securityFilterTooltip', language)}
         >
            <div className={cn(
                "w-8 h-4 rounded-full relative transition-colors duration-300",
                detectSecrets ? "bg-orange-500" : "bg-slate-300 dark:bg-slate-600"
            )}>
                <div className={cn(
                    "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-300 shadow-sm",
                    detectSecrets ? "left-4.5 translate-x-0" : "left-0.5"
                )} style={{ left: detectSecrets ? '18px' : '2px' }} />
            </div>
            <div className="flex items-center gap-2">
                <ShieldCheck size={16} />
                <span className="text-sm font-medium">{getText('context', 'securityFilter', language)}</span>
            </div>
         </button>

         {/* 移除注释开关 */}
         <button
           onClick={() => setRemoveComments(!removeComments)}
           className={cn(
             "flex items-center gap-3 px-4 py-2 rounded-lg border transition-all duration-200 shadow-sm",
             removeComments
               ? "bg-primary/10 border-primary/30 text-primary"
               : "bg-card border-border text-muted-foreground hover:bg-secondary/50"
           )}
         >
            <div className={cn(
                "w-8 h-4 rounded-full relative transition-colors duration-300",
                removeComments ? "bg-primary" : "bg-slate-300 dark:bg-slate-600"
            )}>
                <div className={cn(
                    "absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform duration-300 shadow-sm",
                    removeComments ? "left-4.5 translate-x-0" : "left-0.5"
                )} style={{ left: removeComments ? '18px' : '2px' }} />
            </div>
            <div className="flex items-center gap-2">
                <Eraser size={16} />
                <span className="text-sm font-medium">{getText('context', 'removeComments', language)}</span>
            </div>
         </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 2. 左栏：语言 & 成本 */}
        <div className="space-y-6">
           {/* 语言分布 */}
           <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                 <h3 className="text-sm font-semibold flex items-center gap-2"><PieChart size={16} /> {getText('context', 'langBreakdown', language)}</h3>
                 <span className="text-xs text-muted-foreground">{getText('context', 'bySize', language)}</span>
              </div>
              <div className="h-3 w-full flex rounded-full overflow-hidden bg-secondary">
                 {analytics.languages.map((lang) => (
                    <div key={lang.name} className={cn("h-full", lang.color)} style={{ width: `${lang.percentage}%` }} title={`${lang.name}: ${lang.percentage.toFixed(1)}%`} />
                 ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                 {analytics.languages.map(lang => (
                   <div key={lang.name} className="flex items-center gap-1.5 text-xs">
                      <div className={cn("w-2 h-2 rounded-full", lang.color)} />
                      <span className="text-muted-foreground">{lang.name}</span>
                      <span className="font-mono opacity-50">{lang.percentage.toFixed(1)}%</span>
                   </div>
                 ))}
              </div>
           </div>

           {/* 动态成本估算 */}
           <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                 <h3 className="text-sm font-semibold flex items-center gap-2"><DollarSign size={16} /> {getText('context', 'estCost', language)}</h3>
              </div>
              <div className="grid grid-cols-2 gap-3">
                 {analytics.modelCosts.map(model => (
                    <div key={model.modelId} className="p-3 bg-secondary/30 rounded-lg flex flex-col gap-1 overflow-hidden">
                        <span className="text-xs text-muted-foreground truncate" title={model.modelName}>{model.modelName}</span>
                        <span className="text-lg font-bold text-foreground">{formatCost(model.cost)}</span>
                    </div>
                 ))}
              </div>
              <p className="text-[10px] text-muted-foreground opacity-60">{getText('context', 'costNote', language)}</p>
           </div>
        </div>

        {/* 3. 右栏：进度条 & Top Files */}
        <div className="space-y-6">
           {/* 动态上下文窗口 */}
           <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-4">
               <h3 className="text-sm font-semibold flex items-center gap-2"><TrendingUp size={16} /> {getText('context', 'contextUsage', language)}</h3>
               <div className="space-y-3">
                {analytics.modelCosts.map(model => {
                    const percent = Math.min(100, (stats.total_tokens / model.limit) * 100);
                    const isOver = stats.total_tokens > model.limit;
                    return (
                        <div key={model.modelId} className="space-y-1.5">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{model.modelName}</span>
                                <span className={cn(isOver ? "text-destructive font-bold" : "")}>
                                    {percent.toFixed(1)}% <span className="opacity-50 text-[10px] ml-1">({(model.limit/1000).toFixed(0)}k)</span>
                                </span>
                            </div>
                            <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                                <div className={cn("h-full rounded-full transition-all duration-500", isOver ? "bg-destructive" : "bg-primary")} style={{ width: `${percent}%` }} />
                            </div>
                        </div>
                    )
                })}
               </div>
           </div>

           {/* Largest Files (Interactive) */}
           <div className="bg-card border border-border rounded-xl p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between mb-2">
                 <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle size={16} /> {getText('context', 'topFiles', language)}</h3>
                 <span className="text-xs text-muted-foreground">{getText('context', 'largestFiles', language)}</span>
              </div>
              <div className="space-y-1">
                 {analytics.topFiles.length === 0 && <span className="text-xs text-muted-foreground px-1">{getText('common', 'noFilesSelected', language)}</span>}
                 {analytics.topFiles.map((f, i) => (
                   <div
                     key={f.id}
                     className="group/item relative flex items-center justify-between text-xs p-1.5 -mx-1.5 rounded-md hover:bg-secondary/50 transition-colors cursor-default"
                   >
                      <div className="flex items-center gap-2 truncate max-w-[70%]">
                         <span className="font-mono text-muted-foreground w-4 opacity-70">{i+1}.</span>
                         <span className="truncate text-foreground font-medium" title={f.path}>{f.name}</span>
                      </div>

                      <span className="font-mono text-muted-foreground transition-opacity duration-200 group-hover/item:opacity-0">
                          {formatSize(f.size || 0)}
                      </span>

                      {/* Hover State: Show Remove Button */}
                      <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(f.id, false);
                        }}
                        className="absolute right-1.5 opacity-0 group-hover/item:opacity-100 transition-all duration-200 p-1 hover:bg-destructive/10 hover:text-destructive text-muted-foreground rounded-sm scale-90 group-hover/item:scale-100"
                        title={getText('common', 'removeFromContext', language)}
                      >
                        <X size={14} />
                      </button>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="flex flex-col items-center gap-4 mt-auto">
         {instantFileCount === 0 ? (
           <div className="text-muted-foreground flex items-center gap-2 bg-secondary/50 px-4 py-2 rounded-full text-sm">
             <AlertCircle size={16} /> {getText('context', 'tipSelect', language)}
           </div>
         ) : (
           <div className="flex flex-wrap items-center gap-3 w-full justify-center">
             <button onClick={onCopy} disabled={isGenerating} className={cn("group relative inline-flex items-center justify-center gap-2 px-8 py-3 text-base font-semibold text-primary-foreground transition-all duration-200 bg-primary rounded-full shadow-lg shadow-primary/25 hover:bg-primary/90 hover:scale-105 active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed disabled:scale-100 min-w-[200px] whitespace-nowrap", isGenerating && "cursor-wait")}>
               {isGenerating ? (<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /><span>{getText('context', 'processing', language)}</span></>) : (<><CheckCircle2 size={20} /><span>{getText('context', 'btnCopy', language)}</span></>)}
             </button>
             <button onClick={onSave} disabled={isGenerating} className="inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-medium text-foreground bg-secondary/80 border border-border rounded-full hover:bg-secondary hover:border-primary/30 transition-all active:scale-95 disabled:opacity-50 whitespace-nowrap">
               <Save size={20} /><span>{getText('context', 'btnSave', language)}</span>
             </button>
           </div>
         )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, rawValue, highlight, className, loading }: any) {
    return (
      <div className={cn(
        "relative overflow-hidden bg-card border border-border/40 rounded-2xl p-5",
        "transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-0.5",
        highlight && "bg-gradient-to-br from-primary/5 to-transparent border-primary/20",
        className
      )}>
        {/* 增加一个极其淡的背景图标装饰 */}
        <div className="absolute -right-4 -bottom-4 opacity-[0.03] rotate-12 pointer-events-none">
            {cloneElement(icon, { size: 100, className: icon.props.className })}
        </div>

        <div className="flex items-center gap-3 mb-4">
            <div className="p-2.5 bg-secondary/50 rounded-xl border border-border/50 shadow-inner">
                {cloneElement(icon, { size: 18, className: icon.props.className })}
            </div>
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{label}</div>
        </div>

        <div className="flex items-baseline gap-2">
            <div className={cn(
                "text-3xl font-light tracking-tight text-foreground",
                loading && "opacity-50"
            )}>
                {typeof rawValue === 'number' ? <NumberTicker value={rawValue} /> : (value || "0")}
            </div>
            {loading && <Loader2 size={16} className="animate-spin text-muted-foreground" />}
        </div>
      </div>
    );
}
