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

    // 1. 监听新条目 (New Entry)
    unlistenNewEntry = await listen<string>('refinery://new-entry', async (event) => {
      const newId = event.payload;
      // 这里的策略是：只有当用户处于第一页且没有复杂筛选时，才自动插入
      // 否则可能会打乱用户当前的浏览流，或者仅仅显示一个"有新内容"的提示
      // 简化起见：我们直接去获取这条最新的数据并插到头部

      // 为了获取完整数据，我们稍微偷懒调用一次第一页的查询，或者可以写个 get_item_by_id 后端命令
      // 这里为了简单，我们直接重载第一页 (如果当前在第一页)
      const { page, searchQuery } = get();
      if (page === 1 && !searchQuery) {
         await get().loadHistory(true);
      }
    });

    // 2. 监听更新 (Update - e.g. duplicate copy touched timestamp)
    unlistenUpdate = await listen<string>('refinery://update', async (event) => {
       const { page, searchQuery } = get();
       if (page === 1 && !searchQuery) {
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
