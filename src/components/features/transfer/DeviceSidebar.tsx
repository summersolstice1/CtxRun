import { Copy, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ServiceInfo, TransferDevice } from '@/types/transfer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { QrCodeSVG } from './QrCodeSVG';

interface DeviceSidebarProps {
  serviceInfo: ServiceInfo | null;
  devices: TransferDevice[];
  selectedDeviceId: string | null;
  copied: boolean;
  onCopyUrl: () => void;
  onSelect: (deviceId: string) => void;
}

export function DeviceSidebar({
  serviceInfo,
  devices,
  selectedDeviceId,
  copied,
  onCopyUrl,
  onSelect,
}: DeviceSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-border bg-card">
      <div className="border-b border-border/60 p-4">
        {serviceInfo ? (
          <div className="space-y-4">
            <div className="mx-auto aspect-square w-full max-w-[220px] rounded-2xl border border-border/60 bg-background p-4 text-foreground">
              <QrCodeSVG matrix={serviceInfo.qrMatrix} />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-medium text-foreground">{t('transfer.waitingConnection')}</div>
              <div
                className="truncate rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-xs text-muted-foreground"
                title={serviceInfo.url}
              >
                {serviceInfo.url}
              </div>
              <Button variant="outline" size="sm" onClick={onCopyUrl} className="w-full gap-2">
                <Copy size={13} />
                {copied ? t('transfer.copied') : t('transfer.copyUrl')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-6 text-sm text-muted-foreground">
            {t('transfer.selectDevice')}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {t('transfer.connectedDevices')}
        </div>
        {devices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-background/50 px-4 py-6 text-sm text-muted-foreground">
            {t('transfer.noDevices')}
          </div>
        ) : (
          <div className="space-y-2">
            {devices.map((device) => (
              <button
                key={device.id}
                type="button"
                onClick={() => onSelect(device.id)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors',
                  selectedDeviceId === device.id
                    ? 'border-cyan-400/40 bg-cyan-500/10'
                    : 'border-border bg-background/60 hover:bg-secondary/40'
                )}
              >
                <div className="mt-0.5 rounded-full bg-cyan-500/10 p-2 text-cyan-400">
                  <Smartphone size={14} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">{device.name}</div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {device.deviceType} · {device.ipAddress}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
