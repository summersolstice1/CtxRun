import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Download,
  BatteryCharging,
  ChevronDown,
  ChevronUp,
  Clock3,
  Cpu,
  Gauge,
  HardDrive,
  HeartPulse,
  Network,
  PlugZap,
  ShieldCheck,
  Upload,
  User,
  XCircle,
  Zap,
} from 'lucide-react';
import { useConfirmStore } from '@/store/useConfirmStore';
import { useTranslation } from 'react-i18next';
import { cn, formatBytes, formatBytesPerSecond } from '@/lib/utils';
import {
  BatteryMetrics,
  DiskSummary,
  NetworkInterfaceSummary,
  ProcessInfo,
  SystemMetrics,
  SystemSummary,
} from '@/types/monitor';
import { Toast, ToastType } from '@/components/ui/Toast';

type NetworkRateSnapshot = {
  received_bytes_per_sec: number;
  transmitted_bytes_per_sec: number;
};

type DecoratedNetworkInterface = NetworkInterfaceSummary & {
  is_virtual: boolean;
  has_routable_address: boolean;
  has_traffic: boolean;
};

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

function diskKindLabel(kind: string, t: (key: string) => string) {
  switch (kind) {
    case 'SSD':
      return t('monitor.diskTypeSSD');
    case 'HDD':
      return t('monitor.diskTypeHDD');
    default:
      return t('monitor.diskTypeUnknown');
  }
}

function hasRoutableAddress(network: NetworkInterfaceSummary) {
  return network.ip_networks.some((entry) => {
    const normalized = entry.trim().toLowerCase();
    return (
      normalized.length > 0 &&
      !normalized.startsWith('127.') &&
      !normalized.startsWith('::1') &&
      !normalized.startsWith('fe80:')
    );
  });
}

function networkConnectionStatusLabel(status: string, t: (key: string) => string) {
  switch (status) {
    case 'connected':
      return t('monitor.adapterStatusConnected');
    case 'disconnected':
      return t('monitor.adapterStatusDisconnected');
    case 'testing':
      return t('monitor.adapterStatusTesting');
    case 'dormant':
      return t('monitor.adapterStatusDormant');
    case 'not_present':
      return t('monitor.adapterStatusNotPresent');
    case 'lower_layer_down':
      return t('monitor.adapterStatusLowerLayerDown');
    default:
      return t('monitor.adapterStatusUnknown');
  }
}

function networkInterfaceTypeLabel(type: string, t: (key: string) => string) {
  switch (type) {
    case 'wifi':
      return t('monitor.adapterTypeWifi');
    case 'ethernet':
      return t('monitor.adapterTypeEthernet');
    case 'loopback':
      return t('monitor.adapterTypeLoopback');
    case 'tunnel':
      return t('monitor.adapterTypeTunnel');
    default:
      return t('monitor.adapterTypeOther');
  }
}

function decorateInterface(entry: NetworkInterfaceSummary): DecoratedNetworkInterface {
  return {
    ...entry,
    has_routable_address: hasRoutableAddress(entry),
    has_traffic: entry.received_bytes_per_sec > 0 || entry.transmitted_bytes_per_sec > 0,
  };
}

function pickVisibleInterfaces(interfaces: DecoratedNetworkInterface[]) {
  const decorated = [...interfaces];

  const preferred = decorated.filter(
    (entry) =>
      entry.connection_status === 'connected' && !entry.is_virtual && entry.has_routable_address,
  );
  const secondary = decorated.filter(
    (entry) => entry.connection_status === 'connected' && !entry.is_virtual,
  );
  const fallback = decorated.filter((entry) => entry.has_routable_address);

  const selected =
    preferred.length > 0
      ? preferred
      : secondary.length > 0
        ? secondary
        : fallback.length > 0
          ? fallback
          : decorated;

  return selected
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((entry) => entry);
}

function getErrorMessage(error: unknown) {
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '';
}

function formatTextValue(value: string | null | undefined) {
  if (!value || !value.trim()) return '--';
  return value;
}

