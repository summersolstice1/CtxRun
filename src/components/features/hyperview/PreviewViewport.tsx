import { type ReactNode } from 'react';

import { open } from '@tauri-apps/plugin-shell';

import { PreviewContent } from './PreviewContent';
import { PreviewOcrPanel } from './PreviewOcrPanel';
import { PreviewOcrSplitLayout } from './PreviewOcrSplitLayout';
import type { PreviewOcrState } from './usePreviewOcr';
import type { FileMeta, PreviewMode } from '@/types/hyperview';

interface PreviewViewportProps {
  activeFile: FileMeta | null;
  activeMode: PreviewMode;
  isLoading: boolean;
  error: string | null;
  showOcrPanel: boolean;
  previewOcr: PreviewOcrState;
  onHighlightOcrLine: (index: number) => void;
  onSelectOcrLine: (index: number) => void;
  renderLoading: () => ReactNode;
  renderError: (args: {
    error: string;
    isOversizedPreview: boolean;
    activeFile: FileMeta | null;
    openExternal: () => void;
  }) => ReactNode;
  renderEmpty?: () => ReactNode;
  oversizedError: string;
}

export function PreviewViewport({
  activeFile,
  activeMode,
  isLoading,
  error,
  showOcrPanel,
  previewOcr,
  onHighlightOcrLine,
  onSelectOcrLine,
  renderLoading,
  renderError,
  renderEmpty,
  oversizedError,
}: PreviewViewportProps) {
  const isOversizedPreview = error === oversizedError;

  if (isLoading) {
    return <>{renderLoading()}</>;
  }

  if (error) {
    return (
      <>
        {renderError({
          error,
          isOversizedPreview,
          activeFile,
          openExternal: () => {
            if (!activeFile) {
              return;
            }

            void open(activeFile.path).catch(() => undefined);
          },
        })}
      </>
    );
  }

  if (!activeFile) {
    return <>{renderEmpty?.() ?? null}</>;
  }

  return (
    <PreviewOcrSplitLayout
      showPanel={showOcrPanel}
      preview={
        <PreviewContent
          meta={activeFile}
          mode={activeMode}
          ocrResult={previewOcr.result}
          selectedOcrLineIndex={previewOcr.selectedLineIndex}
          onSelectOcrLine={onSelectOcrLine}
        />
      }
      panel={
        <PreviewOcrPanel
          state={previewOcr}
          onHighlightLine={onHighlightOcrLine}
          onSelectLine={onSelectOcrLine}
        />
      }
    />
  );
}
