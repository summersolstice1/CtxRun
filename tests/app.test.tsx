import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '@/App';

const {
  useAppStoreMock,
  storeState,
  appWindowMock,
  listenMock,
  applyThemeToDocumentMock,
} = vi.hoisted(() => {
  const state = {
    currentView: 'prompts',
    theme: 'dark',
    setTheme: vi.fn(),
    syncModels: vi.fn().mockResolvedValue(undefined),
    lastUpdated: Date.now(),
  };

  return {
    storeState: state,
    useAppStoreMock: vi.fn((selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
    ),
    appWindowMock: {
      show: vi.fn(),
      setFocus: vi.fn(),
    },
    listenMock: vi.fn().mockResolvedValue(vi.fn()),
    applyThemeToDocumentMock: vi.fn(),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tauri-apps/api/webviewWindow', () => ({
  getCurrentWebviewWindow: () => appWindowMock,
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: listenMock,
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: useAppStoreMock,
}));

vi.mock('@/lib/theme', () => ({
  applyThemeToDocument: applyThemeToDocumentMock,
}));

vi.mock('@/components/layout/TitleBar', () => ({
  TitleBar: () => <div>title-bar</div>,
}));

vi.mock('@/components/ui/GlobalConfirmDialog', () => ({
  GlobalConfirmDialog: () => <div>confirm-dialog</div>,
}));

vi.mock('@/components/features/hyperview', () => ({
  PreviewModal: () => <div>preview-modal</div>,
}));

vi.mock('@/components/features/prompts/PromptView', () => ({
  PromptView: () => <div>prompt-view</div>,
}));

vi.mock('@/components/features/context/ContextView', () => ({
  ContextView: () => <div>context-view</div>,
}));

vi.mock('@/components/features/patch/PatchView', () => ({
  PatchView: () => <div>patch-view</div>,
}));

vi.mock('@/components/features/refinery/RefineryView', () => ({
  RefineryView: () => <div>refinery-view</div>,
}));

vi.mock('@/components/features/automator/AutomatorView', () => ({
  AutomatorView: () => <div>automator-view</div>,
}));

vi.mock('@/components/features/miner/MinerView', () => ({
  MinerView: () => <div>miner-view</div>,
}));

vi.mock('@/components/settings/SettingsView', () => ({
  SettingsView: () => <div>settings-view</div>,
}));

vi.mock('@/components/features/monitor/SystemMonitorModal', () => ({
  SystemMonitorModal: () => <div>system-monitor-modal</div>,
}));

describe('App', () => {
  beforeEach(() => {
    storeState.currentView = 'prompts';
    storeState.theme = 'dark';
    storeState.setTheme.mockClear();
    storeState.syncModels.mockClear();
    storeState.lastUpdated = Date.now();
    appWindowMock.show.mockReset();
    appWindowMock.setFocus.mockReset();
    listenMock.mockReset().mockResolvedValue(vi.fn());
    applyThemeToDocumentMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    ['prompts', 'prompt-view'],
    ['context', 'context-view'],
    ['patch', 'patch-view'],
    ['refinery', 'refinery-view'],
    ['automator', 'automator-view'],
    ['miner', 'miner-view'],
    ['settings', 'settings-view'],
  ])('renders the %s module', async (view, marker) => {
    storeState.currentView = view;
    render(<App />);

    expect(await screen.findByText(marker)).toBeTruthy();
    expect(screen.getByText('title-bar')).toBeTruthy();
    expect(screen.getByText('preview-modal')).toBeTruthy();
    expect(screen.getByText('confirm-dialog')).toBeTruthy();
    expect(screen.getByText('system-monitor-modal')).toBeTruthy();
  });

  it('applies theme, shows the window, and refreshes stale models', async () => {
    storeState.currentView = 'prompts';
    storeState.lastUpdated = 0;
    render(<App />);

    await waitFor(() => {
      expect(applyThemeToDocumentMock).toHaveBeenCalledWith('dark');
      expect(appWindowMock.show).toHaveBeenCalled();
      expect(appWindowMock.setFocus).toHaveBeenCalled();
      expect(storeState.syncModels).toHaveBeenCalled();
    });
  });
});
