import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchWorkspaceSection } from '@/components/settings/sections/SearchWorkspaceSection';

const { invokeMock, filterManagerMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  filterManagerMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@/components/features/context/FilterManager', () => ({
  FilterManager: (props: { onUpdate: (type: 'dirs', action: 'add', value: string) => void }) => {
    filterManagerMock(props);
    return (
      <button
        type="button"
        data-testid="filter-manager-update"
        onClick={() => props.onUpdate('dirs', 'add', 'dist')}
      >
        filter-manager
      </button>
    );
  },
}));

describe('SearchWorkspaceSection', () => {
  const props = {
    searchSettings: { defaultEngine: 'google' as const, customUrl: 'https://example.com?q=%s' },
    setSearchSettings: vi.fn(),
    globalIgnore: { dirs: ['node_modules'], files: [], extensions: [] },
    updateGlobalIgnore: vi.fn(),
  };

  beforeEach(() => {
    invokeMock.mockReset();
    filterManagerMock.mockClear();
    props.setSearchSettings.mockClear();
    props.updateGlobalIgnore.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('updates search engine and custom url settings', () => {
    render(<SearchWorkspaceSection {...props} />);

    fireEvent.click(screen.getByText('settings.engineBing').closest('button')!);
    expect(props.setSearchSettings).toHaveBeenCalledWith({ defaultEngine: 'bing' });

    fireEvent.change(screen.getByDisplayValue('https://example.com?q=%s'), {
      target: { value: 'https://search.example.com?q=%s' },
    });
    expect(props.setSearchSettings).toHaveBeenCalledWith({
      customUrl: 'https://search.example.com?q=%s',
    });
  });

  it('propagates ignore updates and refreshes the app index', async () => {
    invokeMock.mockResolvedValue('Rebuilt app index');
    render(<SearchWorkspaceSection {...props} />);

    fireEvent.click(screen.getByTestId('filter-manager-update'));
    expect(props.updateGlobalIgnore).toHaveBeenCalledWith('dirs', 'add', 'dist');

    fireEvent.click(screen.getByText('spotlight.refreshIndexNow').closest('button')!);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('refresh_apps');
      expect(screen.getByText('Rebuilt app index')).toBeTruthy();
    });
  });
});
