import { useState, useEffect, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  BatteryCharging,
  Clock3,
  Cpu,
  Gauge,
  HardDrive,
  HeartPulse,
  PlugZap,
  ShieldCheck,
  User,
  XCircle,
  Zap,
} from 'lucide-react';
import { useConfirmStore } from '@/store/useConfirmStore';
import { useTranslation } from 'react-i18next';
import { cn, formatBytes } from '@/lib/utils';
import { BatteryMetrics, ProcessInfo, SystemMetrics } from '@/types/monitor';
import { Toast, ToastType } from '@/components/ui/Toast';

function formatWatts(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(value >= 10 ? 0 : 1)} W`;
}

function formatMinutes(value: number | null | undefined, t: (key: string, options?: Record<string, unknown>) => string) {
  if (value == null || !Number.isFinite(value) || value <= 0) return t('monitor.batteryUnavailable');

  const rounded = Math.round(value);
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;

  if (hours > 0 && minutes > 0) {
    return t('monitor.batteryTimeHoursMinutes', { hours, minutes });
  }
  if (hours > 0) {
    return t('monitor.batteryTimeHours', { hours });
  }
  return t('monitor.batteryTimeMinutes', { minutes: Math.max(minutes, 1) });
}

function formatCapacity(current: number | null | undefined, full: number | null | undefined, t: (key: string) => string) {
  if (current == null || full == null || !Number.isFinite(current) || !Number.isFinite(full)) {
    return t('monitor.batteryUnavailable');
  }
  return `${current.toFixed(1)} / ${full.toFixed(1)} Wh`;
}

function formatVolts(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${value.toFixed(2)} V`;
}

function batteryStateLabel(state: string, t: (key: string) => string) {
  switch (state) {
    case 'charging':
      return t('monitor.batteryStateCharging');
    case 'discharging':
      return t('monitor.batteryStateDischarging');
    case 'full':
      return t('monitor.batteryStateFull');
    case 'empty':
      return t('monitor.batteryStateEmpty');
    default:
      return t('monitor.batteryStateUnknown');
  }
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '';
}

interface MetricCardProps {
  icon: ReactNode;
  label: string;
  value: string;
  subValue: string;
  percent: number;
  color: string;
}

