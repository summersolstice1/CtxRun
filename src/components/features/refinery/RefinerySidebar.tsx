import { useState, useEffect, useRef, useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Hash, Star, Type, Image as ImageIcon, Trash2, ChevronLeft, ChevronRight, Search, X, Loader2, Plus, PenTool } from 'lucide-react';
import { useRefineryStore } from '@/store/useRefineryStore';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';

export function RefinerySidebar() {
  const { t } = useTranslation();
  const {
    kindFilter, setKindFilter, pinnedOnly, togglePinnedOnly, manualOnly, toggleManualOnly, clearHistory,
    calendarMonth, calendarYear, dateRange,
    navigateMonth, setRangeStart, setRangeEnd, resetDateFilter,
    statistics, statisticsLoading,
    createNote,
    searchQuery,
    setSearchQuery,
  } = useRefineryStore(
    useShallow((state) => ({
      kindFilter: state.kindFilter,
      setKindFilter: state.setKindFilter,
      pinnedOnly: state.pinnedOnly,
      togglePinnedOnly: state.togglePinnedOnly,
      manualOnly: state.manualOnly,
      toggleManualOnly: state.toggleManualOnly,
      clearHistory: state.clearHistory,
      calendarMonth: state.calendarMonth,
      calendarYear: state.calendarYear,
      dateRange: state.dateRange,
      navigateMonth: state.navigateMonth,
      setRangeStart: state.setRangeStart,
      setRangeEnd: state.setRangeEnd,
      resetDateFilter: state.resetDateFilter,
      statistics: state.statistics,
      statisticsLoading: state.statisticsLoading,
      createNote: state.createNote,
      searchQuery: state.searchQuery,
      setSearchQuery: state.setSearchQuery,
    })),
  );
  const language = useAppStore((state) => state.language);

  const [localSearch, setLocalSearch] = useState('');

  // 拖动选择状态
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragCurrent, setDragCurrent] = useState<number | null>(null);

  // 日历切换动画状态
  const [isAnimating, setIsAnimating] = useState(false);
  const [animationDirection, setAnimationDirection] = useState<'up' | 'down' | null>(null);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 动画变体
  const calendarVariants = {
    enter: (direction: 'up' | 'down' | null) => ({
      opacity: 0,
      y: direction === 'up' ? -20 : 20,
      scale: 0.95,
    }),
    center: {
      opacity: 1,
      y: 0,
      scale: 1,
    },
    exit: (direction: 'up' | 'down' | null) => ({
      opacity: 0,
      y: direction === 'up' ? 20 : -20,
      scale: 0.95,
    }),
  };

  // 节流处理月份切换（防止快速切换）
  const navigateMonthWithAnimation = useCallback((delta: number) => {
    if (isAnimating) return; // 动画进行中，忽略切换请求

    setIsAnimating(true);
    setAnimationDirection(delta > 0 ? 'up' : 'down');

    // 延迟执行实际切换
    setTimeout(() => {
      navigateMonth(delta);
    }, 50);

    // 动画完成后重置状态
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }
    animationTimeoutRef.current = setTimeout(() => {
      setIsAnimating(false);
      setAnimationDirection(null);
    }, 250);
  }, [isAnimating, navigateMonth]);

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        setSearchQuery(localSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, setSearchQuery, searchQuery]);

  // 同步：当外部清除 searchQuery 时，也清除 localSearch
  useEffect(() => {
    if (searchQuery === '' && localSearch !== '') {
      setLocalSearch('');
    }
  }, [searchQuery]);

  // 获取当前月信息
  const now = new Date();
  const currentMonthName = new Date(calendarYear, calendarMonth).toLocaleDateString(
    language === 'zh' ? 'zh-CN' : 'en-US',
    { month: 'long', year: 'numeric' }
  );
  const currentDay = now.getDate();
  const currentMonthIndex = now.getMonth();
  const currentYearIndex = now.getFullYear();

  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(calendarYear, calendarMonth, 1).getDay();

  // 判断日期是否是今天
  const isToday = (day: number) => {
    return day === currentDay && calendarMonth === currentMonthIndex && calendarYear === currentYearIndex;
  };

  // 判断日期是否在范围内
  const isInRange = (day: number) => {
    if (isDragging && dragStart && dragCurrent) {
      // 拖动过程中的临时范围
      const start = Math.min(dragStart, dragCurrent);
      const end = Math.max(dragStart, dragCurrent);
      return day >= start && day <= end;
    }
    // 已选中的范围（基于时间戳）
    if (!dateRange.start) return false;
    const dayStart = new Date(calendarYear, calendarMonth, day, 0, 0, 0).getTime();
    const dayEnd = new Date(calendarYear, calendarMonth, day, 23, 59, 59, 999).getTime();
    const rangeStart = dateRange.start;
    const rangeEnd = dateRange.end || dateRange.start;
    // 检查这一天是否与选中范围有重叠
    return dayStart <= rangeEnd && dayEnd >= rangeStart;
  };

  // 判断日期是否是范围起点
  const isRangeStart = (day: number) => {
    if (isDragging && dragStart) {
      // 拖动时检查是否是起点
      return day === Math.min(dragStart, dragCurrent ?? dragStart);
    }
    if (!dateRange.start) return false;
    const dayStart = new Date(calendarYear, calendarMonth, day, 0, 0, 0).getTime();
    const rangeStart = new Date(Math.min(dateRange.start, dateRange.end || dateRange.start));
    return dayStart === rangeStart.getTime();
  };

  // 判断日期是否是范围终点
  const isRangeEnd = (day: number) => {
    if (isDragging && dragStart) {
      // 拖动时检查是否是终点
      return day === Math.max(dragStart, dragCurrent ?? dragStart);
    }
    if (!dateRange.end) return false;
    const dayEnd = new Date(calendarYear, calendarMonth, day, 23, 59, 59, 999).getTime();
    const rangeEnd = new Date(Math.max(dateRange.start!, dateRange.end));
    return dayEnd === rangeEnd.getTime();
  };

  // 鼠标按下开始拖动
  const handleMouseDown = (day: number) => {
    setIsDragging(true);
    setDragStart(day);
    setDragCurrent(day);
  };

  // 鼠标移动
  const handleMouseEnter = (day: number) => {
    if (isDragging) {
      setDragCurrent(day);
    }
  };

  // 鼠标释放完成选择
  const handleMouseUp = () => {
    if (isDragging && dragStart !== null && dragCurrent !== null) {
      const start = Math.min(dragStart, dragCurrent);
      const end = Math.max(dragStart, dragCurrent);
      setRangeStart(start);
      setRangeEnd(end);
    }
    setIsDragging(false);
    setDragStart(null);
    setDragCurrent(null);
  };

  // 处理日期点击（单击选中单日）
  const handleDayClick = (day: number) => {
    const dayTimestamp = new Date(calendarYear, calendarMonth, day).getTime();
    // 如果点击的是当前选中的单个日期，则清除筛选
    if (dateRange.start === dayTimestamp && !dateRange.end && !isDragging) {
      resetDateFilter();
    } else {
      // 否则设置新的筛选（如果正在拖动，不处理点击）
      if (!isDragging) {
        resetDateFilter(); // 先清除之前的筛选
        setTimeout(() => setRangeStart(day), 0); // 然后设置新的单日筛选
      }
    }
  };

  // 滚轮切换月份（带动画）
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY > 0) {
      navigateMonthWithAnimation(1); // 向下滚动，下个月
    } else {
      navigateMonthWithAnimation(-1); // 向上滚动，上个月
    }
  };

  // 全局鼠标释放（防止在日历外释放导致状态卡住）
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        handleMouseUp();
      }
    };
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging, dragStart, dragCurrent]);

  // 判断是否有日期筛选
  const hasDateFilter = dateRange.start !== null || dateRange.end !== null;

  // 格式化日期显示
  const formatDateDisplay = () => {
    if (!dateRange.start && !dateRange.end) return null;

    const start = new Date(dateRange.start || dateRange.end!);
    const end = dateRange.end ? new Date(dateRange.end) : start;

    const format = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;

    if (dateRange.start === dateRange.end || !dateRange.end) {
      return format(start);
    }

    // 跨月显示
    if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
      return `${start.getMonth() + 1}/${start.getDate()} - ${end.getDate()}`;
    }

    return `${format(start)} - ${format(end)}`;
  };

  return (
    <div className="w-64 h-full bg-background border-r border-border/50 flex flex-col select-none">
      {/* Search Bar */}
      <div className="p-3 border-b border-border/50 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <input
            className="w-full bg-secondary/50 border border-border/50 rounded-lg pl-8 pr-8 py-2 text-xs focus:ring-1 focus:ring-primary/30 focus:bg-background transition-all outline-none"
            placeholder={t('refinery.search')}
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

        {/* Action Bar: New Note */}
        <button
          onClick={createNote}
          className="w-full flex items-center justify-center gap-2 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20 transition-colors text-xs font-medium"
        >
          <Plus size={14} />
          {t('refinery.newNote')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
        {/* Mini Calendar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">
            <button
              onClick={() => navigateMonthWithAnimation(-1)}
              className="hover:text-foreground p-1 rounded hover:bg-secondary/50 transition-colors disabled:opacity-50"
              disabled={isAnimating}
            >
              <ChevronLeft size={14} />
            </button>
            <span
              className="cursor-pointer hover:text-foreground"
              onClick={() => {
                // 回到今天（带动画）
                const targetMonth = currentMonthIndex - calendarMonth + (currentYearIndex - calendarYear) * 12;
                if (targetMonth !== 0) {
                  navigateMonthWithAnimation(targetMonth);
                }
              }}
            >
              {currentMonthName}
            </span>
            <button
              onClick={() => navigateMonthWithAnimation(1)}
              className="hover:text-foreground p-1 rounded hover:bg-secondary/50 transition-colors disabled:opacity-50"
              disabled={isAnimating}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Date range display */}
          {hasDateFilter && (
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] text-primary px-2 py-1 bg-primary/5 rounded border border-primary/20 flex-1">
                {formatDateDisplay()}
              </div>
              <button
                onClick={resetDateFilter}
                className="text-[10px] text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary/50"
              >
                <X size={10} />
              </button>
            </div>
          )}

          {/* Calendar Grid - 支持滚轮和拖动，带翻页动画 */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${calendarYear}-${calendarMonth}`}
              variants={calendarVariants}
              initial="enter"
              animate="center"
              exit="exit"
              custom={animationDirection}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              onWheel={handleWheel}
              className="select-none"
              onMouseLeave={handleMouseUp}
            >
              <div className="grid grid-cols-7 gap-1 text-[10px] text-center text-muted-foreground/50">
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <div key={`dow-${i}-${d}`}>{d}</div>
              ))}
              {/* Empty cells for days before first of month */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} />
              ))}
              {/* Days of month */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const inRange = isInRange(day);
                const isStart = isRangeStart(day);
                const isEnd = isRangeEnd(day);

                return (
                  <button
                    key={i}
                    onMouseDown={() => handleMouseDown(day)}
                    onMouseEnter={() => handleMouseEnter(day)}
                    onClick={() => {
                      // 如果没有真正拖动（mousedown 和 mouseup 在同一格），则作为点击处理
                      if (dragStart === day && dragCurrent === day) {
                        handleDayClick(day);
                      }
                    }}
                    className={cn(
                      'py-1.5 rounded-sm transition-all relative',
                      'hover:bg-secondary hover:text-foreground',
                      isToday(day) && !inRange && 'text-primary font-bold',
                      inRange && 'bg-primary/30 text-primary',
                      isStart && 'bg-primary text-primary-foreground rounded-l-sm',
                      isEnd && 'bg-primary text-primary-foreground rounded-r-sm',
                      isStart && isEnd && 'bg-primary text-primary-foreground rounded-sm',
                      !isStart && !isEnd && 'cursor-pointer'
                    )}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            </motion.div>
          </AnimatePresence>

          {/* 拖动提示 */}
          <div className="text-[9px] text-muted-foreground/60 text-center px-2">
            {language === 'zh'
              ? '滚轮切换月份 · 拖动选择范围'
              : 'Scroll to change month · Drag to select range'
            }
          </div>
        </div>

        {/* Quick Filters */}
        <div className="space-y-2">
          <Label>{t('refinery.filters')}</Label>
          <NavBtn
            active={kindFilter === 'all' && !pinnedOnly && !manualOnly}
            onClick={() => {
              setKindFilter('all');
              if (pinnedOnly) togglePinnedOnly();
              if (manualOnly) toggleManualOnly();
            }}
            icon={<Hash size={14} />}
            label={t('refinery.allMemos')}
          />
          <NavBtn
            active={pinnedOnly}
            onClick={togglePinnedOnly}
            icon={<Star size={14} />}
            label={t('refinery.favorites')}
          />
          <NavBtn
            active={manualOnly}
            onClick={toggleManualOnly}
            icon={<PenTool size={14} />}
            label={t('refinery.notes')}
          />
          <NavBtn
            active={kindFilter === 'text'}
            onClick={() => setKindFilter('text')}
            icon={<Type size={14} />}
            label={t('refinery.texts')}
          />
          <NavBtn
            active={kindFilter === 'image'}
            onClick={() => setKindFilter('image')}
            icon={<ImageIcon size={14} />}
            label={t('refinery.images')}
          />
        </div>

        {/* Source Stats */}
        <div className="space-y-2">
          <Label>{t('refinery.statistics')}</Label>
          <div className="px-2 space-y-1">
            {statisticsLoading ? (
              <div className="flex items-center justify-center py-2 text-muted-foreground/40">
                <Loader2 size={14} className="animate-spin" />
              </div>
            ) : statistics ? (
              <>
                <StatItem label={t('refinery.totalEntries')} count={statistics.totalEntries} />
                <StatItem label={t('refinery.thisWeek')} count={statistics.thisWeek} />
                <StatItem label={t('refinery.favorites')} count={statistics.favorites} />
              </>
            ) : (
              <>
                <StatItem label={t('refinery.totalEntries')} count={0} />
                <StatItem label={t('refinery.thisWeek')} count={0} />
                <StatItem label={t('refinery.favorites')} count={0} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Clear History */}
      <div className="p-4 border-t border-border/40">
        <button
          onClick={() => clearHistory(7)}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-destructive transition-colors w-full px-2 py-1.5 rounded hover:bg-destructive/5"
        >
          <Trash2 size={14} />
          {t('refinery.clearDaysAgo', { days: '7' })}
        </button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest px-2 mb-1">
      {children}
    </div>
  );
}

function NavBtn({
  active,
  onClick,
  icon,
  label
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all',
        active
          ? 'bg-secondary text-foreground font-medium shadow-sm'
          : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function StatItem({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
      <span>{label}</span>
      <span className="font-mono font-medium">{count}</span>
    </div>
  );
}
