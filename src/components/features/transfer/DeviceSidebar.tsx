import { MonitorSmartphone, Smartphone, Laptop } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TransferDevice } from '@/types/transfer';
import { cn } from '@/lib/utils';

interface DeviceSidebarProps {
  isRunning: boolean;
  devices: TransferDevice[];
  selectedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
}

function getDeviceIcon(type: string) {
  const t = type.toLowerCase();
  if (t.includes('ios') || t.includes('android')) return <Smartphone size={20} />;
  if (t.includes('mac') || t.includes('windows') || t.includes('linux')) return <Laptop size={20} />;
  return <MonitorSmartphone size={20} />;
}

export function DeviceSidebar({ isRunning, devices, selectedDeviceId, onSelect }: DeviceSidebarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
      {devices.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground/60 flex flex-col items-center gap-3 mt-10">
          <MonitorSmartphone size={32} className="opacity-20" />
          <p>{isRunning ? t('transfer.waitingConnection') : t('transfer.sidebarIdleBody')}</p>
        </div>
      ) : (
        <div className="flex flex-col py-2">
          {devices.map((device) => {
            const selected = selectedDeviceId === device.id;
            return (
              <button
                key={device.id}
                onClick={() => onSelect(device.id)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer border-l-2",
                  selected ? "bg-secondary border-primary" : "border-transparent hover:bg-secondary/50"
                )}
              >
                <div className={cn("w-10 h-10 rounded-md flex items-center justify-center shrink-0", selected ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground")}>
                  {getDeviceIcon(device.deviceType)}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-foreground truncate">{device.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground truncate">{device.ipAddress}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}