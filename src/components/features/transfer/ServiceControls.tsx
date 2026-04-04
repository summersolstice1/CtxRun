import { Copy, Loader2, Radio, Square } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ServiceInfo } from '@/types/transfer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ServiceControlsProps {
  isRunning: boolean;
  isBusy: boolean;
  serviceInfo: ServiceInfo | null;
  copied: boolean;
  onStart: () => void;
  onStop: () => void;
  onCopyUrl: () => void;
}

export function ServiceControls({
  isRunning,
  isBusy,
  serviceInfo,
  copied,
  onStart,
  onStop,
  onCopyUrl,
}: ServiceControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="border-b border-border bg-secondary/5 px-6 py-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-foreground">
            <Radio size={18} className={cn(isRunning ? 'text-cyan-400' : 'text-muted-foreground')} />
            <h2 className="text-base font-semibold">{t('transfer.title')}</h2>
          </div>
          <p className="text-sm text-muted-foreground">{t('transfer.subtitle')}</p>
        </div>

        {isRunning ? (
          <Button variant="destructive" onClick={onStop} disabled={isBusy} className="gap-2">
            {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Square size={14} fill="currentColor" />}
            {t('transfer.stop')}
          </Button>
        ) : (
          <Button onClick={onStart} disabled={isBusy} className="gap-2">
            {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Radio size={15} />}
            {t('transfer.start')}
          </Button>
        )}
      </div>

      {serviceInfo && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/80 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t('transfer.serviceUrl')}
            </div>
            <div className="truncate font-mono text-sm text-foreground" title={serviceInfo.url}>
              {serviceInfo.url}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t('transfer.saveDir')}: {serviceInfo.saveDir}
            </div>
          </div>
          <Button variant="outline" onClick={onCopyUrl} className="gap-2">
            <Copy size={14} />
            {copied ? t('transfer.copied') : t('transfer.copyUrl')}
          </Button>
        </div>
      )}
    </div>
  );
}
