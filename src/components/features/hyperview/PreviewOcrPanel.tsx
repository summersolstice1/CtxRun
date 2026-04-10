import { AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PreviewOcrState } from './usePreviewOcr';

interface PreviewOcrPanelProps {
  state: PreviewOcrState;
}

export function PreviewOcrPanel({ state }: PreviewOcrPanelProps) {
  const { t } = useTranslation();

  return (
    <aside className="h-full w-full border-l border-border bg-background">
      <div className="h-full overflow-y-auto px-5 py-4">
        {state.isBusy ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
            <Loader2 size={22} className="animate-spin" />
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
          <pre className="m-0 min-h-full text-sm leading-7 text-foreground whitespace-pre-wrap break-words select-text font-sans">
            {state.result.fullText.trim() || t('peek.ocrEmptyText')}
          </pre>
        ) : (
          <div className="h-full" />
        )}
      </div>
    </aside>
  );
}
