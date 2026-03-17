import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ViewSwitcher, getViewSwitcherGeometry } from '@/components/layout/ViewSwitcher';

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
    onMouseEnter,
    onMouseLeave,
    className,
  }: {
    children: React.ReactNode;
    data?: string;
    onItemClick?: (event: React.MouseEvent<HTMLButtonElement>, index: number, data?: string) => void;
    onMouseEnter?: React.MouseEventHandler<HTMLButtonElement>;
    onMouseLeave?: React.MouseEventHandler<HTMLButtonElement>;
    className?: string;
  }) => (
    <button
      type="button"
      data-testid={`menu-item-${data}`}
      className={className}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={(event) => onItemClick?.(event, 0, data)}
    >
      {children}
    </button>
  ),
}));

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

describe('ViewSwitcher', () => {
  afterEach(() => {
    cleanup();
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
});
