import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { RefineryItem, RefineryItemUI } from '@/types/refinery';
import { parseMetadata } from '@/lib/refinery_utils';

const PAGE_SIZE = 20;

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

  // Actions
  init: () => Promise<void>;
  unlisten: () => void;

  loadHistory: (reset?: boolean) => Promise<void>;

  setActiveId: (id: string | null) => void;
  setSearchQuery: (q: string) => void;
  setKindFilter: (k: 'all' | 'text' | 'image') => void;
  togglePinnedOnly: () => void;

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

  init: async () => {
    // 防止重复监听
    if (unlistenNewEntry) return;

    console.log('[RefineryStore] Initializing listeners...');

    // 1. 监听新条目 (New Entry)
    unlistenNewEntry = await listen<string>('refinery://new-entry', async (event) => {
      console.log('[RefineryStore] New entry detected:', event.payload);

      const { page, searchQuery, kindFilter } = get();

      // 策略修正：只要没有处于"搜索状态"或"非第一页"，就强制刷新
      // 如果用户正在搜索，突然跳出来新内容会打断体验，所以搜索时不自动刷新
      // 如果用户翻到了第10页，也不要自动跳回第1页

      // 简单粗暴方案：只要在第一页且没有搜索就刷新
      if (page === 1 && !searchQuery.trim() && kindFilter === 'all') {
          await get().loadHistory(true); // 重新加载第一页
      } else {
          // 可选：显示一个小红点提示 "New items available"
      }
    });

    // 2. 监听更新 (Update - e.g. duplicate copy touched timestamp)
    unlistenUpdate = await listen<string>('refinery://update', async (event) => {
       console.log('[RefineryStore] Entry updated:', event.payload);
       const { page, searchQuery } = get();
       // 同样，如果在第一页且没有搜索，就刷新以看到最新的置顶效果
       if (page === 1 && !searchQuery.trim()) {
          await get().loadHistory(true);
       }
    });

    // 3. 初始加载
    await get().loadHistory(true);
  },

  unlisten: () => {
    if (unlistenNewEntry) { unlistenNewEntry(); unlistenNewEntry = null; }
    if (unlistenUpdate) { unlistenUpdate(); unlistenUpdate = null; }
  },

  loadHistory: async (reset = false) => {
    const { page, searchQuery, kindFilter, pinnedOnly, items, isLoading } = get();
    if (isLoading && !reset) return;

    set({ isLoading: true });

    const currentPage = reset ? 1 : page;
    const filterArg = kindFilter === 'all' ? null : kindFilter;
    const searchArg = searchQuery.trim() || null;

    try {
      const res = await invoke<RefineryItem[]>('get_refinery_history', {
        page: currentPage,
        pageSize: PAGE_SIZE,
        searchQuery: searchArg,
        kindFilter: filterArg,
        pinnedOnly
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

  setActiveId: (id) => set({ activeId: id }),

  setSearchQuery: (q) => {
    set({ searchQuery: q });
    get().loadHistory(true); // 搜索触发重置
  },

  setKindFilter: (k) => {
    set({ kindFilter: k });
    get().loadHistory(true);
  },

  togglePinnedOnly: () => {
    set(state => {
        const next = !state.pinnedOnly;
        // 如果开启只看收藏，通常需要重置列表
        setTimeout(() => get().loadHistory(true), 0);
        return { pinnedOnly: next };
    });
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
    } catch (e) {
      console.error(e);
    }
  }
}));
