import type React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SpotlightApp from '@/windows/spotlight/SpotlightWindowApp';

const {
  appState,
  appWindowMock,
  LogicalSizeMock,
  setSpotlightAppearanceMock,
  spotlightState,
  searchState,
  chatState,
} = vi.hoisted(() => {
  class LogicalSizeMock {
    width: number;
    height: number;

    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
  }

  const state = {
    theme: 'dark',
    spotlightAppearance: {
      width: 640,
      defaultHeight: 400,
      maxChatHeight: 600,
    },
  };

  const setAppearance = vi.fn((nextAppearance: typeof state.spotlightAppearance) => {
    state.spotlightAppearance = nextAppearance;
  });

  return {
    LogicalSizeMock,
    appState: state,
    setSpotlightAppearanceMock: setAppearance,
    appWindowMock: {
      setSize: vi.fn(),
      onFocusChanged: vi.fn().mockResolvedValue(vi.fn()),
      setFocus: vi.fn().mockResolvedValue(undefined),
      hide: vi.fn().mockResolvedValue(undefined),
    },
    spotlightState: {
      mode: 'search',
      toggleMode: vi.fn(),
      focusInput: vi.fn(),
      inputRef: { current: null as HTMLInputElement | null },
      query: '',
      setQuery: vi.fn(),
      chatInput: '',
      setChatInput: vi.fn(),
      searchScope: 'global',
      setSearchScope: vi.fn(),
      activeTemplate: null,
      setActiveTemplate: vi.fn(),
      attachments: [] as unknown[],
      clearAttachments: vi.fn(),
      setMode: vi.fn(),
    },
    searchState: {
      results: [],
      selectedIndex: 0,
      isLoading: false,
      hasMore: false,
      loadMore: vi.fn(),
      handleNavigation: vi.fn(),
      setSelectedIndex: vi.fn(),
    },
    chatState: {
      messages: [] as unknown[],
      isStreaming: false,
      sendMessage: vi.fn(),
      clearChat: vi.fn(),
      chatEndRef: { current: null },
      containerRef: { current: null },
      setIsUserAtBottom: vi.fn(),
    },
  };
});

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tauri-apps/api/dpi', () => ({
  LogicalSize: LogicalSizeMock,
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => appWindowMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  message: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (state: typeof appState & { setSpotlightAppearance: typeof setSpotlightAppearanceMock }) => unknown) =>
    selector({
      ...appState,
      setSpotlightAppearance: setSpotlightAppearanceMock,
    }),
}));

vi.mock('@/store/useContextStore', () => ({
  useContextStore: () => ({
    projectRoot: null,
  }),
}));

