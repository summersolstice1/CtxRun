import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Prompt } from '@/types/prompt';
import { SpotlightItem } from '@/types/spotlight';
import { useSpotlight } from '../core/SpotlightContext';
import { evaluateMath } from '@/lib/calculator';
import { useAppStore } from '@/store/useAppStore';
import { RefineryItem } from '@/types/refinery';
import { formatTimeAgo } from '@/lib/refinery_utils';
import { TFunction } from 'i18next';

const REFINERY_PLUGIN_PREFIX = 'plugin:ctxrun-plugin-refinery|';

function buildClipboardTitle(item: RefineryItem): string {
  if (item.title?.trim()) return item.title.trim();
  if (item.kind === 'image') return '[Image/图片]';

  const source = (item.preview || item.content || '').replace(/\r/g, '');
  const firstMeaningfulLine = source
    .split('\n')
    .map((line) => line.trim())
    .find(Boolean);

  return firstMeaningfulLine || source.trim() || '[Empty]';
}

interface AppEntry {
  name: string;
  path: string;
  icon: string | null;
  usage_count: number;
}

const URL_REGEX = /^(https?:\/\/)?(([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}|localhost|(\d{1,3}\.){3}\d{1,3})(:\d+)?(\/.*)?$/;

function isValidUrl(str: string): boolean {
  if (str.includes(' ')) return false;
  if (str.length < 3) return false;
  return URL_REGEX.test(str);
}

function normalizeUrl(str: string): string {
  if (str.startsWith('http://') || str.startsWith('https://')) {
    return str;
  }
  return `https://${str}`;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

interface UrlHistoryRecord {
  url: string;
  title?: string;
  visit_count: number;
  last_visit: number;
}

interface ShellHistoryEntry {
  id: number;
  command: string;
  timestamp: number;
  execution_count: number;
}

const SEARCH_TEMPLATES: Record<string, { name: string; url: string; color: string }> = {
  google: { name: 'Google', url: 'https://www.google.com/search?q=%s', color: 'bg-blue-600' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=%s', color: 'bg-cyan-600' },
  baidu: { name: 'Baidu', url: 'https://www.baidu.com/s?wd=%s', color: 'bg-blue-700' },
  custom: { name: 'Custom', url: '', color: 'bg-purple-600' },
};

export function useSpotlightSearch(t: TFunction) {
  const { query, mode, searchScope } = useSpotlight();
  const { searchSettings, language } = useAppStore();
  const debouncedQuery = useDebounce(query, 100);

  const [results, setResults] = useState<SpotlightItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // --- 新增状态 ---
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const pageRef = useRef(page); // 使用 ref 避免依赖 page
  const requestSeqRef = useRef(0);

  // 同步 page 到 ref
  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  // 当搜索词变化时，重置页码和列表
  useEffect(() => {
    requestSeqRef.current += 1;
    setPage(1);
    setHasMore(true);
    setIsLoading(false);
    setResults([]); // 清空旧数据，避免闪烁
  }, [debouncedQuery, mode, searchScope]);

  const performSearch = useCallback(async (isLoadMore = false) => {
    const requestId = ++requestSeqRef.current;
    const isStale = () => requestId !== requestSeqRef.current;
    const currentPage = isLoadMore ? pageRef.current + 1 : 1;
    const q = debouncedQuery.trim();

    // 如果是剪贴板模式
    if (mode === 'clipboard') {
      setIsLoading(true);
      try {
        const data = await invoke<RefineryItem[]>(`${REFINERY_PLUGIN_PREFIX}get_refinery_history`, {
          page: currentPage,
          pageSize: 20,
          searchQuery: q || null,
          kindFilter: null,
          pinnedOnly: false,
          manualOnly: false,
          startDate: null,
          endDate: null
        });

        if (isStale()) return;

        const newItems: SpotlightItem[] = data.map(item => ({
          id: item.id,
          title: buildClipboardTitle(item),
          description: `${formatTimeAgo(item.createdAt, language)} • ${item.sourceApp || 'Unknown'} • ${item.sizeInfo}`,
          content: item.content || item.preview,
          type: 'clipboard',
          isImage: item.kind === 'image'
        }));

        setResults(prev => isLoadMore ? [...prev, ...newItems] : newItems);
        setPage(currentPage);
        setHasMore(data.length === 20);
        if (!isLoadMore) setSelectedIndex(0);
      } catch (e) {
        if (isStale()) return;
        console.error("Failed to load clipboard history", e);
        setResults([]);
      } finally {
        if (!isStale()) {
          setIsLoading(false);
        }
      }
      return;
    }

    // ... 以下是原有的 search 模式逻辑，保持不变 ...
    if (searchScope === 'math') {
      if (!q) {
        if (isStale()) return;
        setResults([]);
        return;
      }
      const mathResult = evaluateMath(q);
      if (isStale()) return;
      if (mathResult) {
        setResults([{
          id: 'math-result',
          title: mathResult,
          description: `${t('spotlight.mathResult')} (${q})`,
          content: mathResult,
          type: 'math',
          mathResult: mathResult
        }]);
        setSelectedIndex(0);
      } else {
        setResults([]);
      }
      setIsLoading(false);
      return;
    }

    if (searchScope === 'shell') {
      const currentShellItem: SpotlightItem = {
        id: 'shell-exec-current',
        title: q
          ? `${t('spotlight.executeCommand')}: ${q}`
          : t('spotlight.shellPlaceholder'),
        description: t('spotlight.runInTerminal'),
        content: q,
        type: 'shell',
        shellCmd: q,
        isExecutable: true,
        shellType: 'auto'
      };

      let shellResults: SpotlightItem[] = [currentShellItem];

      try {
        let historyEntries: ShellHistoryEntry[] = [];
        if (q === '') {
          historyEntries = await invoke<ShellHistoryEntry[]>('get_recent_shell_history', { limit: 10 });
        } else {
          historyEntries = await invoke<ShellHistoryEntry[]>('search_shell_history', { query: q, limit: 10 });
        }

        const historyItems: SpotlightItem[] = historyEntries.map(entry => ({
          id: `shell-history-${entry.id}`,
          title: entry.command,
          description: `History • Used ${entry.execution_count} times`,
          content: entry.command,
          type: 'shell_history',
          historyCommand: entry.command,
          isExecutable: false,
        }));

        shellResults = [...shellResults, ...historyItems];
      } catch (err) {
        console.error("Failed to load shell history:", err);
      }

      if (isStale()) return;
      setResults(shellResults);
      setSelectedIndex(0);
      setIsLoading(false);
      return;
    }

    if (searchScope === 'web') {
      if (!q) {
        if (isStale()) return;
        setResults([]);
        return;
      }

      const { defaultEngine, customUrl } = searchSettings;

      const baseOrder: ('google' | 'bing' | 'custom' | 'baidu')[] = ['google', 'bing', 'custom', 'baidu'];

      const sortedEngines = [
        defaultEngine,
        ...baseOrder.filter(e => e !== defaultEngine)
      ];

      const webItems: SpotlightItem[] = sortedEngines.map(key => {
        const config = SEARCH_TEMPLATES[key];
        const template = key === 'custom' ? customUrl : config.url;

        const finalUrl = template.includes('%s')
          ? template.replace('%s', encodeURIComponent(q))
          : `${template}${encodeURIComponent(q)}`;

        return {
          id: `web-search-${key}`,
          title: `Search ${config.name}: ${q}`,
          description: key === 'custom' ? `Custom: ${template.substring(0, 30)}...` : `Open in default browser`,
          content: q,
          type: 'web_search',
          url: finalUrl,
          icon: key
        };
      });

      if (isStale()) return;
      setResults(webItems);
      setSelectedIndex(0);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      let finalResults: SpotlightItem[] = [];
      const promises = [];

      if (searchScope === 'global' || searchScope === 'command' || searchScope === 'prompt') {
        const categoryFilter = searchScope === 'global' ? null : searchScope;
        promises.push(
          q ? invoke<Prompt[]>('search_prompts', {
            query: q,
            page: 1,
            pageSize: 10,
            category: categoryFilter
          }) : invoke<Prompt[]>('get_prompts', {
            page: 1,
            pageSize: 10,
            group: 'all',
            category: categoryFilter
          })
        );
      } else {
        promises.push(Promise.resolve([]));
      }

      if (searchScope === 'global') {
        promises.push(invoke<UrlHistoryRecord[]>('search_url_history', { query: q }));
      } else {
        promises.push(Promise.resolve([]));
      }

      if (searchScope === 'global' || searchScope === 'app') {
        promises.push(q ? invoke<AppEntry[]>('search_apps_in_db', { query: q }) : Promise.resolve([]));
      } else {
        promises.push(Promise.resolve([]));
      }

      const [promptsData, urlHistoryData, appsData] = await Promise.all(promises);
      if (isStale()) return;

      let dynamicUrlItem: SpotlightItem | null = null;
      if (searchScope === 'global' && isValidUrl(q)) {
        const url = normalizeUrl(q);
        const existsInHistory = (urlHistoryData as UrlHistoryRecord[]).some(h => normalizeUrl(h.url) === url);
        if (!existsInHistory) {
          dynamicUrlItem = {
            id: `dynamic-url-${q}`,
            title: `${t('spotlight.openLink')} ${q}`,
            description: "Open in default browser",
            content: url,
            type: 'url',
            url: url
          };
        }
      }

      const appItems: SpotlightItem[] = (appsData as AppEntry[]).map(app => ({
        id: `app-${app.path}`,
        title: app.name,
        description: t('spotlight.application'),
        content: app.path,
        type: 'app',
        appPath: app.path
      }));

      const historyItems: SpotlightItem[] = (urlHistoryData as UrlHistoryRecord[]).map(h => ({
        id: `history-${h.url}`,
        title: h.title && h.title.length > 0 ? h.title : h.url,
        description: h.title ? h.url : t('spotlight.visitedTimes', { count: h.visit_count }),
        content: h.url,
        type: 'url',
        url: h.url
      }));

      const promptItems: SpotlightItem[] = (promptsData as Prompt[]).map(p => ({
        id: p.id,
        title: p.title,
        description: p.description,
        content: p.content,
        type: p.type === 'command' ? 'command' : 'prompt',
        originalData: p,
        isExecutable: p.isExecutable,
        shellType: p.shellType
      }));

      if (searchScope === 'app') {
        finalResults = [...appItems];
      } else if (searchScope === 'command' || searchScope === 'prompt') {
        finalResults = [...promptItems];
      } else {
        if (dynamicUrlItem) finalResults.push(dynamicUrlItem);
        finalResults = [...finalResults, ...appItems, ...historyItems, ...promptItems];
      }

      if (isStale()) return;
      setResults(finalResults);
      setSelectedIndex(0);
    } catch (err) {
      if (isStale()) return;
      console.error("Search failed:", err);
      setResults([]);
    } finally {
      if (!isStale()) {
        setIsLoading(false);
      }
    }
  }, [debouncedQuery, mode, searchScope, searchSettings, language]);

  useEffect(() => {
    performSearch(false);
  }, [performSearch]);

  // --- 暴露 loadMore 函数 ---
  const loadMore = useCallback(() => {
    if (!isLoading && hasMore && mode === 'clipboard') {
      performSearch(true);
    }
  }, [isLoading, hasMore, mode, performSearch]);

  const handleNavigation = useCallback((e: KeyboardEvent) => {
    // 允许在 clipboard 模式下导航
    if (mode !== 'search' && mode !== 'clipboard') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => {
        const len = results.length || 1;
        return (prev + 1) % len;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => {
        const len = results.length || 1;
        return (prev - 1 + len) % len;
      });
    }
  }, [mode, results]);

  return {
    results,
    selectedIndex,
    isLoading,
    hasMore, // 暴露给 UI
    loadMore, // 暴露给 UI
    handleNavigation,
    setSelectedIndex
  };
}
