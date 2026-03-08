import React, { useEffect } from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { readTextMock, writeTextMock } = vi.hoisted(() => ({
  readTextMock: vi.fn(),
  writeTextMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({
  readText: readTextMock,
  writeText: writeTextMock,
}));

import { useCollapsedItems, useSmartContextMenu } from '@/lib/hooks';

afterEach(() => {
  cleanup();
});

function CollapsedHarness<T>({
  items,
  threshold,
  previewCount,
  getPreviewText,
  onSnapshot,
}: {
  items: T[];
  threshold: number;
  previewCount?: number;
  getPreviewText?: (item: T) => string;
  onSnapshot: (snapshot: ReturnType<typeof useCollapsedItems<T>>) => void;
}) {
  const state = useCollapsedItems({ items, threshold, previewCount, getPreviewText });
  useEffect(() => {
    onSnapshot(state);
  }, [state, onSnapshot]);
  return null;
}

function SmartMenuHarness({
  onPaste,
}: {
  onPaste: (text: string, element: HTMLTextAreaElement | null) => void;
}) {
  const { onContextMenu } = useSmartContextMenu<HTMLTextAreaElement>({ onPaste });
  return <textarea data-testid="input" onContextMenu={onContextMenu} defaultValue="hello" />;
}

describe('hooks', () => {
  it('useCollapsedItems collapses and expands with hidden preview', async () => {
    const snapshots: any[] = [];
    const items = ['a', 'b', 'c', 'd', 'e'];

    const { rerender } = render(
      <CollapsedHarness
        items={items}
        threshold={3}
        previewCount={2}
        getPreviewText={(x) => x.toUpperCase()}
        onSnapshot={(s) => snapshots.push(s)}
      />
    );

    const first = snapshots[snapshots.length - 1];
    expect(first.shouldCollapse).toBe(true);
    expect(first.visibleItems).toEqual(['a', 'b', 'c']);
    expect(first.hiddenCount).toBe(2);
    expect(first.hiddenPreview).toBe('D, E');

    await act(async () => {
      first.setExpanded(true);
    });
    const expanded = snapshots[snapshots.length - 1];
    expect(expanded.visibleItems).toEqual(items);
    expect(expanded.hiddenCount).toBe(0);

    rerender(
      <CollapsedHarness
        items={['a', 'b']}
        threshold={3}
        onSnapshot={(s) => snapshots.push(s)}
      />
    );
    await Promise.resolve();
    const shrunk = snapshots[snapshots.length - 1];
    expect(shrunk.shouldCollapse).toBe(false);
    expect(shrunk.expanded).toBe(false);
    expect(shrunk.visibleItems).toEqual(['a', 'b']);
  });

  it('useSmartContextMenu writes selected text to clipboard', async () => {
    writeTextMock.mockResolvedValue(undefined);
    readTextMock.mockResolvedValue('clipboard');
    const pasteSpy = vi.fn();

    const selectionSpy = vi
      .spyOn(window, 'getSelection')
      .mockReturnValue({ toString: () => 'selected text' } as any);

    const { getByTestId } = render(<SmartMenuHarness onPaste={pasteSpy} />);
    fireEvent.contextMenu(getByTestId('input'));
    await Promise.resolve();

    expect(writeTextMock).toHaveBeenCalledWith('selected text');
    expect(readTextMock).not.toHaveBeenCalled();
    expect(pasteSpy).not.toHaveBeenCalled();

    selectionSpy.mockRestore();
  });

  it('useSmartContextMenu pastes clipboard text when no selection', async () => {
    writeTextMock.mockResolvedValue(undefined);
    readTextMock.mockResolvedValue('from clipboard');
    const pasteSpy = vi.fn();

    const selectionSpy = vi
      .spyOn(window, 'getSelection')
      .mockReturnValue({ toString: () => '' } as any);

    const { getByTestId } = render(<SmartMenuHarness onPaste={pasteSpy} />);
    const el = getByTestId('input') as HTMLTextAreaElement;
    fireEvent.contextMenu(el);
    await Promise.resolve();

    expect(writeTextMock).not.toHaveBeenCalled();
    expect(readTextMock).toHaveBeenCalledTimes(1);
    expect(pasteSpy).toHaveBeenCalledWith('from clipboard', el);

    selectionSpy.mockRestore();
  });
});
