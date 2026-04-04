import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import { FileMeta, PreviewMode } from '@/types/hyperview';
import { MAX_INLINE_PREVIEW_BYTES, OVERSIZED_PREVIEW_ERROR } from '@/lib/previewLimits';

interface PreviewState {
  isOpen: boolean;
  isLoading: boolean;
  activeFile: FileMeta | null;
  activeMode: PreviewMode;
  error: string | null;

  openPreview: (path: string) => Promise<void>;
  setActiveMode: (mode: PreviewMode) => void;
  closePreview: () => void;
}

export const usePreviewStore = create<PreviewState>((set) => ({
  isOpen: false,
  isLoading: false,
  activeFile: null,
  activeMode: 'default',
  error: null,

  openPreview: async (path: string) => {
    set({ isOpen: true, isLoading: true, error: null, activeFile: null, activeMode: 'default' });

    try {
      const meta = await invoke<FileMeta>('get_file_meta', { path });
      if (meta.size > MAX_INLINE_PREVIEW_BYTES) {
        set({
          activeFile: meta,
          activeMode: meta.defaultMode,
          isLoading: false,
          error: OVERSIZED_PREVIEW_ERROR,
        });
        return;
      }
      set({ activeFile: meta, activeMode: meta.defaultMode, isLoading: false });
    } catch (err: any) {
      set({ error: String(err), isLoading: false });
    }
  },

  setActiveMode: (mode) => {
    set((state) => {
      if (!state.activeFile || !state.activeFile.supportedModes.includes(mode)) {
        return state;
      }

      return { activeMode: mode };
    });
  },

  closePreview: () => {
    set({ isOpen: false, activeFile: null, activeMode: 'default', error: null });
  }
}));
