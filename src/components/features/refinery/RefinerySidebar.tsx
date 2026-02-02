import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Hash, Star, Type, Image as ImageIcon, Trash2, ChevronLeft, ChevronRight, Search, X, Loader2, Calendar } from 'lucide-react';
import { useRefineryStore } from '@/store/useRefineryStore';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { getText } from '@/lib/i18n';

export function RefinerySidebar() {
  const {
    kindFilter, setKindFilter, pinnedOnly, togglePinnedOnly, clearHistory,
    calendarMonth, calendarYear, dateRange,
    navigateMonth, setRangeStart, setRangeEnd, resetDateFilter,
    statistics, statisticsLoading
  } = useRefineryStore();
  const { language } = useAppStore();

  const [localSearch, setLocalSearch] = useState('');
  const { searchQuery, setSearchQuery } = useRefineryStore();

  // 日历范围选择模式
  const [rangeMode, setRangeMode] = useState(false); // false=单选, true=范围选择

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        setSearchQuery(localSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch, setSearchQuery, searchQuery]);

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
    if (!dateRange.start && !dateRange.end) return false;

    const dayTimestamp = new Date(calendarYear, calendarMonth, day).getTime();
    const start = dateRange.start || dayTimestamp;
    const end = dateRange.end || dayTimestamp;

    // 范围内的日期（包括边界）
    return dayTimestamp >= Math.min(start, end) && dayTimestamp <= Math.max(start, end);
  };

  // 判断日期是否是开始日期
  const isRangeStart = (day: number) => {
    if (!dateRange.start) return false;
    const dayTimestamp = new Date(calendarYear, calendarMonth, day).getTime();
    return dayTimestamp === dateRange.start;
  };

  // 判断日期是否是结束日期
  const isRangeEnd = (day: number) => {
    if (!dateRange.end) return false;
    const dayTimestamp = new Date(calendarYear, calendarMonth, day).getTime();
    return dayTimestamp === dateRange.end;
  };

  // 处理日期点击
  const handleDayClick = (day: number) => {
    if (rangeMode) {
      // 范围模式：第一次点击设置开始，第二次点击设置结束
      if (!dateRange.start || (dateRange.start && dateRange.end)) {
        // 设置新的开始日期，清除结束日期
        setRangeStart(day);
      } else {
        // 设置结束日期
        setRangeEnd(day);
      }
    } else {
      // 单选模式：点击切换
      const dayTimestamp = new Date(calendarYear, calendarMonth, day).getTime();
      if (dateRange.start === dayTimestamp && !dateRange.end) {
        resetDateFilter();
      } else {
        setRangeStart(day);
      }
    }
  };

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
      <div className="p-3 border-b border-border/50">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
          <input
            className="w-full bg-secondary/50 border border-border/50 rounded-lg pl-8 pr-8 py-2 text-xs focus:ring-1 focus:ring-primary/30 focus:bg-background transition-all outline-none"
            placeholder={getText('refinery', 'search', language)}
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
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
        {/* Mini Calendar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">
            <button
              onClick={() => navigateMonth(-1)}
              className="hover:text-foreground p-1 rounded hover:bg-secondary/50 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span
              className="cursor-pointer hover:text-foreground"
              onClick={() => {
                // 回到今天
                navigateMonth(currentMonthIndex - calendarMonth + (currentYearIndex - calendarYear) * 12);
              }}
            >
              {currentMonthName}
            </span>
            <button
              onClick={() => navigateMonth(1)}
              className="hover:text-foreground p-1 rounded hover:bg-secondary/50 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Range mode toggle */}
          <div className="flex items-center justify-between px-1">
            <button
              onClick={() => {
                setRangeMode(!rangeMode);
                // 切换模式时清除现有选择
                resetDateFilter();
              }}
              className={cn(
                "flex items-center gap-1.5 text-[10px] px-2 py-1 rounded transition-all",
                rangeMode
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary"
              )}
            >
              <Calendar size={12} />
              {rangeMode
                ? (language === 'zh' ? '范围模式' : 'Range mode')
                : (language === 'zh' ? '单选模式' : 'Single mode')
              }
            </button>

            {hasDateFilter && (
              <button
                onClick={resetDateFilter}
                className="text-[10px] text-primary hover:underline flex items-center gap-1"
              >
                <X size={10} />
                {language === 'zh' ? '清除' : 'Clear'}
              </button>
            )}
          </div>

          {/* Date range display */}
          {hasDateFilter && (
            <div className="text-[10px] text-primary px-2 py-1 bg-primary/5 rounded border border-primary/20">
              {formatDateDisplay()}
            </div>
          )}

          <div className="grid grid-cols-7 gap-1 text-[10px] text-center text-muted-foreground/50">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => (
              <div key={d}>{d}</div>
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
                  onClick={() => handleDayClick(day)}
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

          {/* Range mode hint */}
          {rangeMode && !hasDateFilter && (
            <div className="text-[9px] text-muted-foreground/60 text-center px-2">
              {language === 'zh'
                ? '点击两个日期选择范围'
                : 'Click two dates to select range'
              }
            </div>
          )}
        </div>

        {/* Quick Filters */}
        <div className="space-y-2">
          <Label>{getText('refinery', 'filters', language)}</Label>
          <NavBtn
            active={kindFilter === 'all' && !pinnedOnly}
            onClick={() => { setKindFilter('all'); }}
            icon={<Hash size={14} />}
            label={getText('refinery', 'allMemos', language)}
          />
          <NavBtn
            active={pinnedOnly}
            onClick={togglePinnedOnly}
            icon={<Star size={14} />}
            label={getText('refinery', 'favorites', language)}
          />
          <NavBtn
            active={kindFilter === 'text'}
            onClick={() => setKindFilter('text')}
            icon={<Type size={14} />}
            label={getText('refinery', 'texts', language)}
          />
          <NavBtn
            active={kindFilter === 'image'}
            onClick={() => setKindFilter('image')}
            icon={<ImageIcon size={14} />}
            label={getText('refinery', 'images', language)}
          />
        </div>

        {/* Source Stats */}
        <div className="space-y-2">
          <Label>{getText('refinery', 'statistics', language)}</Label>
          <div className="px-2 space-y-1">
            {statisticsLoading ? (
              <div className="flex items-center justify-center py-2 text-muted-foreground/40">
                <Loader2 size={14} className="animate-spin" />
              </div>
            ) : statistics ? (
              <>
                <StatItem label={getText('refinery', 'totalEntries', language)} count={statistics.totalEntries} />
                <StatItem label={getText('refinery', 'thisWeek', language)} count={statistics.thisWeek} />
                <StatItem label={getText('refinery', 'favorites', language)} count={statistics.favorites} />
              </>
            ) : (
              <>
                <StatItem label={getText('refinery', 'totalEntries', language)} count={0} />
                <StatItem label={getText('refinery', 'thisWeek', language)} count={0} />
                <StatItem label={getText('refinery', 'favorites', language)} count={0} />
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
          {getText('refinery', 'clearDaysAgo', language, { days: '7' })}
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
