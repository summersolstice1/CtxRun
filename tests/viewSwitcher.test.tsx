import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ViewSwitcher,
  getViewSwitcherGeometry,
  resolveViewSwitcherSelection,
} from '@/components/layout/ViewSwitcher';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@spaceymonk/react-radial-menu', () => ({
  Menu: ({ children, show, className }: {
    children: React.ReactNode;
    show?: boolean;
    className?: string;
  }) => (
    <div data-testid="radial-menu" data-show={String(Boolean(show))} className={className}>
      {children}
    </div>
  ),
  MenuItem: ({
    children,
    data,
    onItemClick,
    className,
  }: {
    children: React.ReactNode;
    data?: string;
    onItemClick?: (event: React.MouseEvent<HTMLButtonElement>, index: number, data?: string) => void;
    className?: string;
  }) => (
    <button
      type="button"
      data-testid={`menu-item-${data}`}
      className={className}
      onClick={(event) => onItemClick?.(event, 0, data)}
    >
      {children}
    </button>
  ),
}));

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: height });
}

describe('getViewSwitcherGeometry', () => {
  it('derives switcher geometry from the configured module count', () => {
    expect(getViewSwitcherGeometry(6)).toEqual({
      sectorAngle: 60,
      menuRotation: -120,
      contentRotation: 120,
    });

    expect(getViewSwitcherGeometry(8)).toEqual({
      sectorAngle: 45,
      menuRotation: -112.5,
      contentRotation: 112.5,
    });
  });
});

describe('resolveViewSwitcherSelection', () => {
  it('maps pointer direction to the expected module sector', () => {
    const viewport = { width: 1200, height: 800 };

    expect(resolveViewSwitcherSelection({ x: 600, y: 160 }, viewport)).toBe('prompts');
    expect(resolveViewSwitcherSelection({ x: 780, y: 260 }, viewport)).toBe('context');
    expect(resolveViewSwitcherSelection({ x: 780, y: 540 }, viewport)).toBe('patch');
    expect(resolveViewSwitcherSelection({ x: 600, y: 660 }, viewport)).toBe('refinery');
    expect(resolveViewSwitcherSelection({ x: 420, y: 540 }, viewport)).toBe('automator');
    expect(resolveViewSwitcherSelection({ x: 420, y: 260 }, viewport)).toBe('miner');
    expect(resolveViewSwitcherSelection({ x: 600, y: 400 }, viewport)).toBeNull();
  });
});

describe('ViewSwitcher', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    setViewport(1200, 800);
  });

  it('opens and closes the overlay from the trigger and backdrop', () => {
    render(<ViewSwitcher activeView="patch" onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTitle('topbar.openSwitcher'));
    expect(screen.queryByTestId('radial-menu')).not.toBeNull();

    fireEvent.click(screen.getByLabelText('topbar.closeSwitcher'));
    expect(screen.queryByTestId('radial-menu')).toBeNull();
  });

  it('selects a module and closes the overlay', () => {
    const onSelect = vi.fn();
    render(<ViewSwitcher activeView="prompts" onSelect={onSelect} />);

    fireEvent.click(screen.getByTitle('topbar.openSwitcher'));
    fireEvent.click(screen.getByTestId('menu-item-context'));

    expect(onSelect).toHaveBeenCalledWith('context');
    expect(screen.queryByTestId('radial-menu')).toBeNull();
  });

  it('closes the overlay when escape is pressed', () => {
    render(<ViewSwitcher activeView="miner" onSelect={vi.fn()} />);

    fireEvent.click(screen.getByTitle('topbar.openSwitcher'));
    expect(screen.queryByTestId('radial-menu')).not.toBeNull();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('radial-menu')).toBeNull();
  });

  it('opens on alt hold and switches on alt release', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(<ViewSwitcher activeView="prompts" onSelect={onSelect} enableHoldShortcut />);

    fireEvent.keyDown(window, { key: 'Alt' });
    act(() => {
      vi.advanceTimersByTime(120);
    });

    expect(screen.queryByTestId('radial-menu')).not.toBeNull();

    fireEvent.mouseMove(window, { clientX: 780, clientY: 260 });
    fireEvent.keyUp(window, { key: 'Alt' });

    expect(onSelect).toHaveBeenCalledWith('context');
    expect(screen.queryByTestId('radial-menu')).toBeNull();
  });

  it('cancels the hold flow when alt is used as a chord modifier', () => {
    vi.useFakeTimers();
    const onSelect = vi.fn();
    render(<ViewSwitcher activeView="prompts" onSelect={onSelect} enableHoldShortcut />);

    fireEvent.keyDown(window, { key: 'Alt', altKey: true });
    fireEvent.keyDown(window, { key: '1', altKey: true });
    act(() => {
      vi.advanceTimersByTime(120);
    });
    fireEvent.keyUp(window, { key: 'Alt' });

    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByTestId('radial-menu')).toBeNull();
  });
});
