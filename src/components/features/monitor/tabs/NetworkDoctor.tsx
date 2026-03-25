import { type ReactNode, startTransition, useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Globe,
  Radar,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Toast, ToastType } from '@/components/ui/Toast';
import {
  runMlabSpeedTest,
  SpeedTestPhase,
  SpeedTestSnapshot,
} from '@/components/features/monitor/network/mlabSpeedTest';
import {
  NetworkDiagnosticsReport,
  NetworkHealthStatus,
  NetworkProbeResult,
} from '@/types/monitor';
import { cn } from '@/lib/utils';

const POLICY_STORAGE_KEY = 'ctxrun.monitor.network.mlab-policy.v1';
const SPEED_CACHE_STORAGE_KEY = 'ctxrun.monitor.network.last-speed.v1';
const MAX_SPEED_CHART_POINTS = 120;

type SpeedViewState = SpeedTestSnapshot & {
  error: string | null;
};

type CachedSpeedResult = {
  completedAt: string;
  downloadMbps: number | null;
  uploadMbps: number | null;
  serverLabel: string | null;
  serverLocation: string | null;
};

type SpeedChartPoint = {
  phase: SpeedTestPhase;
  downloadMbps: number | null;
  uploadMbps: number | null;
};

const DEFAULT_SPEED_STATE: SpeedViewState = {
  phase: 'idle',
  downloadMbps: null,
  uploadMbps: null,
  serverLabel: null,
  serverLocation: null,
  error: null,
};

