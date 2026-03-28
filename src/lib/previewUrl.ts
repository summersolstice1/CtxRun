import { convertFileSrc } from '@tauri-apps/api/core';

export function buildPreviewUrl(path: string) {
  try {
    return convertFileSrc(path, 'preview');
  } catch {
    return `preview://localhost/${encodeURIComponent(path)}`;
  }
}
