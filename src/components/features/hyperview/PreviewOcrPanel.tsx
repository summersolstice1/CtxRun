import { AlertTriangle, Loader2, RefreshCw, ScanText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PreviewOcrState } from './usePreviewOcr';

function formatElapsed(elapsedMs: number) {
  if (elapsedMs < 1000) {
    return `${elapsedMs} ms`;
  }

  return `${(elapsedMs / 1000).toFixed(1)} s`;
}

function formatConfidence(confidence: number) {
  return `${Math.round(confidence * 100)}%`;
}

interface PreviewOcrPanelProps {
  fileName: string;
  state: PreviewOcrState;
  onClose: () => void;
  onRetry: () => void;
}

export function PreviewOcrPanel({
  fileName,
  state,
  onClose,
  onRetry,
}: PreviewOcrPanelProps) {
  const { t } = useTranslation();
  const hasResult = Boolean(state.result);

  return (
    <aside className="flex h-full w-full flex-col border-l border-border bg-background/90 backdrop-blur">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {state.isBusy ? <Loader2 size={16} className="animate-spin" /> : <ScanText size={16} />}
            <span>{t('peek.ocrTitle')}</span>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">{fileName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
          title={t('peek.ocrClosePanel')}
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {state.isBusy ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Loader2 size={22} className="animate-spin" />
            <div>
              <p className="text-sm font-medium text-foreground">{t('peek.ocrRunningTitle')}</p>
              <p className="mt-1 text-xs">{t('peek.ocrRunningDescription')}</p>
            </div>
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

            <button
              type="button"
              onClick={onRetry}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/50"
            >
              <RefreshCw size={16} />
              <span>{t('peek.ocrRetry')}</span>
            </button>
          </div>
        ) : hasResult ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('peek.ocrLineCount')}
                </div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {state.result?.lineCount ?? 0}
                </div>
              </div>

              <div className="rounded-2xl border border-border/70 bg-secondary/20 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('peek.ocrElapsed')}
                </div>
                <div className="mt-1 text-lg font-semibold text-foreground">
                  {state.result ? formatElapsed(state.result.elapsedMs) : '-'}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-secondary/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-foreground">{t('peek.ocrExtractedText')}</h4>
                {state.result?.modelProfile && (
                  <span className="rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                    {state.result.modelProfile}
                  </span>
                )}
              </div>
              <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 text-sm leading-6 text-foreground whitespace-pre-wrap break-words">
                {state.result?.fullText.trim() || t('peek.ocrEmptyText')}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-foreground">{t('peek.ocrLineDetails')}</h4>
                <span className="text-xs text-muted-foreground">
                  {t('peek.ocrResolution', {
                    width: state.result?.imageWidth ?? 0,
                    height: state.result?.imageHeight ?? 0,
                  })}
                </span>
              </div>

              <div className="space-y-2">
                {state.result?.lines.map((line, index) => (
                  <div
                    key={`${index}-${line.text}`}
                    className="rounded-2xl border border-border/70 bg-secondary/10 p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-sm leading-6 text-foreground break-words">
                        {line.text || t('peek.ocrEmptyLine')}
                      </span>
                      <span className="shrink-0 rounded-full border border-border/70 bg-background/70 px-2.5 py-1 text-[11px] text-muted-foreground">
                        {formatConfidence(line.confidence)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <ScanText size={22} />
            <div>
              <p className="text-sm font-medium text-foreground">{t('peek.ocrIdleTitle')}</p>
              <p className="mt-1 text-xs">{t('peek.ocrIdleDescription')}</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