vi.mock('@/store/usePromptStore', () => ({
  usePromptStore: (selector: (state: { fetchChatTemplates: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({
      fetchChatTemplates: vi.fn().mockResolvedValue(undefined),
    }),
}));

vi.mock('@/store/useExecStore', () => ({
  useExecStore: (selector: (state: { initListeners: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({
      initListeners: vi.fn().mockResolvedValue(undefined),
    }),
}));

vi.mock('@/lib/hooks/useCrossWindowAppStoreSync', () => ({
  useCrossWindowAppStoreSync: vi.fn(),
}));

vi.mock('@/lib/theme', () => ({
  applyThemeToDocument: vi.fn(),
}));

vi.mock('@/lib/template', () => ({
  parseVariables: vi.fn(() => []),
}));

vi.mock('@/lib/command_executor', () => ({
  executeCommand: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/components/ui/GlobalConfirmDialog', () => ({
  GlobalConfirmDialog: () => null,
}));

vi.mock('@/components/features/spotlight/exec/ExecApprovalSheet', () => ({
  ExecApprovalSheet: () => null,
}));

vi.mock('@/components/features/spotlight/core/SpotlightContext', () => ({
  SpotlightProvider: ({ children }: { children: React.ReactNode }) => children,
  useSpotlight: () => spotlightState,
}));

vi.mock('@/components/features/spotlight/core/SearchBar', () => ({
  SearchBar: ({ isResizeMode = false }: { isResizeMode?: boolean }) => (
    <div data-testid="search-bar" data-resize-mode={String(isResizeMode)} />
  ),
}));

vi.mock('@/components/features/spotlight/core/SpotlightLayout', () => ({
  SpotlightLayout: ({
    header,
    children,
    footerStatusAddon,
    footerActions,
    overlay,
  }: {
    header: React.ReactNode;
    children: React.ReactNode;
    footerStatusAddon?: React.ReactNode;
    footerActions?: React.ReactNode;
    overlay?: React.ReactNode;
  }) => (
    <div>
      {header}
      <div data-testid="footer-status">{footerStatusAddon}</div>
      <div data-testid="footer-actions">{footerActions}</div>
      {children}
      {overlay}
    </div>
  ),
}));

vi.mock('@/components/features/spotlight/hooks/useSpotlightSearch', () => ({
  useSpotlightSearch: () => searchState,
}));

vi.mock('@/components/features/spotlight/hooks/useSpotlightChat', () => ({
  useSpotlightChat: () => chatState,
}));

vi.mock('@/components/features/spotlight/modes/search/SearchMode', () => ({
  SearchMode: () => <div data-testid="search-mode" />,
}));

vi.mock('@/components/features/spotlight/modes/chat/ChatMode', () => ({
  ChatMode: () => <div data-testid="chat-mode" />,
}));

describe('SpotlightApp resize mode', () => {
  beforeEach(() => {
    appState.theme = 'dark';
    appState.spotlightAppearance = {
      width: 640,
      defaultHeight: 400,
      maxChatHeight: 600,
    };
    setSpotlightAppearanceMock.mockClear();
    appWindowMock.setSize.mockClear();
    appWindowMock.onFocusChanged.mockClear();
    appWindowMock.setFocus.mockClear();
    appWindowMock.hide.mockClear();
    spotlightState.focusInput.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('previews resize changes and saves them with Enter', async () => {
    render(<SpotlightApp />);

    await waitFor(() => {
      expect(appWindowMock.setSize).toHaveBeenCalled();
    });

    fireEvent.keyDown(document, { key: 'F8' });
    expect(screen.getByTestId('search-bar').getAttribute('data-resize-mode')).toBe('true');
    expect(screen.getAllByText('spotlight.resizeModeActive')).toHaveLength(2);

    fireEvent.keyDown(document, { key: 'ArrowRight' });
    fireEvent.keyDown(document, { key: 'ArrowDown', shiftKey: true });

    await waitFor(() => {
      const lastSize = appWindowMock.setSize.mock.calls.at(-1)?.[0];
      expect(lastSize.width).toBe(660);
      expect(lastSize.height).toBe(460);
    });

    fireEvent.keyDown(document, { key: 'Enter' });

    expect(setSpotlightAppearanceMock).toHaveBeenCalledWith({
      width: 660,
      defaultHeight: 460,
      maxChatHeight: 600,
    });
    expect(screen.getByTestId('search-bar').getAttribute('data-resize-mode')).toBe('false');
  });

  it('cancels draft resize changes with Escape', async () => {
    render(<SpotlightApp />);

    await waitFor(() => {
      expect(appWindowMock.setSize).toHaveBeenCalled();
    });

    fireEvent.keyDown(document, { key: 'F8' });
    fireEvent.keyDown(document, { key: 'ArrowLeft' });

    await waitFor(() => {
      const previewSize = appWindowMock.setSize.mock.calls.at(-1)?.[0];
      expect(previewSize.width).toBe(620);
      expect(previewSize.height).toBe(400);
    });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(setSpotlightAppearanceMock).not.toHaveBeenCalled();
    await waitFor(() => {
      const revertedSize = appWindowMock.setSize.mock.calls.at(-1)?.[0];
      expect(revertedSize.width).toBe(640);
      expect(revertedSize.height).toBe(400);
    });
  });
});
