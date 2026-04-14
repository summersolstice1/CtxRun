import { useEffect, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import liquidLoaderUrl from '@/assets/liquid-loader.lottie';
import type { PreviewOcrState } from './usePreviewOcr';

interface PreviewOcrPanelProps {
  state: PreviewOcrState;
  onHighlightLine: (index: number) => void;
  onSelectLine: (index: number) => void;
}

function selectionIsWithinNode(selection: Selection, node: Node) {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return false;
  }

  const range = selection.getRangeAt(0);
  return node.contains(range.startContainer) && node.contains(range.endContainer);
}

export function PreviewOcrPanel({
  state,
  onHighlightLine,
  onSelectLine,
}: PreviewOcrPanelProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lineRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const pointerDownRef = useRef<{ index: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!state.result || state.result.lines.length === 0) {
      lineRefs.current = [];
    }
  }, [state.result]);

  useEffect(() => {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    if (state.selectedLineIndex === null) {
      const anchorNode = selection.anchorNode;
      if (anchorNode && panelRef.current?.contains(anchorNode)) {
        selection.removeAllRanges();
      }
      return;
    }

    const target = lineRefs.current[state.selectedLineIndex];
    if (!target || target.textContent === null) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(target);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [state.result, state.selectedLineIndex, state.selectionRequestId]);

  return (
    <aside className="h-full w-full border-l border-border bg-background">
      <div ref={panelRef} className="h-full overflow-y-auto px-5 py-4">
        {state.isBusy ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <DotLottieReact src={liquidLoaderUrl} autoplay loop className="w-16 h-16" />
            <p className="text-sm font-medium text-foreground">{t('peek.ocrRunningTitle')}</p>
          </div>
        ) : state.needsSetup ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
                <AlertTriangle size={16} />
                <span>{t('peek.ocrSetupTitle')}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {state.status?.preparing
                  ? t('peek.ocrPreparingDescription')
                  : t('peek.ocrSetupDescription')}
              </p>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {t('peek.ocrSettingsOnlyHint')}
              </p>
            </div>
          </div>
        ) : state.error ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-red-500/20 bg-red-500/8 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-red-300">
                <AlertTriangle size={16} />
                <span>{t('peek.ocrErrorTitle')}</span>
              </div>
              <p className="mt-2 break-words text-sm text-muted-foreground">{state.error}</p>
            </div>
          </div>
        ) : state.result ? (
          state.result.lines.length > 0 ? (
            <div className="min-h-full text-sm leading-7 text-foreground whitespace-pre-wrap break-words font-sans">
              {state.result.lines.map((line, index) => (
                <div
                  key={`${index}-${line.text}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={state.selectedLineIndex === index}
                  onPointerDown={(event) => {
                    if (event.button !== 0) {
                      pointerDownRef.current = null;
                      return;
                    }

                    pointerDownRef.current = {
                      index,
                      x: event.clientX,
                      y: event.clientY,
                    };
                  }}
                  onPointerUp={(event) => {
                    if (event.button !== 0) {
                      pointerDownRef.current = null;
                      return;
                    }

                    const pointerDown = pointerDownRef.current;
                    pointerDownRef.current = null;
                    if (!pointerDown || pointerDown.index !== index) {
                      return;
                    }

                    const moved =
                      Math.abs(event.clientX - pointerDown.x) > 4 ||
                      Math.abs(event.clientY - pointerDown.y) > 4;
                    const selection = window.getSelection();
                    const lineNode = lineRefs.current[index];

                    if (selection && lineNode && selectionIsWithinNode(selection, lineNode)) {
                      onHighlightLine(index);
                      return;
                    }

                    if (!moved) {
                      onSelectLine(index);
                    }
                  }}
                  onPointerCancel={() => {
                    pointerDownRef.current = null;
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onSelectLine(index);
                    }
                  }}
                  className="select-text cursor-text outline-none"
                >
                  <span
                    ref={(node) => {
                      lineRefs.current[index] = node;
                    }}
                    className="selection:bg-primary selection:text-primary-foreground"
                  >
                    {line.text || '\u00A0'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <pre className="m-0 min-h-full text-sm leading-7 text-foreground whitespace-pre-wrap break-words select-text font-sans">
              {state.result.fullText.trim() || t('peek.ocrEmptyText')}
            </pre>
          )
        ) : (
          <div className="h-full" />
        )}
      </div>
    </aside>
  );
}
