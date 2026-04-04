import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckCheck,
  ChevronDown,
  Copy,
  FolderDown,
  Link2,
  Loader2,
  QrCode,
  Radio,
  Shield,
  Square,
  Wifi,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ServiceInfo } from '@/types/transfer';
import { Button } from '@/components/ui/button';
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

function formatServiceInfo(serviceInfo: ServiceInfo | null) {
  if (!serviceInfo) {
    return null;
  }

  try {
    const parsed = new URL(serviceInfo.url);
    return {
      host: parsed.hostname,
      port: parsed.port || String(serviceInfo.port),
      route: parsed.pathname,
    };
  } catch {
    return {
      host: serviceInfo.bindAddress,
      port: String(serviceInfo.port),
      route: '/',
    };
  }
}

export function ServiceControls({
  isRunning,
  isBusy,
  serviceInfo,
  copied,
  devicesCount,
  onStart,
  onStop,
  onCopyUrl,
}: ServiceControlsProps) {
  const { t } = useTranslation();
  const [detailsOpen, setDetailsOpen] = useState(true);

  useEffect(() => {
    setDetailsOpen(Boolean(serviceInfo));
  }, [serviceInfo?.url]);

  const details = useMemo(() => formatServiceInfo(serviceInfo), [serviceInfo]);
  const modeLabel = serviceInfo?.urlMode === 'fixed' ? t('transfer.fixedLink') : t('transfer.randomLink');

  return (
    <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-[#091323]/85 shadow-[0_28px_80px_rgba(0,0,0,0.36)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.22),transparent_34%),radial-gradient(circle_at_right,rgba(59,130,246,0.12),transparent_26%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />

      <div className="relative px-5 py-5 md:px-6 md:py-6">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em]',
                    isRunning
                      ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200'
                      : 'border-white/10 bg-white/5 text-slate-300'
                  )}
                >
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      isRunning ? 'bg-emerald-400 shadow-[0_0_14px_rgba(74,222,128,0.85)]' : 'bg-slate-500'
                    )}
                  />
                  {isRunning ? t('transfer.ready') : t('transfer.offline')}
                </span>

                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/15 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-100">
                  <Shield size={12} />
                  {t('transfer.secureLocal')}
                </span>

                {isRunning && (
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-slate-300">
                    <Wifi size={12} />
                    {devicesCount} · {t('transfer.connectedDevices')}
                  </span>
                )}
              </div>

              <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-500/12 text-cyan-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                      <Radio size={20} />
                    </div>
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight text-slate-50 md:text-[2rem]">
                        {t('transfer.title')}
                      </h2>
                      <p className="mt-1 text-sm text-slate-400 md:text-[15px]">{t('transfer.subtitle')}</p>
                    </div>
                  </div>

                {serviceInfo && (
                  <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-slate-300/75">
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                      <Link2 size={12} />
                      {details?.host}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                      {t('transfer.port')}: {details?.port}
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                      {modeLabel}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col items-stretch gap-3 sm:flex-row xl:items-center">
              {serviceInfo && (
                <Button
                  variant="outline"
                  onClick={() => setDetailsOpen((open) => !open)}
                  className="h-11 gap-2 rounded-2xl border-white/10 bg-white/[0.04] px-4 text-slate-100 hover:border-cyan-300/30 hover:bg-cyan-500/10 hover:text-cyan-50"
                >
                  <QrCode size={15} />
                  {detailsOpen ? t('transfer.hideDetails') : t('transfer.showDetails')}
                  <ChevronDown
                    size={15}
                    className={cn('transition-transform duration-200', detailsOpen && 'rotate-180')}
                  />
                </Button>
              )}

              {isRunning ? (
                <Button
                  variant="destructive"
                  onClick={onStop}
                  disabled={isBusy}
                  className="h-11 gap-2 rounded-2xl border border-red-400/20 bg-red-500/90 px-5 text-white shadow-[0_14px_40px_rgba(239,68,68,0.28)] hover:bg-red-500"
                >
                  {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Square size={14} fill="currentColor" />}
                  {t('transfer.stop')}
                </Button>
              ) : (
                <Button
                  onClick={onStart}
                  disabled={isBusy}
                  className="h-11 gap-2 rounded-2xl border border-cyan-300/15 bg-cyan-500 px-5 text-slate-950 shadow-[0_18px_50px_rgba(56,189,248,0.36)] hover:bg-cyan-400"
                >
                  {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Radio size={15} />}
                  {t('transfer.start')}
                </Button>
              )}
            </div>
          </div>

          <AnimatePresence initial={false}>
            {serviceInfo && detailsOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0, y: -10 }}
                animate={{ height: 'auto', opacity: 1, y: 0 }}
                exit={{ height: 0, opacity: 0, y: -10 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <div className="grid gap-4 rounded-[28px] border border-white/10 bg-black/15 p-4 md:p-5 xl:grid-cols-[minmax(0,1.45fr)_280px]">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-100">
                      <CheckCheck size={16} className="text-cyan-300" />
                      {t('transfer.sessionDetails')}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                          {t('transfer.address')}
                        </div>
                        <div className="mt-3 break-all font-mono text-sm text-slate-100">{details?.host}</div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                          {t('transfer.route')}
                        </div>
                        <div className="mt-3 break-all font-mono text-sm text-slate-100">{details?.route}</div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:col-span-2 xl:col-span-1">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                          {t('transfer.linkMode')}
                        </div>
                        <div className="mt-3 text-sm text-slate-100">{modeLabel}</div>
                      </div>
                    </div>

                    <div className="rounded-[24px] border border-cyan-400/12 bg-gradient-to-br from-cyan-500/[0.10] via-white/[0.04] to-transparent p-4 md:p-5">
                      <div className="space-y-4">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-100/75">
                          {t('transfer.serviceUrl')}
                        </div>

                        <div className="flex flex-col gap-3 md:flex-row md:items-center">
                          <div
                            className="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-2xl border border-white/10 bg-black/20 px-4 py-3 font-mono text-sm leading-6 text-slate-50"
                            title={serviceInfo.url}
                          >
                            {serviceInfo.url}
                          </div>

                          <Button
                            variant="outline"
                            onClick={onCopyUrl}
                            className="h-11 shrink-0 gap-2 rounded-2xl border-white/10 bg-white/[0.05] px-4 text-slate-100 hover:border-cyan-300/30 hover:bg-cyan-500/10 hover:text-cyan-50"
                          >
                            <Copy size={14} />
                            {copied ? t('transfer.copied') : t('transfer.copyUrl')}
                          </Button>
                        </div>

                        <div className="flex items-start gap-3 text-sm text-slate-300/78">
                          <FolderDown size={16} className="mt-0.5 shrink-0 text-cyan-200" />
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                              {t('transfer.saveDir')}
                            </div>
                            <div className="mt-1 truncate" title={serviceInfo.saveDir}>
                              {serviceInfo.saveDir}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-400">
                          QR
                        </div>
                      </div>
                      <div className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-100">
                        {t('transfer.secureLocal')}
                      </div>
                    </div>

                    <div className="mt-4 rounded-[24px] border border-white/10 bg-white p-4 text-slate-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                      <QrCodeSVG matrix={serviceInfo.qrMatrix} />
                    </div>

                    <div className="mt-4 h-1 rounded-full bg-gradient-to-r from-transparent via-cyan-300/25 to-transparent" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
