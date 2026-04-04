import { MonitorSmartphone, Orbit, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TransferDevice } from '@/types/transfer';
import { cn } from '@/lib/utils';

interface DeviceSidebarProps {
  isRunning: boolean;
  devices: TransferDevice[];
  selectedDeviceId: string | null;
  onSelect: (deviceId: string) => void;
}

function formatConnectedTime(timestampMs: number) {
  return new Date(timestampMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DeviceSidebar({
  isRunning,
  devices,
  selectedDeviceId,
  onSelect,
}: DeviceSidebarProps) {
  const { t } = useTranslation();

  return (
    <aside className="flex w-full shrink-0 flex-col xl:w-[320px]">
      <div className="h-full rounded-[28px] border border-border/70 bg-background/80 shadow-[0_22px_60px_rgba(148,163,184,0.15)] backdrop-blur-xl dark:border-white/10 dark:bg-[#0a1527]/82 dark:shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <div className="border-b border-border/60 px-4 py-4 dark:border-white/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground dark:text-slate-400">
                {t('transfer.connectedDevices')}
              </div>
              <div className="mt-1 text-lg font-semibold text-foreground dark:text-slate-50">{devices.length}</div>
            </div>
            <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/10 p-3 text-cyan-700 dark:border-cyan-400/15 dark:text-cyan-200">
              <MonitorSmartphone size={18} />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {devices.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-border/60 bg-background/60 p-4 dark:border-white/12 dark:bg-white/[0.03]">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/10 p-3 text-cyan-700 dark:border-cyan-400/15 dark:text-cyan-200">
                  {isRunning ? <Orbit size={18} /> : <Sparkles size={18} />}
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground dark:text-slate-50">
                    {isRunning ? t('transfer.sidebarWaitingTitle') : t('transfer.sidebarIdleTitle')}
                  </div>
                  <div className="mt-1 text-sm leading-6 text-muted-foreground dark:text-slate-400">
                    {isRunning ? t('transfer.sidebarWaitingBody') : t('transfer.sidebarIdleBody')}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {devices.map((device) => {
                const selected = selectedDeviceId === device.id;

                return (
                  <button
                    key={device.id}
                    type="button"
                    onClick={() => onSelect(device.id)}
                    className={cn(
                      'group relative w-full overflow-hidden rounded-[24px] border px-4 py-4 text-left transition-all duration-200',
                      selected
                        ? 'border-cyan-500/30 bg-[linear-gradient(135deg,rgba(6,182,212,0.12),rgba(255,255,255,0.94))] shadow-[0_14px_40px_rgba(14,165,233,0.12)] dark:border-cyan-300/35 dark:bg-[linear-gradient(135deg,rgba(34,211,238,0.16),rgba(14,116,144,0.08))] dark:shadow-[0_14px_40px_rgba(34,211,238,0.12)]'
                        : 'border-border/60 bg-background/60 hover:border-border/80 hover:bg-background/78 dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:bg-white/[0.05]'
                    )}
                  >
                    <div className="pointer-events-none absolute inset-y-4 left-0 w-px bg-gradient-to-b from-transparent via-cyan-500/70 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 dark:via-cyan-300/75" />

                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold',
                          selected
                            ? 'border-cyan-500/20 bg-cyan-500/10 text-cyan-700 dark:border-cyan-300/25 dark:bg-cyan-500/15 dark:text-cyan-100'
                            : 'border-border/60 bg-white/70 text-foreground dark:border-white/10 dark:bg-black/20 dark:text-slate-200'
                        )}
                      >
                        <MonitorSmartphone size={16} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-semibold text-foreground dark:text-slate-50">{device.name}</div>
                          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.75)]" />
                        </div>

                        <div className="mt-1 truncate text-xs uppercase tracking-[0.18em] text-muted-foreground dark:text-slate-500">
                          {device.deviceType}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground dark:text-slate-400">
                          <span className="truncate">{device.ipAddress}</span>
                          <span className="shrink-0">
                            {t('transfer.connectedSince', { time: formatConnectedTime(device.connectedAtMs) })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
