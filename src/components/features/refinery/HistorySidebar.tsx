import { useState, useEffect } from 'react';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';
import { Search, Filter, Layers, Image as ImageIcon, Type, X } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { useRefineryStore } from '@/store/useRefineryStore';
import { HistoryItem } from './HistoryItem';
import { cn } from '@/lib/utils';
import { getText } from '@/lib/i18n';

export function HistorySidebar() {
  const { language } = useAppStore();
  const {
    items, activeId, isLoading,
    searchQuery, setSearchQuery,
    kindFilter, setKindFilter,
    togglePin, setActiveId,
    hasMore
  } = useRefineryStore();

  const [localSearch, setLocalSearch] = useState(searchQuery);

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
        if (localSearch !== searchQuery) {
            setSearchQuery(localSearch);
        }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, setSearchQuery, searchQuery]);

  // 无限滚动检测
  const handleScroll = ({ scrollDirection }: any) => {
    if (scrollDirection === 'forward' && hasMore && !isLoading) {
       // 简单判断：如果滚到底部附近，加载更多 (实际可用更精细的计算)
       // 这里暂时略过，依赖用户手动刷新或后续优化
    }
  };

  const Row = ({ index, style }: any) => {
    const item = items[index];
    if (!item) return null; // Safety check

    return (
      <HistoryItem
        item={item}
        isActive={activeId === item.id}
        style={style}
        onClick={setActiveId}
        onTogglePin={(id, e) => {
            e.stopPropagation();
            togglePin(id);
        }}
      />
    );
  };

  return (
    <div className="h-full flex flex-col bg-secondary/5 border-r border-border w-80 shrink-0">

      {/* 1. Header & Search */}
      <div className="p-3 border-b border-border/50 space-y-3">
         <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
            <input
               className="w-full bg-secondary/50 border border-border/50 rounded-lg pl-8 pr-8 py-1.5 text-xs focus:ring-1 focus:ring-primary/30 focus:bg-background transition-all outline-none"
               placeholder={getText('common', 'search', language)}
               value={localSearch}
               onChange={(e) => setLocalSearch(e.target.value)}
            />
            {localSearch && (
                <button
                    onClick={() => setLocalSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
                >
                    <X size={12} />
                </button>
            )}
         </div>

         {/* Filter Tabs */}
         <div className="flex bg-secondary/30 p-0.5 rounded-lg border border-border/30">
            <FilterTab
                active={kindFilter === 'all'}
                onClick={() => setKindFilter('all')}
                icon={<Layers size={12} />}
                label="All"
            />
            <FilterTab
                active={kindFilter === 'text'}
                onClick={() => setKindFilter('text')}
                icon={<Type size={12} />}
                label="Text"
            />
            <FilterTab
                active={kindFilter === 'image'}
                onClick={() => setKindFilter('image')}
                icon={<ImageIcon size={12} />}
                label="Img"
            />
         </div>
      </div>

      {/* 2. List Area */}
      <div className="flex-1 min-h-0">
         {items.length === 0 ? (
             <div className="h-full flex flex-col items-center justify-center text-muted-foreground/40 gap-2">
                 <div className="p-3 bg-secondary/20 rounded-full"><Filter size={20} /></div>
                 <span className="text-xs">No records found</span>
             </div>
         ) : (
             <AutoSizer>
                {({ height, width }) => (
                    <List
                        height={height}
                        width={width}
                        itemCount={items.length}
                        itemSize={88} // Card height + padding
                        className="custom-scrollbar"
                        onScroll={handleScroll}
                    >
                        {Row}
                    </List>
                )}
             </AutoSizer>
         )}
      </div>

      {/* 3. Footer Stats */}
      <div className="h-8 border-t border-border/50 bg-background flex items-center justify-between px-3 text-[10px] text-muted-foreground">
          <span>{items.length} items</span>
          {/* 这里可以放清空按钮 */}
      </div>
    </div>
  );
}

function FilterTab({ active, onClick, icon, label }: any) {
    return (
        <button
            onClick={onClick}
            className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1 text-[10px] font-medium rounded-[4px] transition-all",
                active
                    ? "bg-background text-foreground shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
            )}
        >
            {icon}
            <span>{label}</span>
        </button>
    )
}
