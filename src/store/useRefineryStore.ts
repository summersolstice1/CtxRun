import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { RefineryItem, RefineryItemUI } from '@/types/refinery';
import { parseMetadata } from '@/lib/refinery_utils';

const PAGE_SIZE = 20;

interface RefineryStatistics {
  totalEntries: number;
  thisWeek: number;
  favorites: number;
}

interface RefineryState {
  items: RefineryItemUI[];
  activeId: string | null;
  isLoading: boolean;

  // 分页与筛选状态
  page: number;
  hasMore: boolean;
  searchQuery: string;
  kindFilter: 'all' | 'text' | 'image';
  pinnedOnly: boolean;

  // 日历筛选状态
  calendarMonth: number;  // 0-11
  calendarYear: number;
  selectedDate: number | null;  // day of month, null means no filter

  // 统计信息
  statistics: RefineryStatistics | null;
  statisticsLoading: boolean;

  // 抽屉状态
  isDrawerOpen: boolean;

  // Actions
  init: () => Promise<void>;
  unlisten: () => void;

  loadHistory: (reset?: boolean) => Promise<void>;
  loadStatistics: () => Promise<void>;

  setActiveId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setKindFilter: (k: 'all' | 'text' | 'image') => void;
  togglePinnedOnly: () => void;
  setDrawerOpen: (open: boolean) => void;

  // 日历操作
  setCalendarMonth: (month: number) => void;
  setCalendarYear: (year: number) => void;
  navigateMonth: (delta: number) => void;
  setSelectedDate: (day: number | null) => void;
  resetDateFilter: () => void;

  togglePin: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  clearHistory: (days?: number) => Promise<void>;
}

// 转换辅助函数
const transformItem = (item: RefineryItem): RefineryItemUI => ({
  ...item,
  metaParsed: parseMetadata(item.metadata)
});

let unlistenNewEntry: UnlistenFn | null = null;
let unlistenUpdate: UnlistenFn | null = null;