export function NetworkDoctor() {
  const { t } = useTranslation();
  const [report, setReport] = useState<NetworkDiagnosticsReport | null>(null);
  const [activeView, setActiveView] = useState<'speed' | 'diagnostics'>('speed');
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [speedState, setSpeedState] = useState<SpeedViewState>(DEFAULT_SPEED_STATE);
  const [speedRunning, setSpeedRunning] = useState(false);
  const [speedHistory, setSpeedHistory] = useState<SpeedChartPoint[]>([]);
  const [lastSpeedResult, setLastSpeedResult] = useState<CachedSpeedResult | null>(readCachedSpeedResult);
  const [customTarget, setCustomTarget] = useState('');
  const [customProbe, setCustomProbe] = useState<NetworkProbeResult | null>(null);
  const [customProbeLoading, setCustomProbeLoading] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(readPolicyAcceptance);
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: ToastType }>({
    show: false,
    msg: '',
    type: 'success',
  });

  const runDiagnosis = async () => {
    setDiagnosticsLoading(true);
    try {
      const nextReport = await invoke<NetworkDiagnosticsReport>('diagnose_network');
      startTransition(() => setReport(nextReport));
    } catch (error) {
      setToast({
        show: true,
        msg: t('common.errorMsg', { msg: String(error) }),
        type: 'error',
      });
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const runSpeedTest = async () => {
    if (!policyAccepted) {
      setToast({
        show: true,
        msg: t('monitor.netConsentRequired'),
        type: 'warning',
      });
      return;
    }

    setSpeedRunning(true);
    setSpeedHistory([]);
    setSpeedState({
      ...DEFAULT_SPEED_STATE,
      phase: 'discovering',
    });

    try {
      const completedAt = new Date().toISOString();
      const result = await runMlabSpeedTest({
        onMeasurement: (snapshot) => {
          setSpeedHistory((prev) => appendSpeedHistory(prev, snapshot));
          setSpeedState((prev) => ({
            ...prev,
            ...snapshot,
            error: null,
          }));
        },
      });

      setSpeedState({
        phase: result.phase,
        downloadMbps: result.downloadMbps,
        uploadMbps: result.uploadMbps,
        serverLabel: result.serverLabel,
        serverLocation: result.serverLocation,
        error: null,
      });

      const cached: CachedSpeedResult = {
        completedAt,
        downloadMbps: result.downloadMbps,
        uploadMbps: result.uploadMbps,
        serverLabel: result.serverLabel,
        serverLocation: result.serverLocation,
      };

      setLastSpeedResult(cached);
      writeCachedSpeedResult(cached);
    } catch (error) {
      setSpeedState((prev) => ({
        ...prev,
        phase: 'error',
        error: String(error),
      }));
      setToast({
        show: true,
        msg: t('common.errorMsg', { msg: String(error) }),
        type: 'error',
      });
    } finally {
      setSpeedRunning(false);
    }
  };

  const runCustomProbe = async () => {
    if (!customTarget.trim()) {
      setToast({
        show: true,
        msg: t('monitor.netCustomTargetRequired'),
        type: 'warning',
      });
      return;
    }

    setCustomProbeLoading(true);
    try {
      const probe = await invoke<NetworkProbeResult>('probe_network_target', {
        url: customTarget,
      });
      startTransition(() => setCustomProbe(probe));
    } catch (error) {
      setToast({
        show: true,
        msg: t('common.errorMsg', { msg: String(error) }),
        type: 'error',
      });
    } finally {
      setCustomProbeLoading(false);
    }
  };

  useEffect(() => {
    void runDiagnosis();
  }, []);

  const overallStatus = report?.summary.overall_status ?? 'offline';
  const ping = report?.ping ?? null;
  const displayedProbes = customProbe ? [customProbe, ...(report?.probes ?? [])] : (report?.probes ?? []);
  const displayDownloadMbps = speedState.downloadMbps ?? lastSpeedResult?.downloadMbps ?? null;
  const displayUploadMbps = speedState.uploadMbps ?? lastSpeedResult?.uploadMbps ?? null;
  const chartDownloadMbps = speedRunning ? speedState.downloadMbps : displayDownloadMbps;
  const chartUploadMbps = speedRunning ? speedState.uploadMbps : displayUploadMbps;
  const displayServerLabel = speedState.serverLabel ?? lastSpeedResult?.serverLabel ?? null;
  const displayPhase = speedState.phase === 'idle' && lastSpeedResult ? 'complete' : speedState.phase;
  const summaryCountsText = report
    ? t('monitor.netSummaryCounts', {
        healthy: report.summary.healthy_count,
        degraded: report.summary.degraded_count,
        offline: report.summary.offline_count,
      })
    : diagnosticsLoading
      ? t('monitor.diagnosing')
      : t('common.loading');
  const speedOverviewText =
    speedState.phase === 'error'
      ? t(speedPhaseLabelKey(speedState.phase))
      : speedRunning
        ? speedState.downloadMbps != null || speedState.uploadMbps != null
          ? formatSpeedPair(speedState.downloadMbps, speedState.uploadMbps)
          : t(speedPhaseLabelKey(speedState.phase))
        : displayDownloadMbps != null || displayUploadMbps != null
          ? formatSpeedPair(displayDownloadMbps, displayUploadMbps)
          : t(speedPhaseLabelKey(displayPhase));
  const downloadSeries = extractSpeedSeries(speedHistory, 'downloadMbps', ['download', 'complete']);
  const uploadSeries = extractSpeedSeries(speedHistory, 'uploadMbps', ['upload', 'complete']);

  return (
    <div className="h-full flex flex-col overflow-hidden animate-in fade-in duration-300">
      <div className="shrink-0 border-b border-border bg-secondary/5 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <Radar size={18} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground">{t('monitor.navNetwork')}</h3>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <StatusPill status={overallStatus} label={t(statusLabelKey(overallStatus))} />
                <InlineSummaryStat label={t('monitor.netSummary')} value={summaryCountsText} />
                <InlineSummaryStat label={t('monitor.netSpeedTest')} value={speedOverviewText} />
                <InlineSummaryStat
                  label={t('monitor.netPing')}
                  value={ping?.avg_ms != null ? formatMs(ping.avg_ms) : t('monitor.netUnavailable')}
                />
                {lastSpeedResult ? (
                  <InlineSummaryStat
                    label={t('monitor.netLastCompleted')}
                    value={formatDateTime(lastSpeedResult.completedAt)}
                  />
                ) : null}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ViewSwitchButton
                active={activeView === 'speed'}
                onClick={() => setActiveView('speed')}
                icon={<Gauge size={14} />}
                label={t('monitor.netSpeedTest')}
              />
              <ViewSwitchButton
                active={activeView === 'diagnostics'}
                onClick={() => setActiveView('diagnostics')}
                icon={<Search size={14} />}
                label={t('monitor.netDetailedProbes')}
              />
            </div>
          </div>

          <button
            onClick={runDiagnosis}
            disabled={diagnosticsLoading}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-xs font-medium shadow-sm transition-colors hover:bg-secondary disabled:opacity-50"
          >
            <RefreshCw size={14} className={cn(diagnosticsLoading && 'animate-spin')} />
            {diagnosticsLoading ? t('monitor.diagnosing') : t('monitor.refresh')}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-5 py-5">
        {activeView === 'speed' ? (
          <div className="h-full overflow-y-auto custom-scrollbar pr-1">
            <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <Globe size={16} />
                    {t('monitor.netSpeedTest')}
                  </div>
                </div>
                <button
                  onClick={runSpeedTest}
                disabled={speedRunning}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <Activity size={14} className={cn(speedRunning && 'animate-pulse')} />
                {speedRunning ? t('monitor.netSpeedRunning') : t('monitor.netRunSpeedTest')}
              </button>
            </div>

            <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_320px]">
              <div className="space-y-5">
                <div
                  className="rounded-2xl border border-border bg-background/70 p-5"
                  role="img"
                  aria-label={t('monitor.netRealtimeChart')}
                >
                  <div className="space-y-6">
                    <SpeedStripRow
                      title={t('monitor.netDownload')}
                      value={formatMbps(chartDownloadMbps)}
                      colorClass="text-blue-500"
                      strokeColor="#3b82f6"
                      fillColor="rgba(59,130,246,0.12)"
                      values={downloadSeries}
                    />
                    <SpeedStripRow
                      title={t('monitor.netUpload')}
                      value={formatMbps(chartUploadMbps)}
                      colorClass="text-emerald-500"
                      strokeColor="#10b981"
                      fillColor="rgba(16,185,129,0.12)"
                      values={uploadSeries}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <section className="rounded-2xl border border-border bg-background/70 p-5">
                  <div className="text-sm font-semibold text-foreground">{t('monitor.netSummary')}</div>
                  <div className="mt-4 space-y-3">
                    <KeyValueRow
                      label={t('monitor.netServer')}
                      value={
                        [displayServerLabel, speedState.serverLocation ?? lastSpeedResult?.serverLocation]
                          .filter(Boolean)
                          .join(' · ') || t('monitor.netPending')
                      }
                    />
                    <KeyValueRow label={t('monitor.netPhase')} value={t(speedPhaseLabelKey(displayPhase))} />
                    <KeyValueRow
                      label={t('monitor.netPing')}
                      value={ping?.avg_ms != null ? formatMs(ping.avg_ms) : t('monitor.netUnavailable')}
                    />
                    <KeyValueRow
                      label={t('monitor.netProbeTarget')}
                      value={ping?.target ?? t('monitor.netUnavailable')}
                    />
                    <KeyValueRow
                      label={t('monitor.netLastCompleted')}
                      value={lastSpeedResult ? formatDateTime(lastSpeedResult.completedAt) : t('monitor.netPending')}
                    />
                  </div>
                </section>

                <section className="rounded-2xl border border-border bg-background/70 p-5">
                  <label className="flex cursor-pointer items-start gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-border"
                      checked={policyAccepted}
                      onChange={(event) => updatePolicyAcceptance(event.target.checked, setPolicyAccepted)}
                    />
                    <span className="space-y-1">
                      <span className="block font-medium text-foreground">{t('monitor.netConsentTitle')}</span>
                      <span className="block text-xs leading-5 text-muted-foreground">
                        {t('monitor.netConsentBody')}{' '}
                        <a
                          href="https://www.measurementlab.net/privacy/"
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary underline-offset-4 hover:underline"
                        >
                          {t('monitor.netPolicyLink')}
                        </a>
                      </span>
                    </span>
                  </label>
                </section>
              </div>
            </div>
            </section>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3">
            <section className="shrink-0 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm">
              <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
                <div className="text-sm font-semibold text-foreground">{t('monitor.netDetailedProbes')}</div>
                <div className="flex w-full flex-col gap-2.5 sm:flex-row xl:max-w-[700px]">
                  <input
                    value={customTarget}
                    onChange={(event) => setCustomTarget(event.target.value)}
                    placeholder={t('monitor.netCustomTargetPlaceholder')}
                    className="h-10 flex-1 rounded-xl border border-border bg-background px-3.5 text-sm text-foreground outline-none transition-colors focus:border-primary"
                  />
                  <button
                    onClick={runCustomProbe}
                    disabled={customProbeLoading}
                    className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold shadow-sm transition-colors hover:bg-secondary disabled:opacity-60"
                  >
                    <Search size={16} className={cn(customProbeLoading && 'animate-pulse')} />
                    {customProbeLoading ? t('monitor.netCustomTargetRunning') : t('monitor.netCustomTargetProbe')}
                  </button>
                </div>
              </div>
            </section>

            <section className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="h-full overflow-auto custom-scrollbar">
                {diagnosticsLoading && !report ? (
                  <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground opacity-60">
                    <Activity size={32} className="animate-pulse" />
                    <span className="text-sm">{t('monitor.diagnosing')}</span>
                  </div>
                ) : (
                  <table className="w-full min-w-[980px] table-fixed text-sm">
                    <colgroup>
                      <col className="w-[31%]" />
                      <col className="w-[10%]" />
                      <col className="w-[8%]" />
                      <col className="w-[8%]" />
                      <col className="w-[8%]" />
                      <col className="w-[8%]" />
                      <col className="w-[7%]" />
                      <col className="w-[20%]" />
                    </colgroup>
                    <thead className="sticky top-0 z-10 bg-secondary/80 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground backdrop-blur">
                      <tr>
                        <th className="px-4 py-2.5 text-left">{t('monitor.netProbeTarget')}</th>
                        <th className="px-3 py-2.5 text-left">{t('monitor.netStatus')}</th>
                        <th className="px-3 py-2.5 text-right">{t('monitor.netDns')}</th>
                        <th className="px-3 py-2.5 text-right">{t('monitor.netTcp')}</th>
                        <th className="px-3 py-2.5 text-right">{t('monitor.netHttp')}</th>
                        <th className="px-3 py-2.5 text-right">{t('monitor.netLatency')}</th>
                        <th className="px-3 py-2.5 text-right">{t('monitor.netCode')}</th>
                        <th className="px-4 py-2.5 text-left">{t('monitor.netObservations')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40">
                      {displayedProbes.map((probe) => (
                        <ProbeRow key={probe.id} probe={probe} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      <Toast
        show={toast.show}
        message={toast.msg}
        type={toast.type}
        onDismiss={() => setToast((prev) => ({ ...prev, show: false }))}
      />
    </div>
  );
}

function ProbeRow({ probe }: { probe: NetworkProbeResult }) {
  const { t } = useTranslation();
  const tone = toneClass(probe.status);
  const targetMeta = [probe.host, probe.ip_addresses.join(', ')].filter(Boolean).join(' · ');
  const observationsText =
    probe.observations.length > 0
      ? probe.observations.map((observation) => t(observationLabelKey(observation))).join(' · ')
      : t('monitor.netNoObservations');

  return (
    <tr
      className={cn(
        'align-top transition-colors hover:bg-secondary/25',
        probe.status === 'offline' && 'bg-destructive/5 hover:bg-destructive/10',
      )}
      >
      <td className="px-4 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="max-w-[220px] truncate text-[13px] font-medium text-foreground" title={probe.name}>
              {probe.name}
            </div>
            <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {probe.category}
            </span>
          </div>
          <div className="mt-0.5 max-w-[320px] truncate text-[10px] text-muted-foreground" title={targetMeta}>
            {targetMeta}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className={tone.icon}>{statusIcon(probe.status)}</span>
          <span className={cn('text-xs font-semibold', tone.text)}>{t(statusLabelKey(probe.status))}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-muted-foreground">{formatMs(probe.dns_ms)}</td>
      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-muted-foreground">{formatMs(probe.tcp_ms)}</td>
      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-muted-foreground">{formatMs(probe.http_ms)}</td>
      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-muted-foreground">{formatMs(probe.total_ms)}</td>
      <td className="px-3 py-2.5 text-right font-mono text-[11px] text-muted-foreground">{probe.status_code ?? '-'}</td>
      <td className="px-4 py-2.5">
        <div className="truncate text-[11px] text-muted-foreground" title={observationsText}>
          {observationsText}
        </div>
      </td>
    </tr>
  );
}

function StatusPill({
  status,
  label,
}: {
  status: NetworkHealthStatus;
  label?: string;
}) {
  const classes = toneClass(status);
  const dotClass =
    status === 'healthy' ? 'bg-emerald-500' : status === 'degraded' ? 'bg-yellow-500' : 'bg-destructive';

  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium', classes.bg, classes.text)}>
      <span className={cn('h-2.5 w-2.5 rounded-full', dotClass)} />
      {label ?? status}
    </span>
  );
}

function InlineSummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[120px]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function ViewSwitchButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-medium transition-colors',
        active
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border bg-background text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function KeyValueRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-3 last:border-b-0 last:pb-0">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</span>
      <span className="max-w-[60%] break-words text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function SpeedStripRow({
  title,
  value,
  values,
  colorClass,
  strokeColor,
  fillColor,
}: {
  title: string;
  value: string;
  values: number[];
  colorClass: string;
  strokeColor: string;
  fillColor: string;
}) {
  return (
    <div className="grid items-center gap-4 md:grid-cols-[140px_minmax(0,1fr)]">
      <div className="flex flex-col justify-center">
        <div className="text-sm text-muted-foreground">{title}</div>
        <div className={cn('mt-2 text-4xl font-semibold tracking-tight', colorClass)}>{value}</div>
      </div>
      <SpeedStripChart values={values} strokeColor={strokeColor} fillColor={fillColor} />
    </div>
  );
}

function SpeedStripChart({
  values,
  strokeColor,
  fillColor,
}: {
  values: number[];
  strokeColor: string;
  fillColor: string;
}) {
  const width = 780;
  const height = 140;
  const paddingX = 12;
  const paddingY = 12;
  const gridColumns = 16;
  const gridRows = 6;
  const maxValue = Math.max(10, ...values) * 1.08;
  const linePath = buildStripLinePath(values, width, height, paddingX, paddingY, maxValue);
  const areaPath = buildStripAreaPath(values, width, height, paddingX, paddingY, maxValue);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-slate-50/[0.02]">
      <svg viewBox={`0 0 ${width} ${height}`} className="block h-32 w-full" aria-hidden="true">
        {Array.from({ length: gridRows + 1 }, (_, index) => {
          const y = paddingY + ((height - paddingY * 2) / gridRows) * index;
          return (
            <line
              key={`row-${index}`}
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
              stroke="rgba(148,163,184,0.12)"
              strokeWidth="1"
            />
          );
        })}
        {Array.from({ length: gridColumns + 1 }, (_, index) => {
          const x = paddingX + ((width - paddingX * 2) / gridColumns) * index;
          return (
            <line
              key={`col-${index}`}
              x1={x}
              y1={paddingY}
              x2={x}
              y2={height - paddingY}
              stroke="rgba(148,163,184,0.08)"
              strokeWidth="1"
            />
          );
        })}
        {areaPath ? <path d={areaPath} fill={fillColor} /> : null}
        {linePath ? (
          <path
            d={linePath}
            fill="none"
            stroke={strokeColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
      </svg>
    </div>
  );
}

function toneClass(status: NetworkHealthStatus) {
  if (status === 'healthy') {
    return {
      bg: 'bg-emerald-500/10',
      text: 'text-emerald-600',
      icon: 'text-emerald-600',
    };
  }
  if (status === 'degraded') {
    return {
      bg: 'bg-yellow-500/10',
      text: 'text-yellow-600',
      icon: 'text-yellow-600',
    };
  }
  return {
    bg: 'bg-destructive/10',
    text: 'text-destructive',
    icon: 'text-destructive',
  };
}

function statusIcon(status: NetworkHealthStatus) {
  if (status === 'healthy') {
    return <CheckCircle2 size={16} />;
  }
  if (status === 'degraded') {
    return <AlertTriangle size={16} />;
  }
  return <XCircle size={16} />;
}

function statusLabelKey(status: NetworkHealthStatus) {
  switch (status) {
    case 'healthy':
      return 'monitor.netHealthy';
    case 'degraded':
      return 'monitor.netDegraded';
    case 'offline':
      return 'monitor.netOffline';
  }
}

function speedPhaseLabelKey(phase: SpeedTestPhase) {
  switch (phase) {
    case 'discovering':
      return 'monitor.netPhaseDiscovering';
    case 'download':
      return 'monitor.netPhaseDownload';
    case 'upload':
      return 'monitor.netPhaseUpload';
    case 'complete':
      return 'monitor.netPhaseComplete';
    case 'error':
      return 'monitor.netPhaseError';
    case 'idle':
    default:
      return 'monitor.netPhaseIdle';
  }
}

function observationLabelKey(code: string) {
  switch (code) {
    case 'dns_resolution_failed':
      return 'monitor.netObservationDnsFailed';
    case 'dns_latency_high':
      return 'monitor.netObservationDnsSlow';
    case 'tcp_connect_failed':
      return 'monitor.netObservationTcpFailed';
    case 'tcp_latency_high':
      return 'monitor.netObservationTcpSlow';
    case 'http_request_failed':
      return 'monitor.netObservationHttpFailed';
    case 'http_error_status':
      return 'monitor.netObservationHttpStatus';
    case 'http_latency_high':
      return 'monitor.netObservationHttpSlow';
    case 'invalid_target_url':
      return 'monitor.netObservationInvalidTarget';
    default:
      return 'monitor.netObservationGeneric';
  }
}

function formatSpeedPair(download: number | null, upload: number | null) {
  const downloadText = download != null ? download.toFixed(2) : '-';
  const uploadText = upload != null ? upload.toFixed(2) : '-';
  return `${downloadText} / ${uploadText} Mbps`;
}

function formatMbps(value: number | null) {
  return value != null ? `${value.toFixed(2)} Mbps` : '-';
}

function formatMs(value: number | null | undefined) {
  return value != null ? `${value.toFixed(0)} ms` : '-';
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function appendSpeedHistory(history: SpeedChartPoint[], snapshot: SpeedTestSnapshot) {
  if (snapshot.phase !== 'download' && snapshot.phase !== 'upload' && snapshot.phase !== 'complete') {
    return history;
  }

  const next: SpeedChartPoint = {
    phase: snapshot.phase,
    downloadMbps: snapshot.downloadMbps,
    uploadMbps: snapshot.uploadMbps,
  };
  const previous = history[history.length - 1];

  if (
    previous &&
    previous.phase === next.phase &&
    previous.downloadMbps === next.downloadMbps &&
    previous.uploadMbps === next.uploadMbps
  ) {
    return history;
  }

  const trimmed =
    history.length >= MAX_SPEED_CHART_POINTS ? history.slice(history.length - MAX_SPEED_CHART_POINTS + 1) : history;

  return [...trimmed, next];
}

function extractSpeedSeries(
  history: SpeedChartPoint[],
  key: 'downloadMbps' | 'uploadMbps',
  phases: SpeedTestPhase[],
) {
  return history
    .filter((point) => phases.includes(point.phase))
    .map((point) => point[key])
    .filter((value): value is number => value != null && Number.isFinite(value));
}

function buildStripLinePath(
  values: number[],
  width: number,
  height: number,
  paddingX: number,
  paddingY: number,
  maxValue: number,
) {
  const points = buildStripPoints(values, width, height, paddingX, paddingY, maxValue);
  if (points.length === 0) {
    return '';
  }

  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function buildStripAreaPath(
  values: number[],
  width: number,
  height: number,
  paddingX: number,
  paddingY: number,
  maxValue: number,
) {
  const points = buildStripPoints(values, width, height, paddingX, paddingY, maxValue);
  if (points.length === 0) {
    return '';
  }

  const baseY = height - paddingY;
  const linePath = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];

  return `${linePath} L ${lastPoint.x} ${baseY} L ${firstPoint.x} ${baseY} Z`;
}

function buildStripPoints(
  values: number[],
  width: number,
  height: number,
  paddingX: number,
  paddingY: number,
  maxValue: number,
) {
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingY * 2;
  const divisor = Math.max(values.length - 1, 1);

  return values.map((value, index) => ({
    x: paddingX + (index / divisor) * innerWidth,
    y: paddingY + (1 - value / maxValue) * innerHeight,
  }));
}

function readPolicyAcceptance() {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(POLICY_STORAGE_KEY) === 'true';
}

function readCachedSpeedResult(): CachedSpeedResult | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const raw = window.localStorage.getItem(SPEED_CACHE_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CachedSpeedResult;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.completedAt !== 'string' ||
      !isNullableFiniteNumber(parsed.downloadMbps) ||
      !isNullableFiniteNumber(parsed.uploadMbps) ||
      !isNullableString(parsed.serverLabel) ||
      !isNullableString(parsed.serverLocation)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedSpeedResult(result: CachedSpeedResult) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(SPEED_CACHE_STORAGE_KEY, JSON.stringify(result));
  }
}

function updatePolicyAcceptance(
  accepted: boolean,
  setPolicyAccepted: (accepted: boolean) => void,
) {
  setPolicyAccepted(accepted);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(POLICY_STORAGE_KEY, accepted ? 'true' : 'false');
  }
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value == null || (typeof value === 'number' && Number.isFinite(value));
}

function isNullableString(value: unknown): value is string | null {
  return value == null || typeof value === 'string';
}
