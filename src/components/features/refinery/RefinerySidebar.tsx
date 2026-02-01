import { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Hash, Star, Type, Image as ImageIcon, Trash2, ChevronLeft, ChevronRight, Search, X, Loader2 } from 'lucide-react';
import { useRefineryStore } from '@/store/useRefineryStore';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { getText } from '@/lib/i18n';

export function RefinerySidebar() {
  const {
    kindFilter, setKindFilter, pinnedOnly, togglePinnedOnly, clearHistory,
    calendarMonth, calendarYear, selectedDate,
    navigateMonth, setSelectedDate, resetDateFilter,
    statistics, statisticsLoading
  } = useRefineryStore();
  const { language } = useAppStore();

  const [localSearch, setLocalSearch] = useState('');
  const { searchQuery, setSearchQuery } = useRefineryStore();

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

  // 判断日期是否被选中
  const isSelected = (day: number) => selectedDate === day;

  // 检查是否在当前视图中
  const isCurrentMonth = calendarMonth === currentMonthIndex && calendarYear === currentYearIndex;

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

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-5">
        {/* Mini Calendar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase tracking-widest px-1">
            <button
              onClick={() => navigateMonth(-1)}
              className="hover:text-foreground p-1 rounded hover:bg-secondary/50 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="cursor-pointer hover:text-foreground" onClick={() => {
              // 回到今天
              navigateMonth(currentMonthIndex - calendarMonth + (currentYearIndex - calendarYear) * 12);
            }}>
              {currentMonthName}
            </span>
            <button
              onClick={() => navigateMonth(1)}
              className="hover:text-foreground p-1 rounded hover:bg-secondary/50 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {selectedDate !== null && (
            <button
              onClick={resetDateFilter}
              className="text-[10px] text-primary hover:underline flex items-center gap-1 px-1"
            >
              <X size={10} />
              {getText('refinery', 'clearDateFilter', language)}
            </button>
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
              return (
                <button
                  key={i}
                  onClick={() => isSelected(day) ? resetDateFilter() : setSelectedDate(day)}
                  className={cn(
                    'py-1.5 rounded-sm transition-all',
                    'hover:bg-secondary hover:text-foreground',
                    isToday(day) && 'text-primary font-bold',
                    isSelected(day) && 'bg-primary text-primary-foreground font-bold hover:bg-primary/90',
                    !isSelected(day) && 'cursor-pointer'
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
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
