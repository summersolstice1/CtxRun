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

interface DateRange {
  start: number | null;  // timestamp
  end: number | null;    // timestamp
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
  dateRange: DateRange;   // 日期范围筛选

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
  setRangeStart: (day: number) => void;
  setRangeEnd: (day: number) => void;
  resetDateFilter: () => void;

  togglePin: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  clearHistory: (days?: number) => Promise<void>;

  // [新增] 笔记操作
  createNote: () => Promise<void>;
  updateNote: (id: string, content?: string, title?: string) => Promise<void>;
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
  dateRange: { start: null, end: null },

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

      const { page, searchQuery, kindFilter, dateRange } = get();

      // 策略修正：只要没有处于"搜索状态"或"非第一页"，就强制刷新
      if (page === 1 && !searchQuery.trim() && kindFilter === 'all' && !dateRange.start && !dateRange.end) {
          await get().loadHistory(true);
          await get().loadStatistics(); // 刷新统计
      } else {
          // 可选：显示一个小红点提示 "New items available"
      }
    });

    // 2. 监听更新 (Update - e.g. duplicate copy touched timestamp)
    unlistenUpdate = await listen<string>('refinery://update', async (event) => {
       console.log('[RefineryStore] Entry updated:', event.payload);
       const { page, searchQuery, dateRange } = get();
       // 同样，如果在第一页且没有搜索，就刷新以看到最新的置顶效果
       if (page === 1 && !searchQuery.trim() && !dateRange.start && !dateRange.end) {
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
    const { page, searchQuery, kindFilter, pinnedOnly, dateRange, items, isLoading } = get();
    if (isLoading && !reset) return;

    set({ isLoading: true });

    const currentPage = reset ? 1 : page;
    const filterArg = kindFilter === 'all' ? null : kindFilter;
    const searchArg = searchQuery.trim() || null;

    // 使用日期范围筛选
    let startDate: number | null = dateRange.start;
    let endDate: number | null = dateRange.end;

    // 如果 end date 没有设置但 start 设置了，将 end 设置为当天结束
    if (startDate && !endDate) {
      endDate = startDate + 24 * 60 * 60 * 1000 - 1;
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

  setRangeStart: (day) => {
    const { calendarYear, calendarMonth, dateRange } = get();
    const date = new Date(calendarYear, calendarMonth, day);
    const start = date.getTime();

    // 如果已有结束日期且开始日期晚于结束日期，交换
    let newStart = start;
    let newEnd = dateRange.end;

    if (newEnd && newStart > newEnd) {
      newEnd = newStart + 24 * 60 * 60 * 1000 - 1;
    }

    set({ dateRange: { start: newStart, end: newEnd } });
    get().loadHistory(true);
  },

  setRangeEnd: (day) => {
    const { calendarYear, calendarMonth, dateRange } = get();
    const date = new Date(calendarYear, calendarMonth, day);
    // 设置为当天结束（23:59:59.999）
    const end = date.getTime() + 24 * 60 * 60 * 1000 - 1;

    // 如果已有开始日期且结束日期早于开始日期，交换
    let newStart = dateRange.start;
    let newEnd = end;

    if (newStart && newEnd < newStart) {
      newStart = date.getTime();
    }

    set({ dateRange: { start: newStart, end: newEnd } });
    get().loadHistory(true);
  },

  resetDateFilter: () => {
    set({ dateRange: { start: null, end: null } });
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
  },

  // [新增] 笔记操作
  createNote: async () => {
    try {
      // 1. 调用后端创建空笔记
      // 使用 "New Note" 作为默认标题，空内容
      const id = await invoke<string>('create_note', {
        content: '',
        title: 'New Note'
      });

      // 2. 刷新列表 (loadHistory 会把新项拉到最前)
      await get().loadHistory(true);

      // 3. 自动选中并打开抽屉
      get().setActiveId(id);
      get().setDrawerOpen(true);

    } catch (e) {
      console.error("Failed to create note:", e);
    }
  },

  updateNote: async (id, content, title) => {
    try {
      // 1. 乐观更新本地 UI (为了即时响应)
      set(state => ({
        items: state.items.map(item => {
          if (item.id !== id) return item;
          return {
            ...item,
            // 如果传了 null/undefined 则保持原值
            title: title !== undefined ? (title || null) : item.title,
            // 注意：如果是 text 类型，content 字段即文本；如果是 image，content 是路径，不可修改
            content: (item.kind === 'text' && content !== undefined) ? content : item.content,
            isEdited: true,
            updatedAt: Date.now() // 乐观更新时间
          };
        })
      }));

      // 2. 调用后端持久化
      // 注意：Rust 端 Option<String> 对应 JS 的 string | null
      await invoke('update_note', {
        id,
        content: content || null,
        title: title || null
      });

      // 不需要 reloadHistory，因为乐观更新已经处理了 UI，
      // 且 Rust 端发出的事件监听器会处理后续的一致性。
    } catch (e) {
      console.error("Failed to update note:", e);
      // 实际生产中可能需要回滚机制
    }
  }
}));
