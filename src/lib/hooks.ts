import { useCallback, useEffect, useMemo, useState } from 'react';
import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager';

type InputLikeElement = HTMLInputElement | HTMLTextAreaElement;
interface SmartContextMenuOptions<T extends InputLikeElement> {
  onPaste: (pastedText: string, element: T | null) => void;
}

export function useSmartContextMenu<T extends InputLikeElement>({ onPaste }: SmartContextMenuOptions<T>) {
  const handleContextMenu = useCallback(async (e: React.MouseEvent<T>) => {
    e.preventDefault();
    const element = e.currentTarget;

    const selection = window.getSelection()?.toString();
    if (selection && selection.length > 0) {
      await writeText(selection);
      return;
    }

    try {
      const clipboardText = await readText();
      if (!clipboardText) return;

      onPaste(clipboardText, element);
    } catch (err) {
    }
  }, [onPaste]);

  return { onContextMenu: handleContextMenu };
}

interface UseCollapsedItemsOptions<T> {
  items: T[];
  threshold: number;
  previewCount?: number;
  getPreviewText?: (item: T) => string;
}

export function useCollapsedItems<T>({
  items,
  threshold,
  previewCount = 12,
  getPreviewText,
}: UseCollapsedItemsOptions<T>) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = items.length > threshold;

  useEffect(() => {
    if (!shouldCollapse && expanded) {
      setExpanded(false);
    }
  }, [shouldCollapse, expanded]);

  const visibleItems = expanded || !shouldCollapse
    ? items
    : items.slice(0, threshold);
  const hiddenCount = items.length - visibleItems.length;

  const hiddenPreview = useMemo(() => {
    if (hiddenCount <= 0) return '';
    const toText = getPreviewText ?? ((item: T) => String(item));
    return items
      .slice(threshold, threshold + previewCount)
      .map(toText)
      .join(', ');
  }, [hiddenCount, getPreviewText, items, previewCount, threshold]);

  return {
    expanded,
    setExpanded,
    shouldCollapse,
    visibleItems,
    hiddenCount,
    hiddenPreview,
  };
}
