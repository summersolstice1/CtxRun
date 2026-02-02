import { useRefineryStore } from '@/store/useRefineryStore';
import { formatTimeAgo } from '@/lib/refinery_utils';
import { useAppStore } from '@/store/useAppStore';
import { MoreHorizontal, Pin, Image as ImageIcon, FileText, Loader2, Filter, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useImageLoader } from '@/hooks/useImageLoader';
import { getText } from '@/lib/i18n';

export function RefineryFeed() {
  const {
    items, setActiveId, activeId, togglePin,
    searchQuery, dateRange, kindFilter, pinnedOnly,
    setSearchQuery, resetDateFilter, setKindFilter, togglePinnedOnly
  } = useRefineryStore();
  const { language } = useAppStore();

  // 判断是否有活跃的筛选
  const hasActiveFilter = searchQuery.trim() !== '' || dateRange.start !== null || dateRange.end !== null || kindFilter !== 'all' || pinnedOnly;

  // 清除所有筛选
  const clearAllFilters = () => {
    setSearchQuery('');
    resetDateFilter();
    setKindFilter('all');
    if (pinnedOnly) {
      togglePinnedOnly();
    }
  };

  // Group items by date for timeline effect
  const groupedItems = items.reduce<Record<string, typeof items>>((acc, item) => {
    const dateKey = getDateKey(item.updatedAt, language);
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(item);
    return acc;
  }, {});

  return (
    <div className="flex-1 h-full overflow-y-auto custom-scrollbar bg-background">
      <div className="max-w-3xl mx-auto py-8 px-6 space-y-6">
        {/* Filter indicator bar */}
        {hasActiveFilter && (
          <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-primary">
              <Filter size={12} />
              <span>{getText('refinery', 'filteredResults', language)}</span>
              <span className="text-muted-foreground">({items.length} {items.length === 1 ? 'item' : 'items'})</span>
            </div>
            <button
              onClick={clearAllFilters}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
            >
              <X size={12} />
              {language === 'zh' ? '清除全部' : 'Clear all'}
            </button>
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-muted-foreground/30 gap-6">
            <div className="w-20 h-20 rounded-2xl bg-secondary/20 flex items-center justify-center border border-dashed border-border">
              {hasActiveFilter ? <Search size={32} /> : <FileText size={32} />}
            </div>
            <p className="text-sm italic">
              {hasActiveFilter
                ? getText('refinery', 'noResults', language)
                : getText('refinery', 'waitingForFirstCopy', language)
              }
            </p>
          </div>
        ) : (
          Object.entries(groupedItems).map(([dateKey, dateItems]) => (
            <div key={dateKey} className="space-y-4">
              {/* Date Header */}
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2 -mx-6 px-6 border-b border-border/30">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                  {dateKey}
                </span>
              </div>

              {/* Cards for this date */}
              {dateItems.map((item) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  isActive={activeId === item.id}
                  onClick={() => setActiveId(item.id)}
                  onTogglePin={(e) => {
                    e.stopPropagation();
                    togglePin(item.id);
                  }}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function FeedCard({
  item,
  isActive,
  onClick,
  onTogglePin
}: {
  item: any;
  isActive: boolean;
  onClick: () => void;
  onTogglePin: (e: React.MouseEvent) => void;
}) {
  const { language } = useAppStore();
  const { imageUrl, isLoading, error } = useImageLoader(item.kind === 'image' ? item.content : null);

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative bg-card border rounded-xl p-4 cursor-pointer transition-all hover:border-primary/40 hover:shadow-md',
        isActive ? 'border-primary/60 ring-1 ring-primary/20 shadow-md' : 'border-border/60'
      )}
    >
      {/* Pin indicator */}
      {item.isPinned && (
        <div className="absolute -top-1 right-8 w-4 h-6 bg-orange-500 rounded-b-sm flex items-center justify-center shadow-sm z-10">
          <div className="w-1 h-1 bg-white rounded-full" />
        </div>
      )}

      {/* Time & Source Row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground/70 font-medium">
            {formatTimeAgo(item.updatedAt, language)}
          </span>
          {item.sourceApp && (
            <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground/80 border border-border/30">
              {item.sourceApp}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onTogglePin}
            className={cn(
              'p-1.5 rounded-md transition-all hover:bg-secondary',
              item.isPinned ? 'text-orange-500' : 'opacity-0 group-hover:opacity-100 text-muted-foreground'
            )}
            title={item.isPinned ? getText('refinery', 'unpin', language) : getText('refinery', 'pin', language)}
          >
            <Pin size={14} className={cn(item.isPinned && 'fill-current')} />
          </button>
          <button className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-secondary transition-colors text-muted-foreground">
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Content Preview */}
      <div className="text-sm text-foreground/90 leading-relaxed font-sans break-words">
        {item.kind === 'image' ? (
          <div className="rounded-lg overflow-hidden border border-border/30 bg-secondary/20 max-w-sm inline-block">
            {isLoading ? (
              <div className="w-64 h-48 flex items-center justify-center text-muted-foreground/40">
                <Loader2 size={24} className="animate-spin" />
              </div>
            ) : error ? (
              <div className="w-64 h-48 flex items-center justify-center text-destructive/60 text-xs px-4 text-center">
                {getText('refinery', 'failedToLoadImage', language)}
              </div>
            ) : imageUrl ? (
              <img
                src={imageUrl}
                className="w-full h-auto object-cover max-h-48"
                alt="Preview"
                loading="lazy"
              />
            ) : (
              <div className="w-64 h-48 flex items-center justify-center text-muted-foreground/40">
                <ImageIcon size={32} />
              </div>
            )}
          </div>
        ) : (
          <div className="line-clamp-[10] whitespace-pre-wrap">{item.preview || getText('refinery', 'emptyContent', language)}</div>
        )}
      </div>

      {/* Footer with size info */}
      <div className="mt-3 pt-2 border-t border-border/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-5 h-5 rounded flex items-center justify-center',
              item.kind === 'image' ? 'bg-purple-500/10 text-purple-500' : 'bg-blue-500/10 text-blue-500'
            )}
          >
            {item.kind === 'image' ? <ImageIcon size={12} /> : <FileText size={12} />}
          </div>
          <span className="text-[10px] text-muted-foreground/60 font-mono">{item.sizeInfo}</span>
        </div>
      </div>
    </div>
  );
}

// Helper function to get date key for grouping
function getDateKey(timestamp: number, lang: string): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return getText('refinery', 'today', lang);
  if (isYesterday) return getText('refinery', 'yesterday', lang);

  return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
