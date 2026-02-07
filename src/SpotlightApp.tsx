import { useEffect, useLayoutEffect, useState } from 'react';
import { getCurrentWebviewWindow, getAllWebviewWindows } from '@tauri-apps/api/webviewWindow';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { message } from '@tauri-apps/plugin-dialog';
import { open } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';
import { register, unregisterAll } from '@tauri-apps/plugin-global-shortcut';

import { useAppStore, AppTheme } from '@/store/useAppStore';
import { useContextStore } from '@/store/useContextStore';
import { usePromptStore } from '@/store/usePromptStore';
import { getText } from '@/lib/i18n';
import { parseVariables } from '@/lib/template';
import { executeCommand } from '@/lib/command_executor';
import { GlobalConfirmDialog } from "@/components/ui/GlobalConfirmDialog";

import { SpotlightProvider, useSpotlight } from '@/components/features/spotlight/core/SpotlightContext';
import { SpotlightLayout } from '@/components/features/spotlight/core/SpotlightLayout';
import { SearchBar } from '@/components/features/spotlight/core/SearchBar';

import { useSpotlightSearch } from '@/components/features/spotlight/hooks/useSpotlightSearch';
import { useSpotlightChat } from '@/components/features/spotlight/hooks/useSpotlightChat';
import { SearchMode } from '@/components/features/spotlight/modes/search/SearchMode';
import { ChatMode } from '@/components/features/spotlight/modes/chat/ChatMode';
import { SpotlightItem } from '@/types/spotlight';
import { ShellType } from '@/types/prompt';

const appWindow = getCurrentWebviewWindow();

function SpotlightContent() {
  const {
    mode, toggleMode, focusInput, inputRef,
    query, setQuery,
    chatInput, setChatInput,
    searchScope, setSearchScope,
    activeTemplate, setActiveTemplate,
    setMode
  } = useSpotlight();
  const { language, spotlightAppearance } = useAppStore();
  const { projectRoot } = useContextStore();

  const search = useSpotlightSearch(language);
  const chat = useSpotlightChat();

  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const unlisten = appWindow.onFocusChanged(({ payload: isFocused }) => {
      if (isFocused) {
        focusInput();
      }
    });
    return () => { unlisten.then(f => f()); };
  }, [focusInput]);

  useLayoutEffect(() => {
    const { width, defaultHeight, maxChatHeight } = spotlightAppearance;
    const safeMaxChatHeight = Math.max(maxChatHeight, defaultHeight);
    let finalHeight = defaultHeight;
    if (mode === 'search') {
      finalHeight = defaultHeight;
    } else {
      if (chat.messages.length > 0) {
        finalHeight = safeMaxChatHeight;
      } else {
        finalHeight = defaultHeight;
      }
    }

    appWindow.setSize(new LogicalSize(width, finalHeight));
  }, [mode, chat.messages.length, spotlightAppearance]);

  const handleItemSelect = async (item: SpotlightItem) => {
    if (!item) return;

    // 1. 处理剪贴板粘贴
    if (item.type === 'clipboard') {
        try {
            await invoke('spotlight_paste', { itemId: item.id });
            setQuery('');
            // 注意：不需要手动 hide，因为 rust 端已经 hide 了
        } catch (e) {
            console.error("Paste failed", e);
        }
        return;
    }

    if (item.type === 'shell_history') {
      const command = item.historyCommand?.trim() || '';
      if (command) {
        setSearchScope('shell');
        setQuery(command);

        setTimeout(() => {
          const input = inputRef.current;
          if (input) {
            input.focus();
            const pos = command.length;
            input.setSelectionRange(pos, pos);
          }
        }, 0);

        search.setSelectedIndex(0);
      }
      return;
    }

    if (item.type === 'app' && item.appPath) {
        try {
            await invoke('open_app', { path: item.appPath });
            await appWindow.hide();
            setQuery('');
        } catch (e) {
            await message(getText('common', 'failedToLaunch', language, { error: String(e) }), { kind: 'error' });
        }
        return;
    }

    if (item.type === 'url' && item.url) {
        try {
            await open(item.url);
            invoke('record_url_visit', { url: item.url }).catch(() => {});
            await appWindow.hide();
            setQuery('');
        } catch (e) {
            await message(getText('common', 'failedToOpenUrl', language, { error: String(e) }), { kind: 'error' });
        }
        return;
    }

    if (item.type === 'web_search' && item.url) {
        try {
            await open(item.url);
            invoke('record_url_visit', { url: item.url }).catch(() => {});
            await appWindow.hide();
            setQuery('');
        } catch (e) {
        }
        return;
    }

    if (item.isExecutable || item.type === 'shell') {
      const content = item.content || '';
      const vars = parseVariables(content);
      if (vars.length > 0) {
        await message(getText('spotlight', 'commandHasVariables', language), {
          title: getText('spotlight', 'actionRequired', language),
          kind: 'info'
        });
        return;
      }

      const executionTask = executeCommand(content, (item.shellType as ShellType) || 'auto', projectRoot);

      let recordTask: Promise<void> | null = null;
      if (item.type === 'shell') {
        recordTask = invoke<void>('record_shell_command', { command: content });
      }

      if (recordTask) {
        await Promise.all([executionTask, recordTask]);
      } else {
        await executionTask;
      }

      await appWindow.hide();
      setQuery('');
    } else {
      try {
        await writeText(item.content || '');
        setCopiedId(item.id);

        setTimeout(async () => {
          await appWindow.hide();
          setCopiedId(null);
          if (item.type === 'math') {
            setQuery('');
          }
        }, 300);
      } catch (err) {
      }
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = async (e: KeyboardEvent) => {
      if (e.isComposing) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        return;
      }

      if (e.key === 'Tab') {
        e.preventDefault();
        toggleMode();
        return;
      }

      const isModifierPressed = navigator.platform.includes('Mac') ? e.metaKey : e.altKey;

      // Alt + 1/2/3 切换模式
      if (isModifierPressed) {
        if (e.key === '1') {
          e.preventDefault();
          setMode('search');
          return;
        }
        if (e.key === '2') {
          e.preventDefault();
          setMode('chat');
          return;
        }
        if (e.key === '3') {
          e.preventDefault();
          setMode('clipboard');
          return;
        }
      }

      if (e.key === 'Escape') {
        e.preventDefault();

        // 修改处：将 clipboard 模式也纳入 query 的处理逻辑
        if (mode === 'search' || mode === 'clipboard') {
            if (query.length > 0) {
                setQuery(''); // 有内容先清空
                return;
            }
            // 仅在 search 模式下重置 scope（剪贴板模式不需要这个逻辑）
            if (mode === 'search' && searchScope !== 'global') {
                setSearchScope('global');
                return;
            }
        } else {
            // Chat 模式处理 chatInput
            if (chatInput.length > 0) {
                setChatInput('');
                return;
            }
            if (activeTemplate) {
                setActiveTemplate(null);
                return;
            }
        }

        await appWindow.hide();
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (mode === 'chat' && !chat.isStreaming) {
          chat.clearChat();
        }
        return;
      }

      if (mode === 'search' || mode === 'clipboard') { // 允许 clipboard 模式导航
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            search.handleNavigation(e);
            return;
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          const item = search.results[search.selectedIndex];
          if (item) handleItemSelect(item);
        }
      } else {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          chat.sendMessage();
        }
      }
    };

    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    mode,
    query, chatInput, searchScope, activeTemplate,
    search.results,
    search.selectedIndex,
    chat.isStreaming,
    chat.sendMessage,
    toggleMode,
    setMode
  ]);

  return (
    <SpotlightLayout
      header={<SearchBar />}
      resultCount={search.results.length}
      isStreaming={chat.isStreaming}
    >
      {/* 渲染判断：剪贴板模式也复用 SearchMode 组件 */}
      {(mode === 'search' || mode === 'clipboard') ? (
        <SearchMode
          results={search.results}
          selectedIndex={search.selectedIndex}
          setSelectedIndex={search.setSelectedIndex}
          onSelect={handleItemSelect}
          copiedId={copiedId}
          // --- 传递新增的属性 ---
          hasMore={search.hasMore}
          loadMore={search.loadMore}
          isLoading={search.isLoading}
        />
      ) : (
        <ChatMode
          messages={chat.messages}
          isStreaming={chat.isStreaming}
          chatEndRef={chat.chatEndRef}
        />
      )}
    </SpotlightLayout>
  );
}

