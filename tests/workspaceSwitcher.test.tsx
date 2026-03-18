import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceSwitcher } from '@/components/layout/WorkspaceSwitcher';

const {
  openDialogMock,
  writeTextMock,
  invokeMock,
  useAppStoreMock,
  storeState,
} = vi.hoisted(() => {
  const state = {
    projectRoot: 'E:\\Project\\CtxRun',
    recentProjectRoots: ['E:\\Project\\CtxRun', 'E:\\Project\\Other'],
    setProjectRoot: vi.fn(),
    clearProjectRoot: vi.fn(),
  };

  return {
    openDialogMock: vi.fn(),
    writeTextMock: vi.fn(),
    invokeMock: vi.fn(),
    storeState: state,
    useAppStoreMock: vi.fn((selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
    ),
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  writeText: writeTextMock,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: useAppStoreMock,
}));

describe('WorkspaceSwitcher', () => {
  beforeEach(() => {
    storeState.projectRoot = 'E:\\Project\\CtxRun';
    storeState.recentProjectRoots = ['E:\\Project\\CtxRun', 'E:\\Project\\Other'];
    storeState.setProjectRoot.mockClear();
    storeState.clearProjectRoot.mockClear();
    openDialogMock.mockReset();
    writeTextMock.mockReset();
    invokeMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('chooses a new workspace through the dialog', async () => {
    openDialogMock.mockResolvedValue('E:\\Project\\NewWorkspace');
    render(<WorkspaceSwitcher />);

    fireEvent.click(screen.getByTitle('E:\\Project\\CtxRun'));
    fireEvent.click(screen.getByText('workspace.switch').closest('button')!);

    await waitFor(() => {
      expect(openDialogMock).toHaveBeenCalledWith({
        directory: true,
        multiple: false,
        recursive: false,
      });
      expect(storeState.setProjectRoot).toHaveBeenCalledWith('E:\\Project\\NewWorkspace');
    });
  });

  it('copies and clears the current workspace', async () => {
    writeTextMock.mockResolvedValue(undefined);
    render(<WorkspaceSwitcher />);

    fireEvent.click(screen.getByTitle('E:\\Project\\CtxRun'));
    fireEvent.click(screen.getByText('workspace.copyPath').closest('button')!);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith('E:\\Project\\CtxRun');
    });

    fireEvent.click(screen.getByText('workspace.clear').closest('button')!);
    expect(storeState.clearProjectRoot).toHaveBeenCalled();
  });

  it('switches to a recent workspace and opens the current folder', async () => {
    invokeMock.mockResolvedValue(undefined);
    render(<WorkspaceSwitcher />);

    fireEvent.click(screen.getByTitle('E:\\Project\\CtxRun'));
    fireEvent.click(screen.getByText('workspace.openFolder').closest('button')!);

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('open_folder_in_file_manager', {
        path: 'E:\\Project\\CtxRun',
      });
    });

    fireEvent.click(screen.getByTitle('E:\\Project\\Other'));
    expect(storeState.setProjectRoot).toHaveBeenCalledWith('E:\\Project\\Other');
  });
});
