import { useCallback } from 'react';
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