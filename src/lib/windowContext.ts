import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

export function getCurrentWindowLabel(): string | null {
  try {
    return getCurrentWebviewWindow().label;
  } catch {
    return null;
  }
}

export function isPeekWindow(): boolean {
  return getCurrentWindowLabel() === 'peek';
}

export function isReadOnlyStorageWindow(): boolean {
  return isPeekWindow();
}