export function MonitorDashboard() {
  const { t } = useTranslation();
  const confirm = useConfirmStore();
  
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [toast, setToast] = useState<{show: boolean, msg: string, type: ToastType}>({ show: false, msg: '', type: 'success' });

  const fetchMetrics = async () => {
    try {
      const data = await invoke<SystemMetrics>('get_system_metrics');
      setMetrics(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProcesses = async () => {
    try {
      const data = await invoke<ProcessInfo[]>('get_top_processes');
      setProcesses(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchMetrics();
    fetchProcesses();

    const metricTimer = setInterval(fetchMetrics, 2000);
    const procTimer = setInterval(fetchProcesses, 3000);

    return () => {
      clearInterval(metricTimer);
      clearInterval(procTimer);
    };
  }, []);

  const handleKillProcess = async (proc: ProcessInfo) => {
      if (proc.is_system) return;

      const confirmed = await confirm.ask({
          title: t('monitor.confirmKill'),
          message: t('monitor.killMsg', { name: proc.name, pid: proc.pid.toString() }),
          type: 'danger',
          confirmText: t('monitor.kill'),
          cancelText: t('prompts.cancel')
      });

      if (!confirmed) return;

      try {
          await invoke('kill_process', { pid: proc.pid });
          setToast({ show: true, msg: t('monitor.killSuccess'), type: 'success' });
          fetchProcesses(); // 立即刷新
      } catch (err: unknown) {
          console.error(err);
          const detail = getErrorMessage(err);
          setToast({
            show: true,
            msg: detail ? t('monitor.killFailedWithReason', { reason: detail }) : t('monitor.killFailed'),
            type: 'error',
          });
      }
  };

  return (
    <div className="h-full min-h-0 overflow-y-auto p-6">
      <div className="flex min-h-full flex-col gap-6 animate-in fade-in duration-300">
      
        {/* 顶部指标卡片 */}
        <div className={cn(
          "grid gap-4 shrink-0",
          metrics?.battery ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4" : "grid-cols-1 sm:grid-cols-2",
        )}>
            <MetricCard
              icon={<Cpu className="text-blue-500" />}
              label={t('monitor.cpu')}
              value={`${(metrics?.cpu_usage ?? 0).toFixed(1)}%`}
              subValue={t('monitor.totalLoad')}
              percent={metrics?.cpu_usage ?? 0}
              color="bg-blue-500"
            />
          <MetricCard
            icon={<HardDrive className="text-purple-500" />}
            label={t('monitor.memory')} 
            value={metrics ? formatBytes(metrics.memory_used) : '...'} 
            subValue={metrics ? `/ ${formatBytes(metrics.memory_total)}` : ''}
            percent={metrics ? (metrics.memory_used / metrics.memory_total) * 100 : 0}
            color="bg-purple-500"
          />
          {metrics?.battery && (
            <>
              <MetricCard
                icon={<BatteryCharging className="text-emerald-500" />}
                label={t('monitor.battery')}
                value={`${metrics.battery.percent.toFixed(0)}%`}
                subValue={batteryStateLabel(metrics.battery.state, t)}
                percent={metrics.battery.percent}
                color="bg-emerald-500"
              />
              <MetricCard
                icon={<PlugZap className="text-amber-500" />}
                label={t('monitor.powerRate')}
                value={formatWatts(metrics.battery.power_watts)}
                subValue={
                  metrics.battery.health_percent != null
                    ? t('monitor.batteryHealthValue', { value: metrics.battery.health_percent.toFixed(0) })
                    : t('monitor.batteryUnavailable')
                }
                percent={metrics.battery.health_percent ?? 0}
                color="bg-amber-500"
              />
            </>
          )}
        </div>

        {metrics && <BatteryOverview battery={metrics.battery} />}

        {/* 进程列表 */}
        <div className="flex min-h-[320px] flex-1 flex-col bg-secondary/20 rounded-xl border border-border overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-border/50 flex justify-between items-center bg-secondary/10 shrink-0">
             <h3 className="font-semibold text-sm flex items-center gap-2">
               <Zap size={16} className="text-orange-500" />
               {t('monitor.topProcesses')}
             </h3>
             <span className="text-[10px] text-muted-foreground bg-secondary px-2 py-0.5 rounded">
               {t('monitor.autoRefresh')}
             </span>
          </div>
          
          <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
             <table className="w-full text-left text-xs">
               <thead className="bg-secondary/30 text-muted-foreground font-medium sticky top-0 backdrop-blur-md z-10">
                 <tr>
                   <th className="px-4 py-2 w-16">{t('monitor.procPid')}</th>
                   <th className="px-4 py-2">{t('monitor.procName')}</th>
                   <th className="px-4 py-2 w-24 hidden sm:table-cell">{t('monitor.procUser')}</th>
                   <th className="px-4 py-2 w-20 text-right">{t('monitor.procCpu')}</th>
                   <th className="px-4 py-2 w-24 text-right">{t('monitor.procMem')}</th>
                   <th className="px-4 py-2 w-10"></th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-border/30">
                 {processes.map((proc) => (
                   <tr key={proc.pid} className={cn("hover:bg-secondary/40 transition-colors group", proc.is_system && "opacity-75 bg-secondary/5")}>
                     <td className="px-4 py-2 font-mono opacity-70">{proc.pid}</td>
                     <td className="px-4 py-2 font-medium">
                        <div className="flex items-center gap-2 max-w-[180px]">
                          <span className="truncate" title={proc.name}>{proc.name}</span>
                          {proc.is_system && (
                              <div title={t('monitor.systemProcess')}>
                                  <ShieldCheck size={12} className="text-green-500 shrink-0" />
                              </div>
                          )}
                        </div>
                     </td>
                     <td className="px-4 py-2 hidden sm:table-cell text-muted-foreground truncate max-w-[100px]" title={proc.user}>
                        <div className="flex items-center gap-1.5">
                          <User size={10} className="opacity-50" />
                          {proc.user}
                        </div>
                     </td>
                     <td className="px-4 py-2 text-right font-mono text-blue-500">{proc.cpu_usage.toFixed(1)}%</td>
                     <td className="px-4 py-2 text-right font-mono text-purple-500">{formatBytes(proc.memory)}</td>
                     <td className="px-4 py-2 text-center">
                        {!proc.is_system && (
                            <button
                              onClick={() => handleKillProcess(proc)}
                              className="p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded transition-colors opacity-0 group-hover:opacity-100"
                              title={t('monitor.kill')}
                            >
                                <XCircle size={14} />
                            </button>
                        )}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
          </div>
        </div>

        <Toast show={toast.show} message={toast.msg} type={toast.type} onDismiss={() => setToast(prev => ({...prev, show: false}))} />
      </div>
    </div>
  );
}

function BatteryOverview({ battery }: { battery: BatteryMetrics | null }) {
  const { t } = useTranslation();

  if (!battery) {
    return (
      <div className="shrink-0 rounded-xl border border-dashed border-border bg-card/70 px-4 py-3 text-sm text-muted-foreground shadow-sm">
        {t('monitor.noBatteryDetected')}
      </div>
    );
  }

  const timeLabel =
    battery.state === 'charging' ? t('monitor.batteryTimeToFull') : t('monitor.batteryTimeRemaining');
  const timeValue =
    battery.state === 'charging'
      ? formatMinutes(battery.time_to_full_minutes, t)
      : formatMinutes(battery.time_to_empty_minutes, t);
  const capacityValue = formatCapacity(battery.energy_wh, battery.energy_full_wh, t);
  const modelText = [battery.vendor, battery.model].filter(Boolean).join(' · ');

  return (
    <div className="shrink-0 rounded-xl border border-border bg-card/80 p-4 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t('monitor.powerOverview')}</h3>
            <p className="text-xs text-muted-foreground">
              {batteryStateLabel(battery.state, t)}
              {battery.battery_count > 1 ? ` · ${t('monitor.batteryPackCount', { count: battery.battery_count })}` : ''}
            </p>
          </div>
          {modelText && <div className="text-xs text-muted-foreground">{modelText}</div>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <BatteryStat
            icon={<PlugZap size={14} className="text-amber-500" />}
            label={t('monitor.powerRate')}
            value={formatWatts(battery.power_watts)}
          />
          <BatteryStat
            icon={<HeartPulse size={14} className="text-emerald-500" />}
            label={t('monitor.batteryHealth')}
            value={
              battery.health_percent != null
                ? `${battery.health_percent.toFixed(0)}%`
                : t('monitor.batteryUnavailable')
            }
          />
          <BatteryStat
            icon={<Clock3 size={14} className="text-blue-500" />}
            label={timeLabel}
            value={timeValue}
          />
          <BatteryStat
            icon={<Gauge size={14} className="text-indigo-500" />}
            label={t('monitor.batteryVoltage')}
            value={formatVolts(battery.voltage_volts)}
          />
          <BatteryStat
            icon={<BatteryCharging size={14} className="text-fuchsia-500" />}
            label={t('monitor.batteryCapacity')}
            value={capacityValue}
          />
          <BatteryStat
            icon={<Zap size={14} className="text-orange-500" />}
            label={t('monitor.batteryCycles')}
            value={
              battery.cycle_count != null ? battery.cycle_count.toString() : t('monitor.batteryUnavailable')
            }
          />
        </div>
      </div>
    </div>
  );
}

function BatteryStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/10 px-3 py-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        {icon}
        <span className="leading-none">{label}</span>
      </div>
      <div className="text-[17px] font-semibold leading-tight text-foreground sm:text-[20px]">
        {value}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, subValue, percent, color }: MetricCardProps) {
  return (
    <div className="bg-card border border-border p-5 rounded-xl shadow-sm flex min-h-[170px] flex-col">
       <div className="flex items-center gap-2 text-muted-foreground">
          <span className="shrink-0">{icon}</span>
          <span className="text-[13px] font-semibold leading-tight" style={{ wordBreak: 'keep-all' }}>
            {label}
          </span>
       </div>
       <div className="mt-4 text-[34px] font-bold leading-none tracking-tight text-foreground tabular-nums whitespace-nowrap">
         {value}
       </div>
        
        <div className="mt-auto w-full h-2 bg-secondary rounded-full overflow-hidden">
          <div 
            className={cn("h-full transition-all duration-500", color)} 
            style={{ width: `${Math.min(Math.max(percent, 0), 100)}%` }} 
          />
        </div>
       <div className="mt-3 text-xs text-right text-muted-foreground">{subValue}</div>
     </div>
  )
}
