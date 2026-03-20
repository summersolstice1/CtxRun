import { useEffect, useLayoutEffect, useState } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { listen } from '@tauri-apps/api/event';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { message } from '@tauri-apps/plugin-dialog';
import { open } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';

import { useAppStore, AppTheme } from '@/store/useAppStore';
import { useContextStore } from '@/store/useContextStore';
import { usePromptStore } from '@/store/usePromptStore';
import { useTranslation } from 'react-i18next';
import { parseVariables } from '@/lib/template';
import { executeCommand } from '@/lib/command_executor';
import { GlobalConfirmDialog } from "@/components/ui/GlobalConfirmDialog";
import { ExecApprovalSheet } from '@/components/features/spotlight/exec/ExecApprovalSheet';
import { useExecStore } from '@/store/useExecStore';

import { SpotlightProvider, useSpotlight } from '@/components/features/spotlight/core/SpotlightContext';
import { SpotlightLayout } from '@/components/features/spotlight/core/SpotlightLayout';
import { SearchBar } from '@/components/features/spotlight/core/SearchBar';

import { useSpotlightSearch } from '@/components/features/spotlight/hooks/useSpotlightSearch';
import { useSpotlightChat } from '@/components/features/spotlight/hooks/useSpotlightChat';
import { SearchMode } from '@/components/features/spotlight/modes/search/SearchMode';
import { ChatMode } from '@/components/features/spotlight/modes/chat/ChatMode';
import { SpotlightItem } from '@/types/spotlight';
import { ShellType } from '@/types/prompt';
import { applyThemeToDocument } from '@/lib/theme';

const appWindow = getCurrentWebviewWindow();
const REFINERY_PLUGIN_PREFIX = 'plugin:ctxrun-plugin-refinery|';

function SpotlightContent() {
  const {
    mode, toggleMode, focusInput, inputRef,
    query, setQuery,
    chatInput, setChatInput,
    searchScope, setSearchScope,
    activeTemplate, setActiveTemplate,
    attachments, clearAttachments,
    setMode
  } = useSpotlight();
  const spotlightAppearance = useAppStore((state) => state.spotlightAppearance);
  const projectRoot = useContextStore((state) => state.projectRoot);
  const { t } = useTranslation();

  const search = useSpotlightSearch(t);
  const chat = useSpotlightChat();
  const initExecListeners = useExecStore((state) => state.initListeners);

  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    void initExecListeners();
  }, [initExecListeners]);

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

    if (item.type === 'clipboard') {
        try {
            await invoke(`${REFINERY_PLUGIN_PREFIX}spotlight_paste`, { itemId: item.id });
            setQuery('');
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
            await message(t('common.failedToLaunch', { error: String(e) }), { kind: 'error' });
        }
        return;
    }

    if (item.type === 'url' && item.url) {
        try {
            await open(item.url);
            void invoke('record_url_visit', { url: item.url }).catch((err) => {
              console.error('Failed to record URL visit:', err);
            });
            await appWindow.hide();
            setQuery('');
        } catch (e) {
            await message(t('common.failedToOpenUrl', { error: String(e) }), { kind: 'error' });
        }
        return;
    }

    if (item.type === 'web_search' && item.url) {
        try {
            await open(item.url);
            void invoke('record_url_visit', { url: item.url }).catch((err) => {
              console.error('Failed to record web search visit:', err);
            });
            await appWindow.hide();
            setQuery('');
        } catch (e) {
            console.error('Failed to open web search URL:', e);
        }
        return;
    }

    if (item.isExecutable || item.type === 'shell') {
      const content = item.content || '';
      const vars = parseVariables(content);
      if (vars.length > 0) {
        await message(t('spotlight.commandHasVariables'), {
          title: t('spotlight.actionRequired'),
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
        console.error('Failed to copy spotlight item:', err);
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

        if (mode === 'search' || mode === 'clipboard') {
            if (query.length > 0) {
                setQuery('');
                return;
            }
            if (mode === 'search' && searchScope !== 'global') {
                setSearchScope('global');
                return;
            }
        } else {
            if (chatInput.length > 0) {
                setChatInput('');
                return;
            }
            if (attachments.length > 0) {
                clearAttachments();
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
    query, chatInput, searchScope, activeTemplate, attachments.length,
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
      {(mode === 'search' || mode === 'clipboard') ? (
        <SearchMode
          results={search.results}
          selectedIndex={search.selectedIndex}
          setSelectedIndex={search.setSelectedIndex}
          onSelect={handleItemSelect}
          copiedId={copiedId}
          hasMore={search.hasMore}
          loadMore={search.loadMore}
          isLoading={search.isLoading}
        />
      ) : (
        <ChatMode
          messages={chat.messages}
          isStreaming={chat.isStreaming}
          chatEndRef={chat.chatEndRef}
          containerRef={chat.containerRef}
          onScrollPositionChange={chat.setIsUserAtBottom}
        />
      )}
    </SpotlightLayout>
  );
}

export default function SpotlightApp() {
  const initialTheme = useAppStore((state) => state.theme);
  const [theme, setTheme] = useState<AppTheme>(initialTheme);
  const fetchChatTemplates = usePromptStore((state) => state.fetchChatTemplates);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    const unlistenPromise = appWindow.onFocusChanged(async ({ payload: isFocused }) => {
      if (isFocused) {
        try {
          await useAppStore.persist.rehydrate();
          await useContextStore.persist.rehydrate();
          await fetchChatTemplates();
          setTheme(useAppStore.getState().theme);
          await appWindow.setFocus();
        } catch (err) {
          console.error('Failed to rehydrate spotlight state on focus:', err);
        }
      }
    });

    const themeUnlisten = listen<AppTheme>('theme-changed', (event) => {
        setTheme(event.payload);
    });

    return () => {
        unlistenPromise.then(f => f());
        themeUnlisten.then(f => f());
    };
  }, [fetchChatTemplates, setTheme]);

  return (
    <div className="spotlight-window h-full">
      <SpotlightProvider>
        <SpotlightContent />
      </SpotlightProvider>
      <GlobalConfirmDialog />
      <ExecApprovalSheet />
    </div>
  );
}
