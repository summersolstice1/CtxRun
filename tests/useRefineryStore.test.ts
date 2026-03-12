import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  invokeMock,
  listenMock,
  appStoreSnapshot,
} = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  listenMock: vi.fn(),
  appStoreSnapshot: {
    refinerySettings: {
      enabled: true,
      strategy: 'count' as const,
      maxCount: 200,
      keepPinned: true,
      days: 30,
    },
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: {
    getState: () => appStoreSnapshot,
  },
}));

type RefineryStore = typeof import('@/store/useRefineryStore')['useRefineryStore'];

async function importFreshRefineryStore(): Promise<RefineryStore> {
  vi.resetModules();
  const mod = await import('@/store/useRefineryStore');
  return mod.useRefineryStore;
}

function makeRefineryItem(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'text',
    content: `content-${id}`,
    contentHash: `hash-${id}`,
    preview: `preview-${id}`,
    sourceApp: 'Editor',
    url: undefined,
    sizeInfo: '1KB',
    isPinned: false,
    metadata: '{"tokens":12}',
    createdAt: 1000,
    updatedAt: 2000,
    title: 'Title',
    tags: [],
    isManual: false,
    isEdited: false,
    ...overrides,
  };
}

describe('useRefineryStore', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loadHistory maps metadata, advances page, and sets hasMore', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_history') {
        return [makeRefineryItem('a')];
      }
      return null;
    });

    const useRefineryStore = await importFreshRefineryStore();
    await useRefineryStore.getState().loadHistory(true);

    const state = useRefineryStore.getState();
    expect(state.items).toHaveLength(1);
    expect(state.items[0].metaParsed).toEqual({ tokens: 12 });
    expect(state.page).toBe(2);
    expect(state.hasMore).toBe(false);
    expect(state.isLoading).toBe(false);
  });

  it('setSearchQuery and setKindFilter trigger reset history loading', async () => {
    invokeMock.mockImplementation(async (command: string, args: any) => {
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_history') {
        return [makeRefineryItem('x')];
      }
      return null;
    });
    const useRefineryStore = await importFreshRefineryStore();

    useRefineryStore.getState().setSearchQuery(' hello ');
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|get_refinery_history',
      expect.objectContaining({
        page: 1,
        searchQuery: 'hello',
        kindFilter: null,
      })
    );

    invokeMock.mockClear();
    useRefineryStore.getState().setKindFilter('image');
    await Promise.resolve();
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|get_refinery_history',
      expect.objectContaining({
        page: 1,
        kindFilter: 'image',
      })
    );
  });

  it('togglePinnedOnly schedules reset load and applies filter', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_history') {
        return [];
      }
      return null;
    });
    const useRefineryStore = await importFreshRefineryStore();

    useRefineryStore.getState().togglePinnedOnly();
    expect(useRefineryStore.getState().pinnedOnly).toBe(true);

    await vi.runAllTimersAsync();
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|get_refinery_history',
      expect.objectContaining({
        pinnedOnly: true,
      })
    );
  });

  it('togglePin performs optimistic update and calls backend + statistics refresh', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_statistics') {
        return { totalEntries: 1, thisWeek: 1, favorites: 1 };
      }
      return null;
    });
    const useRefineryStore = await importFreshRefineryStore();
    useRefineryStore.setState({
      items: [
        {
          ...makeRefineryItem('p1', { isPinned: false }),
          metaParsed: {},
        },
      ],
    });

    await useRefineryStore.getState().togglePin('p1');
    await Promise.resolve();

    expect(useRefineryStore.getState().items[0].isPinned).toBe(true);
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|toggle_refinery_pin',
      { id: 'p1' }
    );
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|get_refinery_statistics'
    );
  });

  it('deleteItem removes target and clears activeId when needed', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_statistics') {
        return { totalEntries: 0, thisWeek: 0, favorites: 0 };
      }
      return null;
    });
    const useRefineryStore = await importFreshRefineryStore();
    useRefineryStore.setState({
      activeId: 'a',
      items: [
        { ...makeRefineryItem('a'), metaParsed: {} },
        { ...makeRefineryItem('b'), metaParsed: {} },
      ],
    });

    await useRefineryStore.getState().deleteItem('a');
    await Promise.resolve();

    expect(useRefineryStore.getState().items.map((x) => x.id)).toEqual(['b']);
    expect(useRefineryStore.getState().activeId).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|delete_refinery_items',
      { ids: ['a'] }
    );
  });

  it('clearHistory resets filters and requests cleanup command', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_history') return [];
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_statistics') {
        return { totalEntries: 0, thisWeek: 0, favorites: 0 };
      }
      return null;
    });
    const useRefineryStore = await importFreshRefineryStore();
    useRefineryStore.setState({
      searchQuery: 'abc',
      kindFilter: 'image',
      pinnedOnly: true,
      manualOnly: true,
      dateRange: { start: 1, end: 2 },
    });

    await useRefineryStore.getState().clearHistory();
    await Promise.resolve();

    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|clear_refinery_history',
      expect.objectContaining({ includePinned: false })
    );
    expect(useRefineryStore.getState().searchQuery).toBe('');
    expect(useRefineryStore.getState().kindFilter).toBe('all');
    expect(useRefineryStore.getState().pinnedOnly).toBe(false);
    expect(useRefineryStore.getState().manualOnly).toBe(false);
    expect(useRefineryStore.getState().dateRange).toEqual({ start: null, end: null });
  });

  it('init registers listeners once and unlisten clears handlers', async () => {
    const unlistenA = vi.fn();
    const unlistenB = vi.fn();

    listenMock
      .mockResolvedValueOnce(unlistenA)
      .mockResolvedValueOnce(unlistenB);
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_history') return [];
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_statistics') {
        return { totalEntries: 0, thisWeek: 0, favorites: 0 };
      }
      return null;
    });

    const useRefineryStore = await importFreshRefineryStore();
    await useRefineryStore.getState().init();
    await useRefineryStore.getState().init();

    expect(listenMock).toHaveBeenCalledTimes(2);
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|update_cleanup_config',
      expect.objectContaining({
        config: expect.objectContaining({
          enabled: true,
          strategy: 'count',
        }),
      })
    );

    useRefineryStore.getState().unlisten();
    expect(unlistenA).toHaveBeenCalledTimes(1);
    expect(unlistenB).toHaveBeenCalledTimes(1);
    expect(useRefineryStore.getState()._unlistenFns).toEqual([]);
  });

  it('loadHistory derives endDate from a single-day range and blocks overlapping non-reset calls', async () => {
    const pending = new Promise<any[]>(() => {});
    invokeMock.mockImplementation((command: string, args: any) => {
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_history') {
        if (args.page === 1) {
          return [
            ...Array.from({ length: 20 }, (_, index) => makeRefineryItem(`seed-${index}`)),
          ];
        }
        return pending;
      }
      return Promise.resolve(null);
    });

    const useRefineryStore = await importFreshRefineryStore();
    useRefineryStore.setState({
      dateRange: { start: 1_700_000_000_000, end: null },
    });

    await useRefineryStore.getState().loadHistory(true);
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|get_refinery_history',
      expect.objectContaining({
        page: 1,
        startDate: 1_700_000_000_000,
        endDate: 1_700_000_000_000 + 24 * 60 * 60 * 1000 - 1,
      })
    );
    expect(useRefineryStore.getState().hasMore).toBe(true);

    useRefineryStore.setState({ isLoading: true, page: 2 });
    await useRefineryStore.getState().loadHistory(false);
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });

  it('loadStatistics and loadItemDetail handle success, empty results, and failures', async () => {
    invokeMock.mockImplementation(async (command: string, args: any) => {
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_statistics') {
        return { totalEntries: 5, thisWeek: 2, favorites: 1 };
      }
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_item_detail') {
        if (args.id === 'has-detail') {
          return makeRefineryItem('has-detail', { content: 'fresh detail' });
        }
        return null;
      }
      return null;
    });

    const useRefineryStore = await importFreshRefineryStore();
    useRefineryStore.setState({
      items: [
        { ...makeRefineryItem('has-detail', { content: 'stale' }), metaParsed: {} },
        { ...makeRefineryItem('no-detail'), metaParsed: {} },
      ],
    });

    await useRefineryStore.getState().loadStatistics();
    expect(useRefineryStore.getState().statistics).toEqual({
      totalEntries: 5,
      thisWeek: 2,
      favorites: 1,
    });
    expect(useRefineryStore.getState().statisticsLoading).toBe(false);

    await useRefineryStore.getState().loadItemDetail('has-detail');
    expect(useRefineryStore.getState().items[0].content).toBe('fresh detail');

    await useRefineryStore.getState().loadItemDetail('no-detail');
    expect(useRefineryStore.getState().items[1].content).toBe('content-no-detail');

    invokeMock.mockRejectedValueOnce(new Error('stats failed'));
    await useRefineryStore.getState().loadStatistics();
    expect(useRefineryStore.getState().statisticsLoading).toBe(false);
  });

  it('supports manual-only filtering, drawer toggles, and month navigation across years', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_history') return [];
      return null;
    });
    const useRefineryStore = await importFreshRefineryStore();
    useRefineryStore.setState({
      calendarMonth: 11,
      calendarYear: 2024,
    });

    useRefineryStore.getState().setActiveId('item-1');
    expect(useRefineryStore.getState().activeId).toBe('item-1');
    expect(useRefineryStore.getState().isDrawerOpen).toBe(true);

    useRefineryStore.getState().setDrawerOpen(false);
    expect(useRefineryStore.getState().isDrawerOpen).toBe(false);

    useRefineryStore.getState().toggleManualOnly();
    expect(useRefineryStore.getState().manualOnly).toBe(true);
    await vi.runAllTimersAsync();
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|get_refinery_history',
      expect.objectContaining({
        manualOnly: true,
      })
    );

    invokeMock.mockClear();
    useRefineryStore.getState().navigateMonth(1);
    await Promise.resolve();
    expect(useRefineryStore.getState().calendarMonth).toBe(0);
    expect(useRefineryStore.getState().calendarYear).toBe(2025);
    expect(useRefineryStore.getState().dateRange).toEqual({ start: null, end: null });
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|get_refinery_history',
      expect.objectContaining({ page: 1 })
    );
  });

  it('adjusts date ranges when start and end are selected out of order', async () => {
    invokeMock.mockResolvedValue([]);
    const useRefineryStore = await importFreshRefineryStore();
    useRefineryStore.setState({
      calendarYear: 2024,
      calendarMonth: 0,
      dateRange: {
        start: new Date(2024, 0, 5).getTime(),
        end: new Date(2024, 0, 6).getTime(),
      },
    });

    useRefineryStore.getState().setRangeStart(10);
    let state = useRefineryStore.getState();
    expect(state.dateRange.start).toBe(new Date(2024, 0, 10).getTime());
    expect(state.dateRange.end).toBe(new Date(2024, 0, 10).getTime() + 24 * 60 * 60 * 1000 - 1);

    useRefineryStore.setState({
      dateRange: {
        start: new Date(2024, 0, 15).getTime(),
        end: new Date(2024, 0, 16).getTime() + 24 * 60 * 60 * 1000 - 1,
      },
    });
    useRefineryStore.getState().setRangeEnd(10);
    state = useRefineryStore.getState();
    expect(state.dateRange.start).toBe(new Date(2024, 0, 10).getTime());
    expect(state.dateRange.end).toBe(new Date(2024, 0, 10).getTime() + 24 * 60 * 60 * 1000 - 1);

    useRefineryStore.getState().resetDateFilter();
    expect(useRefineryStore.getState().dateRange).toEqual({ start: null, end: null });
  });

  it('createNote reloads history and opens the created note', async () => {
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'plugin:ctxrun-plugin-refinery|create_note') {
        return 'note-1';
      }
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_history') {
        return [makeRefineryItem('note-1', { isManual: true })];
      }
      return null;
    });

    const useRefineryStore = await importFreshRefineryStore();
    await useRefineryStore.getState().createNote();

    expect(invokeMock).toHaveBeenCalledWith('plugin:ctxrun-plugin-refinery|create_note', {
      content: '',
      title: 'New Note',
    });
    expect(useRefineryStore.getState().activeId).toBe('note-1');
    expect(useRefineryStore.getState().isDrawerOpen).toBe(true);
    expect(useRefineryStore.getState().items[0].id).toBe('note-1');
  });

  it('updateNote edits text content, preserves image content, and passes nulls for empty updates', async () => {
    invokeMock.mockResolvedValue(null);
    const useRefineryStore = await importFreshRefineryStore();
    useRefineryStore.setState({
      items: [
        {
          ...makeRefineryItem('text-1', { kind: 'text', content: 'before', title: 'Old' }),
          metaParsed: {},
        },
        {
          ...makeRefineryItem('image-1', { kind: 'image', content: '/tmp/image.png', title: 'Pic' }),
          metaParsed: {},
        },
      ],
    });

    await useRefineryStore.getState().updateNote('text-1', '', '');
    expect(useRefineryStore.getState().items[0]).toEqual(
      expect.objectContaining({
        content: '',
        title: null,
        isEdited: true,
      })
    );
    expect(invokeMock).toHaveBeenCalledWith('plugin:ctxrun-plugin-refinery|update_note', {
      id: 'text-1',
      content: null,
      title: null,
    });

    await useRefineryStore.getState().updateNote('image-1', 'ignored', 'Renamed');
    expect(useRefineryStore.getState().items[1]).toEqual(
      expect.objectContaining({
        content: '/tmp/image.png',
        title: 'Renamed',
        isEdited: true,
      })
    );
  });

  it('clearHistory can scope by age and deleteItem keeps state when backend deletion fails', async () => {
    vi.setSystemTime(new Date('2025-01-31T00:00:00Z'));
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_history') return [];
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_statistics') {
        return { totalEntries: 1, thisWeek: 0, favorites: 0 };
      }
      if (command === 'plugin:ctxrun-plugin-refinery|delete_refinery_items') {
        throw new Error('delete failed');
      }
      return null;
    });
    const useRefineryStore = await importFreshRefineryStore();
    useRefineryStore.setState({
      activeId: 'keep',
      items: [{ ...makeRefineryItem('keep'), metaParsed: {} }],
    });

    await useRefineryStore.getState().clearHistory(7);
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|clear_refinery_history',
      expect.objectContaining({
        beforeTimestamp: new Date('2025-01-24T00:00:00Z').getTime(),
        includePinned: false,
      })
    );

    useRefineryStore.setState({
      activeId: 'keep',
      items: [{ ...makeRefineryItem('keep'), metaParsed: {} }],
    });
    await useRefineryStore.getState().deleteItem('keep');
    expect(useRefineryStore.getState().items.map((item) => item.id)).toEqual(['keep']);
    expect(useRefineryStore.getState().activeId).toBe('keep');
  });

  it('listener callbacks refresh only when the current filters allow it', async () => {
    const listeners: Record<string, () => Promise<void>> = {};
    listenMock.mockImplementation(async (event: string, handler: () => Promise<void>) => {
      listeners[event] = handler;
      return vi.fn();
    });
    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_history') return [];
      if (command === 'plugin:ctxrun-plugin-refinery|get_refinery_statistics') {
        return { totalEntries: 0, thisWeek: 0, favorites: 0 };
      }
      return null;
    });

    const useRefineryStore = await importFreshRefineryStore();
    await useRefineryStore.getState().init();
    invokeMock.mockClear();

    useRefineryStore.setState({
      page: 1,
      searchQuery: '',
      kindFilter: 'all',
      dateRange: { start: null, end: null },
    });
    await listeners['refinery://new-entry']();
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|get_refinery_history',
      expect.objectContaining({ page: 1 })
    );
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|get_refinery_statistics'
    );

    invokeMock.mockClear();
    useRefineryStore.setState({ searchQuery: 'filtered' });
    await listeners['refinery://new-entry']();
    expect(invokeMock).not.toHaveBeenCalled();

    useRefineryStore.setState({ searchQuery: '', page: 1, dateRange: { start: null, end: null } });
    await listeners['refinery://update']();
    expect(invokeMock).toHaveBeenCalledWith(
      'plugin:ctxrun-plugin-refinery|get_refinery_history',
      expect.objectContaining({ page: 1 })
    );
  });
});