export default function SpotlightApp() {
  const { setTheme, theme, spotlightShortcut } = useAppStore();
  const { fetchChatTemplates } = usePromptStore();

  useEffect(() => {
    if (appWindow.label !== 'spotlight') return;

    const setupShortcut = async () => {
      try {
        await unregisterAll();
        if (!spotlightShortcut) return;
        await register(spotlightShortcut, async (event) => {
          if (event.state === 'Pressed') {
            const windows = await getAllWebviewWindows();
            const spotlight = windows.find(w => w.label === 'spotlight');
            if (spotlight) {
              const isVisible = await spotlight.isVisible();
              if (isVisible) {
                await spotlight.hide();
              } else {
                await spotlight.show();
                await spotlight.setFocus();
              }
            }
          }
        });
      } catch (err) {
      }
    };

    setupShortcut();
  }, [spotlightShortcut]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark', 'black');
    if (theme === 'black') {
      root.classList.add('dark', 'black');
    } else {
      root.classList.add(theme);
    }

    const unlistenPromise = appWindow.onFocusChanged(async ({ payload: isFocused }) => {
      if (isFocused) {
        await useAppStore.persist.rehydrate();
        await useContextStore.persist.rehydrate();
        fetchChatTemplates();
        appWindow.setFocus();
      }
    });

    const themeUnlisten = listen<AppTheme>('theme-changed', (event) => {
        setTheme(event.payload, true);
    });

    return () => {
        unlistenPromise.then(f => f());
        themeUnlisten.then(f => f());
    };
  }, [theme]);

  return (
    <div className="spotlight-window h-full">
      <SpotlightProvider>
        <SpotlightContent />
      </SpotlightProvider>
      <GlobalConfirmDialog />
    </div>
  );
}
