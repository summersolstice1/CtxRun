import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShortcutInput } from '@/components/ui/ShortcutInput';

vi.mock('react-i18next', () => ({
  initReactI18next: {
    type: '3rdParty',
    init: vi.fn(),
  },
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

function ControlledShortcutInput(props: { initialValue: string; tip?: string }) {
  const [value, setValue] = useState(props.initialValue);
  return (
    <ShortcutInput
      value={value}
      onChange={setValue}
      label="Hotkey"
      tip={props.tip}
    />
  );
}

describe('ShortcutInput', () => {
  afterEach(() => {
    cleanup();
  });

  it('records keyboard shortcuts and shows the recording prompt', async () => {
    const onChange = vi.fn();

    render(<ShortcutInput value="" onChange={onChange} label="Hotkey" />);
    fireEvent.click(screen.getByText('settings.shortcutNotSet'));
    expect(screen.getByText('settings.shortcutPressKeys')).toBeTruthy();
    fireEvent.keyDown(window, { key: 's', ctrlKey: true, shiftKey: true });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('Ctrl+Shift+S');
    });
  });

  it('renders the clear action and optional tip', () => {
    const onChange = vi.fn();

    render(<ShortcutInput value="Alt+S" onChange={onChange} label="Hotkey" tip="Tip text" />);
    fireEvent.click(screen.getByTitle('settings.shortcutClear'));
    expect(onChange).toHaveBeenCalledWith('');
    expect(screen.getByText('Tip text')).toBeTruthy();
  });

  it('hides the clear button when no shortcut is set', () => {
    render(<ControlledShortcutInput initialValue="" />);

    expect(screen.queryByTitle('settings.shortcutClear')).toBeNull();
  });
});
