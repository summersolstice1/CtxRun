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
  start: number | null;
  end: number | null;
}

interface RefineryState {
  items: RefineryItemUI[];
  activeId: string | null;
  isLoading: boolean;

  page: number;
  hasMore: boolean;
  searchQuery: string;
  kindFilter: 'all' | 'text' | 'image';
  pinnedOnly: boolean;
  manualOnly: boolean;

  calendarMonth: number;
  calendarYear: number;
  dateRange: DateRange;

  statistics: RefineryStatistics | null;
  statisticsLoading: boolean;

  isDrawerOpen: boolean;

  _unlistenFns: UnlistenFn[];

  init: () => Promise<void>;
  unlisten: () => void;

  loadHistory: (reset?: boolean) => Promise<void>;
  loadStatistics: () => Promise<void>;
  loadItemDetail: (id: string) => Promise<void>;

  setActiveId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setKindFilter: (k: 'all' | 'text' | 'image') => void;
  togglePinnedOnly: () => void;
  toggleManualOnly: () => void;
  setDrawerOpen: (open: boolean) => void;

  setCalendarMonth: (month: number) => void;
  setCalendarYear: (year: number) => void;
  navigateMonth: (delta: number) => void;
  setRangeStart: (day: number) => void;
  setRangeEnd: (day: number) => void;
  resetDateFilter: () => void;

  togglePin: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  clearHistory: (days?: number) => Promise<void>;

  createNote: () => Promise<void>;
  updateNote: (id: string, content?: string, title?: string) => Promise<void>;
}

const transformItem = (item: RefineryItem): RefineryItemUI => ({
  ...item,
  metaParsed: parseMetadata(item.metadata)
});

export const useRefineryStore = create<RefineryState>((set, get) => ({
  items: [],
  activeId: null,
  isLoading: false,
  page: 1,
  hasMore: true,
  searchQuery: '',
  kindFilter: 'all',
  pinnedOnly: false,
  manualOnly: false,

  calendarMonth: new Date().getMonth(),
  calendarYear: new Date().getFullYear(),
  dateRange: { start: null, end: null },

  statistics: null,
  statisticsLoading: false,

  isDrawerOpen: false,

  _unlistenFns: [],

  init: async () => {
    if (get()._unlistenFns.length > 0) return;

    const unlistenNewEntry = await listen<string>('refinery://new-entry', async () => {
      const { page, searchQuery, kindFilter, dateRange } = get();

      if (page === 1 && !searchQuery.trim() && kindFilter === 'all' && !dateRange.start && !dateRange.end) {
          await get().loadHistory(true);
          await get().loadStatistics();
      }
    });

    const unlistenUpdate = await listen<string>('refinery://update', async () => {
       const { page, searchQuery, dateRange } = get();
       if (page === 1 && !searchQuery.trim() && !dateRange.start && !dateRange.end) {
          await get().loadHistory(true);
          await get().loadStatistics();
       }
    });

    set({ _unlistenFns: [unlistenNewEntry, unlistenUpdate] });

    await get().loadHistory(true);
    await get().loadStatistics();
  },

  unlisten: () => {
    const { _unlistenFns } = get();

    _unlistenFns.forEach(fn => fn());

    set({ _unlistenFns: [] });
  },

  loadHistory: async (reset = false) => {
    const { page, searchQuery, kindFilter, pinnedOnly, manualOnly, dateRange, items, isLoading } = get();
    if (isLoading && !reset) return;

    set({ isLoading: true });

    const currentPage = reset ? 1 : page;
    const filterArg = kindFilter === 'all' ? null : kindFilter;
    const searchArg = searchQuery.trim() || null;

    let startDate: number | null = dateRange.start;
    let endDate: number | null = dateRange.end;

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
        manualOnly,
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
      set({ isLoading: false });
    }
  },

  loadStatistics: async () => {
    set({ statisticsLoading: true });
    try {
      const stats = await invoke<RefineryStatistics>('get_refinery_statistics');
      set({ statistics: stats, statisticsLoading: false });
    } catch (e) {
      set({ statisticsLoading: false });
    }
  },

  loadItemDetail: async (id) => {
    try {
      const item = await invoke<RefineryItem>('get_refinery_item_detail', { id });
      if (!item) return;

      set(state => ({
        items: state.items.map(i =>
          i.id === id ? { ...i, content: item.content } : i
        )
      }));
    } catch (e) {
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

  toggleManualOnly: () => {
    set(state => {
        const next = !state.manualOnly;
        setTimeout(() => get().loadHistory(true), 0);
        return { manualOnly: next };
    });
  },

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

      get().resetDateFilter();
      return { calendarMonth: newMonth, calendarYear: newYear };
    });
  },

  setRangeStart: (day) => {
    const { calendarYear, calendarMonth, dateRange } = get();
    const date = new Date(calendarYear, calendarMonth, day);
    const start = date.getTime();

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
    const end = date.getTime() + 24 * 60 * 60 * 1000 - 1;

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
      set(state => ({
        items: state.items.map(item =>
          item.id === id ? { ...item, isPinned: !item.isPinned } : item
        )
      }));
      await invoke('toggle_refinery_pin', { id });
      get().loadStatistics();
    } catch (e) {
    }
  },

  deleteItem: async (id) => {
    try {
      await invoke('delete_refinery_items', { ids: [id] });
      set(state => ({
        items: state.items.filter(item => item.id !== id),
        activeId: state.activeId === id ? null : state.activeId
      }));
      get().loadStatistics();
    } catch (e) {
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

      set({
        searchQuery: '',
        kindFilter: 'all',
        pinnedOnly: false,
        manualOnly: false,
        dateRange: { start: null, end: null }
      });
      get().loadHistory(true);
      get().loadStatistics();
    } catch (e) {
    }
  },

  createNote: async () => {
    try {
      const id = await invoke<string>('create_note', {
        content: '',
        title: 'New Note'
      });

      await get().loadHistory(true);
      get().setActiveId(id);
      get().setDrawerOpen(true);

    } catch (e) {
    }
  },

  updateNote: async (id, content, title) => {
    try {
      set(state => ({
        items: state.items.map(item => {
          if (item.id !== id) return item;
          return {
            ...item,
            title: title !== undefined ? (title || null) : item.title,
            content: (item.kind === 'text' && content !== undefined) ? content : item.content,
            isEdited: true,
            updatedAt: Date.now()
          };
        })
      }));

      await invoke('update_note', {
        id,
        content: content || null,
        title: title || null
      });
    } catch (e) {
    }
  }
}));
