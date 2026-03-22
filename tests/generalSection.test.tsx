import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeneralSection } from '@/components/settings/sections/GeneralSection';

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('GeneralSection', () => {
  const props = {
    theme: 'dark' as const,
    setTheme: vi.fn(),
    language: 'zh' as const,
    setLanguage: vi.fn(),
    spotlightShortcut: 'Alt+S',
    setSpotlightShortcut: vi.fn(),
    automatorShortcut: 'Alt+F1',
    setAutomatorShortcut: vi.fn(),
    spotlightAppearance: { width: 640, defaultHeight: 400, maxChatHeight: 600 },
    setSpotlightAppearance: vi.fn(),
    windowDestroyDelay: 0,
    setWindowDestroyDelay: vi.fn(),
    formatDuration: vi.fn(() => 'Never'),
  };

  beforeEach(() => {
    Object.values(props).forEach((value) => {
      if (typeof value === 'function' && 'mockClear' in value) {
        value.mockClear();
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('updates appearance, language, and layout controls', () => {
    render(<GeneralSection {...props} />);

    fireEvent.click(screen.getByText('settings.themeLight').closest('button')!);
    expect(props.setTheme).toHaveBeenCalledWith('light');

    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[0], { target: { value: '700' } });
    expect(props.setSpotlightAppearance).toHaveBeenCalledWith({ width: 700 });

    fireEvent.change(sliders[3], { target: { value: '120' } });
    expect(props.setWindowDestroyDelay).toHaveBeenCalledWith(120);

    fireEvent.click(screen.getByText('settings.langEn').closest('button')!);
    expect(props.setLanguage).toHaveBeenCalledWith('en');
  });

  it('records spotlight shortcuts through ShortcutInput', async () => {
    render(<GeneralSection {...props} />);

    fireEvent.click(screen.getByText('Alt+S'));
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(props.setSpotlightShortcut).toHaveBeenCalledWith('Ctrl+Shift+K');
    });
  });

  it('supports black theme and layout sliders', () => {
    render(
      <GeneralSection
        {...props}
        theme="black"
        language="en"
        spotlightAppearance={{ width: 700, defaultHeight: 420, maxChatHeight: 650 }}
        windowDestroyDelay={90}
      />
    );

    fireEvent.click(screen.getByText('settings.themeDark').closest('button')!);
    expect(props.setTheme).toHaveBeenCalledWith('dark');

    fireEvent.click(screen.getByText('settings.langZh').closest('button')!);
    expect(props.setLanguage).toHaveBeenCalledWith('zh');

    const sliders = screen.getAllByRole('slider');
    fireEvent.change(sliders[1], { target: { value: '460' } });
    expect(props.setSpotlightAppearance).toHaveBeenCalledWith({ defaultHeight: 460 });

    fireEvent.change(sliders[2], { target: { value: '700' } });
    expect(props.setSpotlightAppearance).toHaveBeenCalledWith({ maxChatHeight: 700 });
  });
});
