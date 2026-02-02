import { useRefineryStore } from '@/store/useRefineryStore';
import { formatTimeAgo } from '@/lib/refinery_utils';
import { useAppStore } from '@/store/useAppStore';
import { MoreHorizontal, Pin, Image as ImageIcon, FileText, Loader2, Filter, Search, X, PenTool, Edit3, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useImageLoader } from '@/hooks/useImageLoader';
import { getText } from '@/lib/i18n';
import type { LangKey } from '@/lib/i18n';
import { GroupedVirtuoso } from 'react-virtuoso';
import { useMemo, useCallback, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { motion } from 'framer-motion';

export function RefineryFeed() {
  const {
    items, setActiveId, activeId, togglePin, isLoading, hasMore,
    searchQuery, dateRange, kindFilter, pinnedOnly, manualOnly,
    setSearchQuery, resetDateFilter, setKindFilter, togglePinnedOnly, toggleManualOnly,
    loadHistory
  } = useRefineryStore();
  const { language } = useAppStore();

  // 判断是否有活跃的筛选
  const hasActiveFilter = searchQuery.trim() !== '' || dateRange.start !== null || dateRange.end !== null || kindFilter !== 'all' || pinnedOnly || manualOnly;

  // 清除所有筛选
  const clearAllFilters = () => {
    setSearchQuery('');
    resetDateFilter();
    setKindFilter('all');
    if (pinnedOnly) {
      togglePinnedOnly();
    }
    if (manualOnly) {
      toggleManualOnly();
    }
  };

  // 将 items 按日期分组，使用 useMemo 优化性能
  const { groups, flatItems, groupCounts } = useMemo(() => {
    const groupMap = new Map<string, any[]>();

    // 按日期分组
    items.forEach(item => {
      const dateKey = getDateKey(item.updatedAt, language);
      if (!groupMap.has(dateKey)) {
        groupMap.set(dateKey, []);
      }
      groupMap.get(dateKey)!.push(item);
    });

    // 转换为数组并按日期降序排序
    const sortedGroups = Array.from(groupMap.entries())
      .map(([dateKey, items]) => ({ dateKey, items }))
      .sort((a, b) => {
        // 按时间戳降序排序
        const aTime = a.items[0]?.updatedAt || 0;
        const bTime = b.items[0]?.updatedAt || 0;
        return bTime - aTime;
      });

    // 扁平化 items 和计算 groupCounts
    const flat: any[] = [];
    const counts: number[] = [];

    sortedGroups.forEach(group => {
      flat.push(...group.items);
      counts.push(group.items.length);
    });

    return {
      groups: sortedGroups,
      flatItems: flat,
      groupCounts: counts
    };
  }, [items, language]);

  // 无限滚动加载更多
  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      loadHistory(false);
    }
  }, [isLoading, hasMore, loadHistory]);

  // 获取分组索引
  const getGroupIndex = useCallback((itemIndex: number) => {
    let count = 0;
    for (let i = 0; i < groupCounts.length; i++) {
      count += groupCounts[i];
      if (itemIndex < count) {
        return i;
      }
    }
    return groupCounts.length - 1;
  }, [groupCounts]);

  return (
    <div className="flex-1 h-full bg-background">
      <div className="max-w-3xl mx-auto py-8 px-6 h-full flex flex-col">
        {/* Filter indicator bar */}
        {hasActiveFilter && (
          <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border border-primary/20 rounded-lg mb-4 shrink-0">
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

        {/* Virtual list */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/30 gap-6">
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
          <div className="flex-1 min-h-0">
            <GroupedVirtuoso
              style={{ height: '100%' }}
              groupCounts={groupCounts}
              groupContent={index => {
                const group = groups[index];
                if (!group) return null;
                return (
                  <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2 border-b border-border/30">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                      {group.dateKey}
                    </span>
                  </div>
                );
              }}
              itemContent={index => {
                const item = flatItems[index];
                const groupIndex = getGroupIndex(index);
                const isFirstInGroup = index === groupCounts.slice(0, groupIndex).reduce((a, b) => a + b, 0);

                return (
                  <div className={cn(isFirstInGroup ? 'mt-4' : '')}>
                    <FeedCard
                      item={item}
                      isActive={activeId === item.id}
                      onClick={() => setActiveId(item.id)}
                      onTogglePin={(e) => {
                        e.stopPropagation();
                        togglePin(item.id);
                      }}
                    />
                  </div>
                );
              }}
              endReached={loadMore}
              components={{
                Footer: () => {
                  if (!isLoading || items.length === 0) return null;
                  return (
                    <div className="py-8 flex justify-center">
                      <Loader2 size={24} className="animate-spin text-primary/50" />
                    </div>
                  );
                }
              }}
            />
          </div>
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
  const { loadItemDetail } = useRefineryStore();
  const { imageUrl, isLoading, error } = useImageLoader(item.kind === 'image' ? item.content : null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  // 复制完整内容
  const handleQuickCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsCopying(true);
    try {
      if (item.kind === 'text') {
        // 如果 content 为空，先加载完整内容
        let contentToCopy = item.content;
        if (!contentToCopy) {
          await loadItemDetail(item.id);
          // 重新获取 store 中的最新 item
          const { items } = useRefineryStore.getState();
          const updatedItem = items.find(i => i.id === item.id);
          contentToCopy = updatedItem?.content;
        }
        if (!contentToCopy) {
          console.warn('Content not loaded, cannot copy');
          return;
        }
        await invoke('copy_refinery_text', { text: contentToCopy });
      } else if (item.kind === 'image') {
        await invoke('copy_refinery_image', { imagePath: item.content });
      }
      setCopySuccess(true);
    } catch (err) {
      console.error('Failed to copy:', err);
    } finally {
      setIsCopying(false);
    }
  };

  // 复制成功反馈 2 秒后重置
  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative bg-card border rounded-xl p-4 cursor-pointer transition-all hover:border-primary/40 hover:shadow-md mb-4',
        isActive ? 'border-primary/60 ring-1 ring-primary/20 shadow-md' : 'border-border/60',
        // 手动笔记使用不同的背景色
        item.isManual && 'bg-gradient-to-br from-primary/5 to-transparent'
      )}
    >
      {/* Manual Note indicator */}
      {item.isManual && (
        <div className="absolute -top-1 left-4 px-1.5 py-0.5 bg-blue-500 rounded-b-sm flex items-center gap-0.5 shadow-sm z-10">
          <PenTool size={8} className="text-white" />
        </div>
      )}

      {/* Time & Source Row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground/70 font-medium">
            {formatTimeAgo(item.updatedAt, language)}
          </span>
          {/* 来源/类型标识 */}
          <div className="flex items-center gap-1">
            {item.isManual ? (
              <span className="text-[10px] bg-blue-500/10 text-blue-600 px-1.5 py-0.5 rounded border border-blue-500/20 flex items-center gap-1">
                <PenTool size={8} />
                {language === 'zh' ? '笔记' : 'Note'}
              </span>
            ) : item.sourceApp ? (
              <span className="text-[10px] bg-secondary px-1.5 py-0.5 rounded text-muted-foreground/80 border border-border/30">
                {item.sourceApp}
              </span>
            ) : null}
            {item.isEdited && !item.isManual && (
              <span className="text-[10px] bg-orange-500/10 text-orange-600 px-1.5 py-0.5 rounded border border-orange-500/20 flex items-center gap-1">
                <Edit3 size={8} />
              </span>
            )}
          </div>
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
          <button
            onClick={handleQuickCopy}
            disabled={isCopying}
            className={cn(
              'p-1.5 rounded-md transition-all hover:bg-secondary relative overflow-hidden',
              'opacity-0 group-hover:opacity-100',
              copySuccess ? 'text-green-500' : 'text-muted-foreground',
              isCopying && 'opacity-100 cursor-wait'
            )}
            title={language === 'zh' ? '复制' : 'Copy'}
          >
            <div className="relative w-[14px] h-[14px] flex items-center justify-center">
              {isCopying ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <motion.div
                  key={copySuccess ? 'check' : 'copy'}
                  initial={{ scale: 0, rotate: -90, opacity: 0 }}
                  animate={{ scale: 1, rotate: 0, opacity: 1 }}
                  exit={{ scale: 0, rotate: 90, opacity: 0 }}
                  transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  {copySuccess ? <Check size={14} /> : <Copy size={14} />}
                </motion.div>
              )}
            </div>
          </button>
          <button className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-secondary transition-colors text-muted-foreground">
            <MoreHorizontal size={14} />
          </button>
        </div>
      </div>

      {/* Content Preview */}
      <div className="text-sm text-foreground/90 leading-relaxed font-sans break-words">
        {item.kind === 'image' ? (
          <div className="rounded-lg overflow-hidden border border-border/30 bg-secondary/20">
            <div className="w-64 aspect-[4/3] relative">
              {isLoading ? (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
                  <Loader2 size={24} className="animate-spin" />
                </div>
              ) : error ? (
                <div className="absolute inset-0 flex items-center justify-center text-destructive/60 text-xs px-4 text-center">
                  {getText('refinery', 'failedToLoadImage', language)}
                </div>
              ) : imageUrl ? (
                <img
                  src={imageUrl}
                  className="absolute inset-0 w-full h-full object-cover"
                  alt="Preview"
                  loading="lazy"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
                  <ImageIcon size={32} />
                </div>
              )}
            </div>
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
function getDateKey(timestamp: number, lang: LangKey): string {
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
