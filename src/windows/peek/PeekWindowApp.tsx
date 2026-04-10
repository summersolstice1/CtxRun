import { useCallback, useEffect, useRef } from 'react';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { ChevronLeft, ChevronRight, Eye, FileText, Pin, PinOff, ScanText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';

import { PreviewContent } from '@/components/features/hyperview/PreviewContent';
import { PreviewOcrPanel } from '@/components/features/hyperview/PreviewOcrPanel';
import { PreviewOcrSplitLayout } from '@/components/features/hyperview/PreviewOcrSplitLayout';
import { PreviewModeSwitch } from '@/components/features/hyperview/PreviewModeSwitch';
import { usePreviewOcr } from '@/components/features/hyperview/usePreviewOcr';
import { MAX_INLINE_PREVIEW_BYTES, OVERSIZED_PREVIEW_ERROR } from '@/lib/previewLimits';
import { applyThemeToDocument } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { usePeekStore } from '@/store/usePeekStore';
import type { PeekOpenPayload } from '@/types/peek';

const appWindow = getCurrentWebviewWindow();
const BLUR_CLOSE_DELAY_MS = 180;
const DRAG_BLUR_GUARD_MS = 1_200;
const INTERACTIVE_KEYBOARD_TARGETS = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  'audio',
  'video',
  'iframe',
  '[contenteditable="true"]',
  '[role="button"]',
  '.monaco-editor',
].join(', ');

function formatSize(bytes: number) {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const base = Math.floor(Math.log(bytes) / Math.log(1024));
  const unit = units[Math.min(base, units.length - 1)];
  const value = bytes / Math.pow(1024, Math.min(base, units.length - 1));

  return `${value.toFixed(value >= 10 || unit === 'B' ? 0 : 1)} ${unit}`;
}

function targetOwnsKeyboard(event: KeyboardEvent) {
  const nodes = [event.target, document.activeElement].filter(
    (value): value is Element => value instanceof Element
  );

  return nodes.some((node) => node.closest(INTERACTIVE_KEYBOARD_TARGETS));
}

