import { memo } from 'react';
import {
  FileText, Image as ImageIcon, Pin,
  PenTool, Edit3
} from 'lucide-react';
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

  // 智能标题逻辑：有标题显示标题，没标题显示预览，都没显示占位符
  const hasTitle = !!item.title;
  const displayTitle = item.title || item.preview || (language === 'zh' ? '无标题' : 'Untitled');

  // 副标题/摘要逻辑
  const displaySubtitle = hasTitle ? (item.preview || '') : '';

  return (
    <div style={style} className="px-2 py-1">
      <div
        onClick={() => onClick(item.id)}
        className={cn(
          "h-full rounded-lg border flex flex-col justify-center px-3 gap-1 cursor-pointer transition-all duration-200 group relative select-none",
          isActive
            ? "bg-primary/10 border-primary/30 shadow-sm"
            : "bg-card border-border/40 hover:bg-secondary/50 hover:border-border"
        )}
      >
        {/* Row 1: Header (Icon + Source + Time) */}
        <div className="flex items-center justify-between gap-2 opacity-70">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* 类型图标 */}
            <div className={cn(
              "w-4 h-4 rounded flex items-center justify-center shrink-0",
              item.kind === 'image' ? "text-purple-500" : "text-blue-500"
            )}>
              {item.kind === 'image' ? <ImageIcon size={10} /> : <FileText size={10} />}
            </div>

            {/* 来源应用 Badge */}
            <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
               {item.sourceApp || 'Unknown'}
            </span>
          </div>

          {/* 右侧状态图标区 */}
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
             {/* 状态标记：人工创建 或 已编辑 */}
             {(item.isManual || item.isEdited) && (
                <span title="Edited/Manual" className="flex items-center text-orange-500/80">
                    {item.isManual ? <PenTool size={9} /> : <Edit3 size={9} />}
                </span>
             )}

             <span className="tabular-nums">
                {formatTimeAgo(item.updatedAt, language)}
             </span>

             {item.isPinned && <Pin size={10} className="fill-orange-500 text-orange-500" />}
          </div>
        </div>

        {/* Row 2: Title (Main Content) */}
        <div className={cn(
            "font-medium truncate text-sm text-foreground/90 pr-6",
            !hasTitle && "font-mono text-xs opacity-80" // 无标题时使用等宽字体显示代码片段感
        )}>
            {displayTitle}
        </div>

        {/* Row 3: Subtitle / Metadata */}
        <div className="flex items-center justify-between mt-0.5 h-4">
            <div className="text-[10px] text-muted-foreground/50 truncate max-w-[180px] font-mono">
               {displaySubtitle ? displaySubtitle : item.sizeInfo}
            </div>

            {/* Hover Action: Pin */}
            <button
              onClick={(e) => onTogglePin(item.id, e)}
              className={cn(
                "p-1 rounded-md transition-all opacity-0 group-hover:opacity-100 hover:bg-background shadow-sm border border-transparent hover:border-border/50 absolute right-2 bottom-2",
                item.isPinned && "opacity-100 text-orange-500"
              )}
            >
              <Pin size={12} className={cn(item.isPinned && "fill-current")} />
            </button>
        </div>
      </div>
    </div>
  );
});
