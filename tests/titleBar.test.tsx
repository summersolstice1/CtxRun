import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TitleBar } from '@/components/layout/TitleBar';

const {
  invokeMock,
  useAppStoreMock,
  storeState,
  appWindowMock,
} = vi.hoisted(() => {
  const state = {
    language: 'zh',
    windowDestroyDelay: 60,
    currentView: 'prompts',
    setView: vi.fn(),
  };

  return {
    invokeMock: vi.fn(),
    storeState: state,
    useAppStoreMock: vi.fn(() => state),
    appWindowMock: {
      isMaximized: vi.fn().mockResolvedValue(false),
      onResized: vi.fn().mockResolvedValue(vi.fn()),
      toggleMaximize: vi.fn().mockResolvedValue(undefined),
      minimize: vi.fn(),
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

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => appWindowMock,
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: useAppStoreMock,
}));

vi.mock('@/components/ui/ClockPopover', () => ({
  ClockPopover: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div>clock-popover</div> : null),
}));

vi.mock('@/components/layout/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher" />,
}));

vi.mock('@/components/layout/ViewSwitcher', () => ({
  ViewSwitcher: ({
    activeView,
    enableHoldShortcut,
  }: {
    activeView: string;
    enableHoldShortcut?: boolean;
  }) => (
    <div
      data-testid="view-switcher"
      data-active-view={activeView}
      data-enable-hold-shortcut={String(Boolean(enableHoldShortcut))}
    />
  ),
}));

describe('TitleBar', () => {
  beforeEach(() => {
    storeState.language = 'zh';
    storeState.windowDestroyDelay = 60;
    storeState.currentView = 'prompts';
    storeState.setView.mockClear();
    invokeMock.mockReset().mockResolvedValue(undefined);
    appWindowMock.isMaximized.mockReset().mockResolvedValue(false);
    appWindowMock.onResized.mockReset().mockResolvedValue(vi.fn());
    appWindowMock.toggleMaximize.mockReset().mockResolvedValue(undefined);
    appWindowMock.minimize.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('opens settings from a primary view and enables hold shortcut', () => {
    render(<TitleBar />);

    expect(screen.getByTestId('view-switcher').getAttribute('data-active-view')).toBe('prompts');
    expect(screen.getByTestId('view-switcher').getAttribute('data-enable-hold-shortcut')).toBe('true');

    fireEvent.click(screen.getByTitle('topbar.openSettings'));
    expect(storeState.setView).toHaveBeenCalledWith('settings');
  });

  it('returns from settings to the last primary view and disables hold shortcut', () => {
    const { rerender } = render(<TitleBar />);

    storeState.currentView = 'patch';
    rerender(<TitleBar />);

    storeState.currentView = 'settings';
    rerender(<TitleBar />);

    expect(screen.getByTestId('view-switcher').getAttribute('data-active-view')).toBe('patch');
    expect(screen.getByTestId('view-switcher').getAttribute('data-enable-hold-shortcut')).toBe('false');

    fireEvent.click(screen.getByTitle('topbar.backToModule'));
    expect(storeState.setView).toHaveBeenCalledWith('patch');
  });

  it('forwards window control actions', async () => {
    render(<TitleBar />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);
    expect(appWindowMock.minimize).toHaveBeenCalled();

    fireEvent.click(buttons[2]);
    await waitFor(() => {
      expect(appWindowMock.toggleMaximize).toHaveBeenCalled();
      expect(appWindowMock.isMaximized).toHaveBeenCalled();
    });

    fireEvent.click(buttons[3]);
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('hide_main_window', { delaySecs: 60 });
    });
  });
});
