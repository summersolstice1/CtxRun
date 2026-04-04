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
      <div className="h-full rounded-[28px] border border-white/10 bg-[#0a1527]/82 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl">
        <div className="border-b border-white/10 px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                {t('transfer.connectedDevices')}
              </div>
              <div className="mt-1 text-lg font-semibold text-slate-50">{devices.length}</div>
            </div>
            <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 p-3 text-cyan-200">
              <MonitorSmartphone size={18} />
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
          {devices.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-white/12 bg-white/[0.03] p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl border border-cyan-400/15 bg-cyan-500/10 p-3 text-cyan-200">
                  {isRunning ? <Orbit size={18} /> : <Sparkles size={18} />}
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-50">
                    {isRunning ? t('transfer.sidebarWaitingTitle') : t('transfer.sidebarIdleTitle')}
                  </div>
                  <div className="mt-1 text-sm leading-6 text-slate-400">
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
                        ? 'border-cyan-300/35 bg-[linear-gradient(135deg,rgba(34,211,238,0.16),rgba(14,116,144,0.08))] shadow-[0_14px_40px_rgba(34,211,238,0.12)]'
                        : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                    )}
                  >
                    <div className="pointer-events-none absolute inset-y-4 left-0 w-px bg-gradient-to-b from-transparent via-cyan-300/75 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100" />

                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-semibold',
                          selected
                            ? 'border-cyan-300/25 bg-cyan-500/15 text-cyan-100'
                            : 'border-white/10 bg-black/20 text-slate-200'
                        )}
                      >
                        <MonitorSmartphone size={16} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="truncate text-sm font-semibold text-slate-50">{device.name}</div>
                          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(74,222,128,0.75)]" />
                        </div>

                        <div className="mt-1 truncate text-xs uppercase tracking-[0.18em] text-slate-500">
                          {device.deviceType}
                        </div>

                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
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
