import { useState } from 'react';
import { Play, Square, QrCode, Link2, Copy, Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ServiceInfo } from '@/types/transfer';
import { cn } from '@/lib/utils';
import { QrCodeSVG } from './QrCodeSVG';

interface ServiceControlsProps {
  isRunning: boolean;
  isBusy: boolean;
  serviceInfo: ServiceInfo | null;
  copied: boolean;
  devicesCount: number;
  onStart: () => void;
  onStop: () => void;
  onCopyUrl: () => void;
}

export function ServiceControls({
  isRunning, isBusy, serviceInfo, copied, onStart, onStop, onCopyUrl,
}: ServiceControlsProps) {
  const { t } = useTranslation();
  const [showQr, setShowQr] = useState(false);

  return (
    <div className="p-4 border-b border-border shrink-0 flex flex-col gap-3 relative">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={cn("w-2 h-2 rounded-full", isRunning ? "bg-green-500" : "bg-muted-foreground")} />
          <span className="text-sm font-semibold">{isRunning ? t('transfer.ready') : t('transfer.offline')}</span>
        </div>
        
        {isRunning ? (
          <button onClick={onStop} disabled={isBusy} className="p-1.5 text-destructive hover:bg-destructive/10 rounded-md transition-colors" title={t('transfer.stop')}>
            {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} fill="currentColor" />}
          </button>
        ) : (
          <button onClick={onStart} disabled={isBusy} className="p-1.5 text-primary hover:bg-secondary rounded-md transition-colors" title={t('transfer.start')}>
            {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} fill="currentColor" />}
          </button>
        )}
      </div>

      {serviceInfo && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 bg-secondary/50 border border-border/50 rounded-md p-1.5 text-xs">
            <Link2 size={14} className="text-muted-foreground shrink-0" />
            <span className="truncate flex-1 font-mono text-muted-foreground">{serviceInfo.url}</span>
            <button onClick={onCopyUrl} className="p-1 hover:bg-background rounded text-foreground transition-colors shrink-0">
              {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
            </button>
            <button onClick={() => setShowQr(!showQr)} className={cn("p-1 rounded transition-colors shrink-0", showQr ? "bg-background shadow-sm text-primary" : "hover:bg-background text-foreground")}>
              <QrCode size={14} />
            </button>
          </div>
          
          {/* 二维码下拉面板 */}
          {showQr && (
            <div className="mt-1 p-3 bg-white rounded-lg border border-border shadow-sm flex items-center justify-center animate-in fade-in zoom-in-95 duration-200">
              <div className="w-40 h-40 text-black">
                <QrCodeSVG matrix={serviceInfo.qrMatrix} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}