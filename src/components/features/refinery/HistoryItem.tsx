import { memo } from 'react';
import { FileText, Image as ImageIcon, Pin, Database } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RefineryItemUI } from '@/types/refinery';
import { formatTimeAgo } from '@/lib/refinery_utils';
import { useAppStore } from '@/store/useAppStore';

interface HistoryItemProps {
  item: RefineryItemUI;
  isActive: boolean;
  style: React.CSSProperties;
  onClick: (id: string) => void;
  onTogglePin: (id: string, e: React.MouseEvent) => void;
}

export const HistoryItem = memo(({ item, isActive, style, onClick, onTogglePin }: HistoryItemProps) => {
  const { language } = useAppStore();

  return (
    <div style={style} className="px-2 py-1">
      <div
        onClick={() => onClick(item.id)}
        className={cn(
          "h-full rounded-lg border flex flex-col justify-center px-3 gap-1.5 cursor-pointer transition-all duration-200 group relative",
          isActive
            ? "bg-primary/10 border-primary/30 shadow-sm"
            : "bg-card border-border/40 hover:bg-secondary/50 hover:border-border"
        )}
      >
        {/* Header Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn(
              "w-5 h-5 rounded flex items-center justify-center shrink-0",
              item.kind === 'image' ? "bg-purple-500/10 text-purple-500" : "bg-blue-500/10 text-blue-500"
            )}>
              {item.kind === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}
            </div>

            {/* Source App Badge (Optional) */}
            {item.sourceApp && (
               <span className="text-[10px] font-medium text-muted-foreground/80 truncate max-w-[80px] bg-secondary px-1 rounded">
                 {item.sourceApp}
               </span>
            )}
          </div>

          <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums flex items-center gap-1">
             {item.isPinned && <Pin size={10} className="fill-orange-500 text-orange-500 mr-1" />}
             {formatTimeAgo(item.updatedAt, language)}
          </span>
        </div>

        {/* Preview Content */}
        <div className="text-xs text-foreground/80 line-clamp-2 break-all font-mono leading-relaxed opacity-90 h-9">
          {item.kind === 'image' ? (
             <span className="flex items-center gap-1 text-muted-foreground italic">
                [Image] {item.metaParsed.width}x{item.metaParsed.height} • {item.metaParsed.format}
             </span>
          ) : (
             item.preview || <span className="opacity-30 italic">Empty content</span>
          )}
        </div>

        {/* Footer Metadata */}
        <div className="flex items-center justify-between mt-0.5">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50">
               <span className="flex items-center gap-1"><Database size={10} /> {item.sizeInfo}</span>
            </div>

            {/* Hover Actions */}
            <button
              onClick={(e) => onTogglePin(item.id, e)}
              className={cn(
                "p-1 rounded-md transition-all opacity-0 group-hover:opacity-100 hover:bg-background shadow-sm border border-transparent hover:border-border/50",
                item.isPinned && "opacity-100 text-orange-500"
              )}
              title="Pin to top"
            >
              <Pin size={12} className={cn(item.isPinned && "fill-current")} />
            </button>
        </div>

        {/* Active Indicator Bar */}
        {isActive && (
            <div className="absolute left-0 top-3 bottom-3 w-1 bg-primary rounded-r-full" />
        )}
      </div>
    </div>
  );
});