function formatUptime(seconds: number, t: (key: string, options?: Record<string, unknown>) => string) {
  if (!Number.isFinite(seconds) || seconds <= 0) return t('monitor.uptimeLessThanMinute');

  const totalMinutes = Math.floor(seconds / 60);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return t('monitor.uptimeDaysHours', { days, hours });
  }
  if (hours > 0) {
    return t('monitor.uptimeHoursMinutes', { hours, minutes });
  }
  return t('monitor.uptimeMinutes', { minutes: Math.max(minutes, 1) });
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
  const askForConfirmation = useConfirmStore((state) => state.ask);
  
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [smoothedNetworkRates, setSmoothedNetworkRates] = useState<Record<string, NetworkRateSnapshot>>({});
  const [showAllInterfaces, setShowAllInterfaces] = useState(false);
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

  useEffect(() => {
    const interfaces = metrics?.network_interfaces ?? [];

    if (interfaces.length === 0) {
      setSmoothedNetworkRates({});
      return;
    }

    setSmoothedNetworkRates((previous) => {
      const next: Record<string, NetworkRateSnapshot> = {};

      for (const entry of interfaces) {
        const prior = previous[entry.name];
        next[entry.name] = prior
          ? {
              received_bytes_per_sec: Math.round(
                prior.received_bytes_per_sec * 0.6 + entry.received_bytes_per_sec * 0.4,
              ),
              transmitted_bytes_per_sec: Math.round(
                prior.transmitted_bytes_per_sec * 0.6 + entry.transmitted_bytes_per_sec * 0.4,
              ),
            }
          : {
              received_bytes_per_sec: entry.received_bytes_per_sec,
              transmitted_bytes_per_sec: entry.transmitted_bytes_per_sec,
            };
      }

      return next;
    });
  }, [metrics?.network_interfaces]);

  const handleKillProcess = async (proc: ProcessInfo) => {
      if (proc.is_system) return;

      const confirmed = await askForConfirmation({
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

  const decoratedInterfaces = useMemo(
    () =>
      (metrics?.network_interfaces ?? [])
        .map((entry) => ({
          ...entry,
          received_bytes_per_sec:
            smoothedNetworkRates[entry.name]?.received_bytes_per_sec ?? entry.received_bytes_per_sec,
          transmitted_bytes_per_sec:
            smoothedNetworkRates[entry.name]?.transmitted_bytes_per_sec ??
            entry.transmitted_bytes_per_sec,
        }))
        .map(decorateInterface)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [metrics?.network_interfaces, smoothedNetworkRates],
  );

  const visibleInterfaces = useMemo(
    () => pickVisibleInterfaces(decoratedInterfaces),
    [decoratedInterfaces],
  );

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
            percent={metrics && metrics.memory_total > 0 ? (metrics.memory_used / metrics.memory_total) * 100 : 0}
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
        {metrics && <SystemSummaryPanel summary={metrics.summary} />}

        {metrics && (
          <div className="grid shrink-0 gap-6 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <DiskOverviewPanel disks={metrics.disks} />
            <NetworkInterfacesPanel
              interfaces={visibleInterfaces}
              allInterfaces={decoratedInterfaces}
              showAllInterfaces={showAllInterfaces}
              onToggleAllInterfaces={() => setShowAllInterfaces((current) => !current)}
            />
          </div>
        )}

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

function SystemSummaryPanel({ summary }: { summary: SystemSummary }) {
  const { t } = useTranslation();

  const coreValue =
    summary.physical_core_count != null
      ? `${summary.physical_core_count} / ${summary.logical_core_count}`
      : `${summary.logical_core_count}`;

  return (
    <div className="shrink-0 rounded-xl border border-border bg-card/80 p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Cpu size={16} className="text-blue-500" />
        <h3 className="text-sm font-semibold text-foreground">{t('monitor.systemSummary')}</h3>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        <SummaryStat label={t('monitor.systemHost')} value={formatTextValue(summary.host_name)} />
        <SummaryStat label={t('monitor.systemOs')} value={formatTextValue(summary.os_version)} />
        <SummaryStat
          label={t('monitor.systemKernel')}
          value={formatTextValue(summary.kernel_version)}
        />
        <SummaryStat label={t('monitor.systemArch')} value={summary.cpu_arch} />
        <SummaryStat label={t('monitor.systemCores')} value={coreValue} />
        <SummaryStat
          label={t('monitor.systemUptime')}
          value={formatUptime(summary.uptime_seconds, t)}
        />
      </div>
    </div>
  );
}

function DiskOverviewPanel({ disks }: { disks: DiskSummary[] }) {
  const { t } = useTranslation();

  return (
    <div className="shrink-0 rounded-xl border border-border bg-card/80 p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <HardDrive size={16} className="text-purple-500" />
        <h3 className="text-sm font-semibold text-foreground">{t('monitor.diskOverview')}</h3>
      </div>

      {disks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-secondary/5 px-4 py-6 text-sm text-muted-foreground">
          {t('monitor.noDiskData')}
        </div>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {disks.map((disk) => (
            <div
              key={`${disk.mount_point}-${disk.name}`}
              className="rounded-lg border border-border/70 bg-secondary/10 px-3 py-3"
            >
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground" title={disk.mount_point}>
                    {disk.mount_point}
                  </div>
                  {disk.name !== disk.mount_point && (
                    <div className="truncate text-xs text-muted-foreground" title={disk.name}>
                      {disk.name}
                    </div>
                  )}
                </div>
                <span className="w-fit rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {diskKindLabel(disk.kind, t)}
                </span>
              </div>

              <div className="mb-2 h-2 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-purple-500 transition-all duration-500"
                  style={{ width: `${Math.min(Math.max(disk.used_percent, 0), 100)}%` }}
                />
              </div>

              <div className="mb-3 grid gap-1 text-xs text-muted-foreground">
                <span>{t('monitor.diskAvailable')}</span>
                <span className="break-words text-sm font-medium text-foreground">
                  {formatBytes(disk.available_space)} / {formatBytes(disk.total_space)}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                {disk.file_system && (
                  <span className="rounded-full bg-secondary px-2 py-0.5">{disk.file_system}</span>
                )}
                {disk.is_removable && (
                  <span className="rounded-full bg-secondary px-2 py-0.5">
                    {t('monitor.diskRemovable')}
                  </span>
                )}
                {disk.is_read_only && (
                  <span className="rounded-full bg-secondary px-2 py-0.5">
                    {t('monitor.diskReadOnly')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NetworkInterfacesPanel({
  interfaces,
  allInterfaces,
  showAllInterfaces,
  onToggleAllInterfaces,
}: {
  interfaces: DecoratedNetworkInterface[];
  allInterfaces: DecoratedNetworkInterface[];
  showAllInterfaces: boolean;
  onToggleAllInterfaces: () => void;
}) {
  const { t } = useTranslation();
  const primaryNames = useMemo(() => new Set(interfaces.map((entry) => entry.name)), [interfaces]);

  return (
    <div className="shrink-0 rounded-xl border border-border bg-card/80 p-4 shadow-sm">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Network size={16} className="text-emerald-500" />
          <h3 className="text-sm font-semibold text-foreground">{t('monitor.networkInterfaces')}</h3>
        </div>
        {allInterfaces.length > 0 && (
          <button
            type="button"
            onClick={onToggleAllInterfaces}
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border/70 bg-secondary/20 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
          >
            {showAllInterfaces ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showAllInterfaces
              ? t('monitor.hideAllAdapters')
              : t('monitor.showAllAdapters', { count: allInterfaces.length })}
          </button>
        )}
      </div>

      {interfaces.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-secondary/5 px-4 py-6 text-sm text-muted-foreground">
          {t('monitor.noNetworkInterfaces')}
        </div>
      ) : (
        <div className="grid gap-3">
          {interfaces.map((network) => (
            <div
              key={network.name}
              className="rounded-lg border border-border/70 bg-secondary/10 px-3 py-3"
            >
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <div className="truncate text-sm font-semibold text-foreground" title={network.name}>
                      {network.name}
                    </div>
                    <InterfaceBadge tone="primary" label={t('monitor.adapterPrimary')} />
                    {network.is_virtual && (
                      <InterfaceBadge tone="muted" label={t('monitor.adapterVirtual')} />
                    )}
                    <InterfaceBadge
                      tone={network.connection_status === 'connected' ? 'success' : 'muted'}
                      label={networkConnectionStatusLabel(network.connection_status, t)}
                    />
                  </div>
                  <div className="truncate text-xs text-muted-foreground" title={network.ip_networks.join(', ')}>
                    {network.ip_networks.length > 0
                      ? network.ip_networks.join(' · ')
                      : t('monitor.networkNoAddress')}
                  </div>
                </div>
              </div>

              <div className="mb-3 grid gap-2 xl:grid-cols-2">
                <RateStat
                  icon={<Download size={13} className="text-blue-500" />}
                  label={t('monitor.networkDownload')}
                  value={formatBytesPerSecond(network.received_bytes_per_sec)}
                />
                <RateStat
                  icon={<Upload size={13} className="text-emerald-500" />}
                  label={t('monitor.networkUpload')}
                  value={formatBytesPerSecond(network.transmitted_bytes_per_sec)}
                />
              </div>

              <div className="grid gap-2 text-xs text-muted-foreground xl:grid-cols-2">
                <SummaryInline
                  label={t('monitor.networkTotalReceived')}
                  value={formatBytes(network.total_received)}
                />
                <SummaryInline
                  label={t('monitor.networkTotalTransmitted')}
                  value={formatBytes(network.total_transmitted)}
                />
                <SummaryInline
                  label={t('monitor.networkMac')}
                  value={formatTextValue(network.mac_address)}
                />
                <SummaryInline
                  label={t('monitor.networkGateway')}
                  value={formatTextValue(network.default_gateway)}
                />
                <SummaryInline
                  label={t('monitor.networkType')}
                  value={networkInterfaceTypeLabel(network.interface_type, t)}
                />
                <SummaryInline label={t('monitor.networkMtu')} value={network.mtu.toString()} />
              </div>
            </div>
          ))}
        </div>
      )}

      {showAllInterfaces && allInterfaces.length > 0 && (
        <div className="mt-4 border-t border-border/60 pt-4">
          <div className="mb-3 text-xs font-medium text-muted-foreground">
            {t('monitor.allAdapters')}
          </div>
          <div className="grid gap-2">
            {allInterfaces.map((network) => (
              <div
                key={`all-${network.name}`}
                className="rounded-lg border border-border/70 bg-secondary/10 px-3 py-3"
              >
                <div className="mb-3 min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground" title={network.name}>
                      {network.name}
                    </span>
                    {primaryNames.has(network.name) && (
                      <InterfaceBadge tone="primary" label={t('monitor.adapterPrimary')} />
                    )}
                    {network.is_virtual && (
                      <InterfaceBadge tone="muted" label={t('monitor.adapterVirtual')} />
                    )}
                    <InterfaceBadge
                      tone={network.connection_status === 'connected' ? 'success' : 'muted'}
                      label={networkConnectionStatusLabel(network.connection_status, t)}
                    />
                    {network.has_traffic && (
                      <InterfaceBadge tone="success" label={t('monitor.adapterActive')} />
                    )}
                  </div>
                  <div
                    className="truncate text-xs text-muted-foreground"
                    title={network.ip_networks.join(', ')}
                  >
                    {network.ip_networks.length > 0
                      ? network.ip_networks.join(' · ')
                      : t('monitor.networkNoAddress')}
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  <SummaryTile
                    label={t('monitor.networkDownload')}
                    value={formatBytesPerSecond(network.received_bytes_per_sec)}
                  />
                  <SummaryTile
                    label={t('monitor.networkUpload')}
                    value={formatBytesPerSecond(network.transmitted_bytes_per_sec)}
                  />
                  <SummaryTile
                    label={t('monitor.networkMac')}
                    value={formatTextValue(network.mac_address)}
                  />
                  <SummaryTile
                    label={t('monitor.networkGateway')}
                    value={formatTextValue(network.default_gateway)}
                  />
                  <SummaryTile
                    label={t('monitor.networkType')}
                    value={networkInterfaceTypeLabel(network.interface_type, t)}
                  />
                  <SummaryTile label={t('monitor.networkMtu')} value={network.mtu.toString()} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
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

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-secondary/10 px-3 py-3">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-semibold text-foreground" title={value}>
        {value}
      </div>
    </div>
  );
}

function SummaryInline({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-secondary/20 px-2 py-1.5">
      <span className="min-w-0 truncate">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-foreground" title={value}>
        {value}
      </span>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary/20 px-3 py-2">
      <div className="mb-1 truncate text-[11px] font-medium text-muted-foreground" title={label}>
        {label}
      </div>
      <div className="truncate text-sm font-semibold text-foreground" title={value}>
        {value}
      </div>
    </div>
  );
}

function InterfaceBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'primary' | 'success' | 'muted';
}) {
  const toneClass =
    tone === 'primary'
      ? 'bg-emerald-500/15 text-emerald-400'
      : tone === 'success'
        ? 'bg-blue-500/15 text-blue-400'
        : 'bg-secondary text-muted-foreground';

  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', toneClass)}>
      {label}
    </span>
  );
}

function RateStat({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-secondary/20 px-2.5 py-2">
      <div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="truncate text-sm font-semibold text-foreground" title={value}>
        {value}
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