export default function PeekApp() {
  const theme = useAppStore((state) => state.theme);
  const { t } = useTranslation();
  const blurCloseTimerRef = useRef<number | null>(null);
  const ignoreBlurUntilRef = useRef(0);
  const {
    paths,
    activeIndex,
    activeFile,
    activeMode,
    isLoading,
    error,
    isPinned,
    openSession,
    next,
    previous,
    setActiveMode,
    setPinned,
    togglePinned,
    clear,
  } = usePeekStore(
    useShallow((state) => ({
      paths: state.paths,
      activeIndex: state.activeIndex,
      activeFile: state.activeFile,
      activeMode: state.activeMode,
      isLoading: state.isLoading,
      error: state.error,
      isPinned: state.isPinned,
      openSession: state.openSession,
      next: state.next,
      previous: state.previous,
      setActiveMode: state.setActiveMode,
      setPinned: state.setPinned,
      togglePinned: state.togglePinned,
      clear: state.clear,
    }))
  );
  const previewOcr = usePreviewOcr({
    activeFile,
    onAutoPin: () => setPinned(true),
  });

  const closePeekWindow = useCallback(async () => {
    clear();

    try {
      await invoke('peek_clear_request');
    } catch (error) {
      console.error('[Peek] Failed to clear pending request:', error);
    }

    try {
      await appWindow.close();
    } catch (error) {
      console.error('[Peek] Failed to close window:', error);
    }
  }, [clear]);

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    const attachPendingRequest = async () => {
      try {
        const payload = await invoke<PeekOpenPayload | null>('peek_get_request');
        if (payload) {
          await openSession(payload);
        }
      } catch (loadError) {
        console.error('[Peek] Failed to load pending request:', loadError);
      }
    };

    void attachPendingRequest();
  }, [openSession]);

  useEffect(() => {
    const unlistenPromise = listen<PeekOpenPayload>('peek:open', (event) => {
      void openSession(event.payload);
    });

    const cancelPendingBlurClose = () => {
      if (blurCloseTimerRef.current !== null) {
        window.clearTimeout(blurCloseTimerRef.current);
        blurCloseTimerRef.current = null;
      }
    };

    const scheduleBlurClose = (delayMs: number) => {
      if (usePeekStore.getState().isPinned) {
        return;
      }

      cancelPendingBlurClose();
      blurCloseTimerRef.current = window.setTimeout(() => {
        blurCloseTimerRef.current = null;

        if (document.hasFocus()) {
          return;
        }

        if (usePeekStore.getState().isPinned) {
          return;
        }

        void closePeekWindow();
      }, delayMs);
    };

    const focusListener = appWindow.onFocusChanged(({ payload }) => {
      if (payload) {
        cancelPendingBlurClose();
        return;
      }

      const remainingIgnoreMs = ignoreBlurUntilRef.current - Date.now();
      if (remainingIgnoreMs > 0) {
        scheduleBlurClose(Math.max(remainingIgnoreMs, BLUR_CLOSE_DELAY_MS));
        return;
      }

      scheduleBlurClose(BLUR_CLOSE_DELAY_MS);
    });

    return () => {
      cancelPendingBlurClose();
      unlistenPromise.then((unlisten) => unlisten());
      focusListener.then((unlisten) => unlisten());
    };
  }, [clear, openSession, closePeekWindow]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        void closePeekWindow();
        return;
      }

      if (targetOwnsKeyboard(event)) {
        return;
      }

      if (event.key === ' ') {
        event.preventDefault();
        void closePeekWindow();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        void next();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        void previous();
        return;
      }

      if (event.key === 'Enter' && activeFile) {
        event.preventDefault();
        void open(activeFile.path).catch((error) => {
          console.error('[Peek] Failed to open file with default app:', error);
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeFile, closePeekWindow, next, previous]);

  const canNavigate = paths.length > 1;
  const currentPosition = paths.length > 0 ? activeIndex + 1 : 0;
  const isOversizedPreview = error === OVERSIZED_PREVIEW_ERROR;
  const canUseOcr = Boolean(activeFile && !error && activeFile.previewType === 'image');
  const showOcrPanel = canUseOcr && previewOcr.isOpen;

  return (
    <div className="peek-window flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center justify-between gap-4 px-5 py-3 select-none">
        <div
          data-tauri-drag-region
          className="flex min-w-0 flex-1 cursor-move items-center gap-3"
          onMouseDown={(event) => {
            if (event.button === 0) {
              ignoreBlurUntilRef.current = Date.now() + DRAG_BLUR_GUARD_MS;
            }
          }}
        >
          <Eye size={18} className="shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {activeFile?.name || t('peek.title')}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {activeFile
                ? `${activeFile.mime} · ${formatSize(activeFile.size)}`
                : t('peek.subtitle')}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          {activeFile && !error && activeFile.supportedModes.length > 1 && (
            <PreviewModeSwitch
              modes={activeFile.supportedModes}
              value={activeMode}
              onChange={setActiveMode}
              className="mr-1"
            />
          )}
          {canNavigate && (
            <span>{currentPosition}/{paths.length}</span>
          )}
          {canUseOcr && (
            <button
              type="button"
              onClick={() => {
                if (previewOcr.isOpen) {
                  previewOcr.closePanel();
                  return;
                }

                void previewOcr.runOcr();
              }}
              className={cn(
                'inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground',
                previewOcr.isOpen && 'bg-secondary/70 text-foreground'
              )}
              title={previewOcr.isOpen ? t('peek.ocrClosePanel') : t('peek.ocrRun')}
            >
              <ScanText size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={togglePinned}
            className="inline-flex items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
            title={isPinned ? t('peek.unpinPreview') : t('peek.pinPreview')}
          >
            {isPinned ? <PinOff size={16} /> : <Pin size={16} />}
          </button>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden bg-transparent">
        {isLoading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-foreground/60" />
            <p className="text-sm">{t('peek.loading')}</p>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <FileText size={22} className="text-destructive" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {isOversizedPreview ? t('peek.oversizedTitle') : t('peek.failed')}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {isOversizedPreview
                  ? t('peek.oversizedDescription', { limit: formatSize(MAX_INLINE_PREVIEW_BYTES) })
                  : error}
              </p>
            </div>
            {isOversizedPreview && activeFile && (
              <button
                type="button"
                onClick={() => void open(activeFile.path).catch((openError) => {
                  console.error('[Peek] Failed to open oversized file with default app:', openError);
                })}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
              >
                {t('peek.openExternal')}
              </button>
            )}
          </div>
        ) : activeFile ? (
          <PreviewOcrSplitLayout
            showPanel={showOcrPanel}
            preview={
              <PreviewContent
                meta={activeFile}
                mode={activeMode}
                ocrResult={previewOcr.result}
                selectedOcrLineIndex={previewOcr.selectedLineIndex}
                onSelectOcrLine={previewOcr.selectLine}
              />
            }
            panel={
              <PreviewOcrPanel
                state={previewOcr}
                onHighlightLine={previewOcr.highlightLine}
                onSelectLine={previewOcr.selectLine}
              />
            }
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
            <Eye size={22} />
            <div>
              <p className="text-sm font-semibold text-foreground">{t('peek.emptyTitle')}</p>
              <p className="mt-1 text-sm">{t('peek.emptyDescription')}</p>
            </div>
          </div>
        )}
      </main>

      <footer className="flex items-center justify-between px-5 py-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>{t('peek.hintClose')}</span>
          <span>{t('peek.hintOpen')}</span>
        </div>
        {canNavigate && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1">
              <ChevronLeft size={14} />
              {t('peek.hintPrevious')}
            </span>
            <span className="inline-flex items-center gap-1">
              {t('peek.hintNext')}
              <ChevronRight size={14} />
            </span>
          </div>
        )}
      </footer>
    </div>
  );
}
