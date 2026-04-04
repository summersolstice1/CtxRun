import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

import { MAX_INLINE_PREVIEW_BYTES, OVERSIZED_PREVIEW_ERROR } from '@/lib/previewLimits';
import type { FileMeta, PreviewMode } from '@/types/hyperview';
import type { PeekOpenPayload } from '@/types/peek';

interface PeekState {
  sessionId: number | null;
  paths: string[];
  activeIndex: number;
  activeFile: FileMeta | null;
  activeMode: PreviewMode;
  isLoading: boolean;
  error: string | null;
  openSession: (payload: PeekOpenPayload) => Promise<void>;
  showIndex: (index: number) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  setActiveMode: (mode: PreviewMode) => void;
  clear: () => void;
}

let activeRequestId = 0;

async function loadIndex(
  index: number,
  set: (partial: Partial<PeekState>) => void,
  get: () => PeekState
) {
  const state = get();
  if (state.paths.length === 0 || index < 0 || index >= state.paths.length) {
    set({
      activeIndex: 0,
      activeFile: null,
      isLoading: false,
      error: state.paths.length === 0 ? null : state.error,
    });
    return;
  }

  const requestId = ++activeRequestId;
  const path = state.paths[index];
  set({ activeIndex: index, isLoading: true, error: null });

  try {
    const meta = await invoke<FileMeta>('get_file_meta', { path });
    if (requestId !== activeRequestId) {
      return;
    }

    if (meta.size > MAX_INLINE_PREVIEW_BYTES) {
      set({
        activeFile: meta,
        activeMode: meta.defaultMode,
        isLoading: false,
        error: OVERSIZED_PREVIEW_ERROR,
      });
      return;
    }

    set({
      activeFile: meta,
      activeMode: meta.defaultMode,
      isLoading: false,
      error: null,
    });
  } catch (error) {
    if (requestId !== activeRequestId) {
      return;
    }

    set({
      activeFile: null,
      activeMode: 'default',
      isLoading: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export const usePeekStore = create<PeekState>((set, get) => ({
  sessionId: null,
  paths: [],
  activeIndex: 0,
  activeFile: null,
  activeMode: 'default',
  isLoading: false,
  error: null,
  openSession: async (payload) => {
    set({
      sessionId: payload.sessionId,
      paths: payload.paths,
      activeIndex: payload.activeIndex,
      activeFile: null,
      activeMode: 'default',
      isLoading: payload.paths.length > 0,
      error: null,
    });

    await loadIndex(payload.activeIndex, set, get);
  },
  showIndex: async (index) => {
    await loadIndex(index, set, get);
  },
  next: async () => {
    const state = get();
    if (state.paths.length <= 1) {
      return;
    }

    const nextIndex = (state.activeIndex + 1) % state.paths.length;
    await loadIndex(nextIndex, set, get);
  },
  previous: async () => {
    const state = get();
    if (state.paths.length <= 1) {
      return;
    }

    const previousIndex = (state.activeIndex - 1 + state.paths.length) % state.paths.length;
    await loadIndex(previousIndex, set, get);
  },
  setActiveMode: (mode) => {
    const state = get();
    if (!state.activeFile || !state.activeFile.supportedModes.includes(mode)) {
      return;
    }

    set({ activeMode: mode });
  },
  clear: () => {
    activeRequestId += 1;
    set({
      sessionId: null,
      paths: [],
      activeIndex: 0,
      activeFile: null,
      activeMode: 'default',
      isLoading: false,
      error: null,
    });
  },
}));
