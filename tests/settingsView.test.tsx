import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsView } from '@/components/settings/SettingsView';

const { invokeMock, useAppStoreMock, appStoreState } = vi.hoisted(() => {
  const state = {
    theme: 'dark',
    setTheme: vi.fn(),
    language: 'zh',
    setLanguage: vi.fn(),
    globalIgnore: { dirs: [], files: [], extensions: [] },
    updateGlobalIgnore: vi.fn(),
    aiConfig: {
      providerId: 'openai',
      apiKey: '',
      baseUrl: '',
      modelId: 'gpt-4o-mini',
      temperature: 0.7,
    },
    setAIConfig: vi.fn(),
    savedProviderSettings: {
      openai: { apiKey: '', baseUrl: '', modelId: 'gpt-4o-mini', temperature: 0.7 },
    },
    renameAIProvider: vi.fn(),
    spotlightShortcut: 'Alt+S',
    setSpotlightShortcut: vi.fn(),
    automatorShortcut: 'Alt+F1',
    setAutomatorShortcut: vi.fn(),
    restReminder: { enabled: false, intervalMinutes: 45 },
    setRestReminder: vi.fn(),
    windowDestroyDelay: 0,
    setWindowDestroyDelay: vi.fn(),
    spotlightAppearance: { width: 640, defaultHeight: 400, maxChatHeight: 600 },
    setSpotlightAppearance: vi.fn(),
    searchSettings: { defaultEngine: 'google', customUrl: 'https://example.com?q=%s' },
    setSearchSettings: vi.fn(),
    refinerySettings: {
      enabled: false,
      strategy: 'count',
      days: 30,
      maxCount: 1000,
      keepPinned: true,
    },
    setRefinerySettings: vi.fn(),
  };

  return {
    invokeMock: vi.fn().mockResolvedValue(undefined),
    appStoreState: state,
    useAppStoreMock: vi.fn((selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
    ),
  };
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: useAppStoreMock,
}));

vi.mock('@/components/settings/PromptLibraryManager', () => ({
  PromptLibraryManager: () => <div>library-section</div>,
}));

vi.mock('@/components/settings/AboutSection', () => ({
  AboutSection: () => <div>about-section</div>,
}));

vi.mock('@/components/settings/sections/GeneralSection', () => ({
  GeneralSection: () => <div>general-section</div>,
}));

vi.mock('@/components/settings/sections/SearchWorkspaceSection', () => ({
  SearchWorkspaceSection: () => <div>search-workspace-section</div>,
}));

vi.mock('@/components/settings/sections/AISection', () => ({
  AISection: () => <div>ai-section</div>,
}));

vi.mock('@/components/settings/sections/DataMaintenanceSection', () => ({
  DataMaintenanceSection: () => <div>data-maintenance-section</div>,
}));

vi.mock('@/components/settings/sections/SecuritySection', () => ({
  SecuritySection: () => <div>security-section</div>,
}));

describe('SettingsView', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders grouped navigation and default section', async () => {
    render(<SettingsView />);

    expect(screen.getByText('settings.groupCore')).toBeTruthy();
    expect(screen.getByText('settings.groupContent')).toBeTruthy();
    expect(screen.getByText('settings.groupTrust')).toBeTruthy();
    expect(screen.getByText('general-section')).toBeTruthy();

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith('plugin:ctxrun-plugin-refinery|update_cleanup_config', {
        config: appStoreState.refinerySettings,
      }),
    );
  });

  it('switches sections when nav button is clicked', async () => {
    render(<SettingsView />);

    fireEvent.click(screen.getByTestId('settings-nav-ai'));
    await waitFor(() => expect(screen.getByText('ai-section')).toBeTruthy());

    fireEvent.click(screen.getByTestId('settings-nav-about'));
    await waitFor(() => expect(screen.getByText('about-section')).toBeTruthy());
  });
});