export const useRefineryStore = create<RefineryState>((set, get) => ({
  items: [],
  activeId: null,
  isLoading: false,
  page: 1,
  hasMore: true,
  searchQuery: '',
  kindFilter: 'all',
  pinnedOnly: false,

  // 日历状态初始化为当前月
  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear(),
  selectedDate: null,

  statistics: null,
  statisticsLoading: false,

  isDrawerOpen: false,

  init: async () => {
    // 防止重复监听
    if (unlistenNewEntry) return;

    console.log('[RefineryStore] Initializing listeners...');

    // 1. 监听新条目 (New Entry)
    unlistenNewEntry = await listen<string>('refinery://new-entry', async (event) => {
      console.log('[RefineryStore] New entry detected:', event.payload);

      const { page, searchQuery, kindFilter, selectedDate } = get();

      // 策略修正：只要没有处于"搜索状态"或"非第一页"，就强制刷新
      if (page === 1 && !searchQuery.trim() && kindFilter === 'all' && selectedDate === null) {
          await get().loadHistory(true);
          await get().loadStatistics(); // 刷新统计
      } else {
          // 可选：显示一个小红点提示 "New items available"
      }
    });

    // 2. 监听更新 (Update - e.g. duplicate copy touched timestamp)
    unlistenUpdate = await listen<string>('refinery://update', async (event) => {
       console.log('[RefineryStore] Entry updated:', event.payload);
       const { page, searchQuery, selectedDate } = get();
       // 同样，如果在第一页且没有搜索，就刷新以看到最新的置顶效果
       if (page === 1 && !searchQuery.trim() && selectedDate === null) {
          await get().loadHistory(true);
          await get().loadStatistics();
       }
    });

    // 3. 初始加载
    await get().loadHistory(true);
    await get().loadStatistics();
  },

  unlisten: () => {
    if (unlistenNewEntry) { unlistenNewEntry(); unlistenNewEntry = null; }
    if (unlistenUpdate) { unlistenUpdate(); unlistenUpdate = null; }
  },

  loadHistory: async (reset = false) => {
    const { page, searchQuery, kindFilter, pinnedOnly, selectedDate, calendarYear, calendarMonth, items, isLoading } = get();
    if (isLoading && !reset) return;

    set({ isLoading: true });

    const currentPage = reset ? 1 : page;
    const filterArg = kindFilter === 'all' ? null : kindFilter;
    const searchArg = searchQuery.trim() || null;

    // 构建日期筛选参数
    let startDate: number | null = null;
    let endDate: number | null = null;

    if (selectedDate !== null) {
      // 筛选特定日期
      const date = new Date(calendarYear, calendarMonth, selectedDate);
      startDate = date.getTime();
      endDate = startDate + 24 * 60 * 60 * 1000 - 1; // 当天结束
    }

    try {
      const res = await invoke<RefineryItem[]>('get_refinery_history', {
        page: currentPage,
        pageSize: PAGE_SIZE,
        searchQuery: searchArg,
        kindFilter: filterArg,
        pinnedOnly,
        startDate,
        endDate
      });

      const mappedRes = res.map(transformItem);

      set({
        items: reset ? mappedRes : [...items, ...mappedRes],
        page: currentPage + 1,
        hasMore: res.length === PAGE_SIZE,
        isLoading: false
      });
    } catch (e) {
      console.error("Failed to load refinery history:", e);
      set({ isLoading: false });
    }
  },

  loadStatistics: async () => {
    set({ statisticsLoading: true });
    try {
      const stats = await invoke<RefineryStatistics>('get_refinery_statistics');
      set({ statistics: stats, statisticsLoading: false });
    } catch (e) {
      console.error("Failed to load statistics:", e);
      set({ statisticsLoading: false });
    }
  },

  setActiveId: (id) => set({ activeId: id, isDrawerOpen: !!id }),

  setDrawerOpen: (open) => set({ isDrawerOpen: open }),

  setSearchQuery: (q) => {
    set({ searchQuery: q });
    get().loadHistory(true);
  },

  setKindFilter: (k) => {
    set({ kindFilter: k });
    get().loadHistory(true);
  },

  togglePinnedOnly: () => {
    set(state => {
        const next = !state.pinnedOnly;
        setTimeout(() => get().loadHistory(true), 0);
        return { pinnedOnly: next };
    });
  },

  // 日历操作
  setCalendarMonth: (month) => set({ calendarMonth: month }),

  setCalendarYear: (year) => set({ calendarYear: year }),

  navigateMonth: (delta) => {
    set(state => {
      let newMonth = state.calendarMonth + delta;
      let newYear = state.calendarYear;

      if (newMonth > 11) {
        newMonth = 0;
        newYear += 1;
      } else if (newMonth < 0) {
        newMonth = 11;
        newYear -= 1;
      }

      // 切换月份时清除日期筛选
      get().resetDateFilter();
      return { calendarMonth: newMonth, calendarYear: newYear };
    });
  },

  setSelectedDate: (day) => {
    set({ selectedDate: day });
    get().loadHistory(true);
  },

  resetDateFilter: () => {
    set({ selectedDate: null });
    get().loadHistory(true);
  },

  togglePin: async (id) => {
    try {
      // 乐观更新 UI
      set(state => ({
        items: state.items.map(item =>
          item.id === id ? { ...item, isPinned: !item.isPinned } : item
        )
      }));
      await invoke('toggle_refinery_pin', { id });
      // 刷新统计
      get().loadStatistics();
    } catch (e) {
      console.error(e);
      // 回滚状态 (简化处理，暂略)
    }
  },

  deleteItem: async (id) => {
    try {
      await invoke('delete_refinery_items', { ids: [id] });
      set(state => ({
        items: state.items.filter(item => item.id !== id),
        activeId: state.activeId === id ? null : state.activeId
      }));
      // 刷新统计
      get().loadStatistics();
    } catch (e) {
      console.error(e);
    }
  },

  clearHistory: async (days) => {
    try {
      let timestamp: number | null = null;
      if (days) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        timestamp = date.getTime();
      }

      await invoke('clear_refinery_history', {
        beforeTimestamp: timestamp,
        includePinned: false
      });

      // 重新加载
      get().loadHistory(true);
      get().loadStatistics();
    } catch (e) {
      console.error(e);
    }
  }
}));
