import { useEffect, useRef, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExecApprovalStore } from '@/store/useExecApprovalStore';

export function ExecApprovalSheet() {
  const { t } = useTranslation();
  const pending = useExecApprovalStore((state) => state.pending);
  const resolve = useExecApprovalStore((state) => state.resolve);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const rejectInputRef = useRef<HTMLInputElement | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  const submitReject = () => {
    const note = rejectNote.trim();
    resolve(note ? { decision: 'reject', note } : { decision: 'reject' });
  };

  useEffect(() => {
    if (!pending) return;
    surfaceRef.current?.focus();
    setRejectNote('');
    setIsRejecting(false);
  }, [pending?.toolCallId]);

  useEffect(() => {
    if (!isRejecting) return;
    rejectInputRef.current?.focus();
  }, [isRejecting]);

  if (!pending) {
    return null;
  }

  const hasPrefixRule = Boolean(pending.approval.prefixRule && pending.approval.prefixRule.length > 0);

  return (
    <div className="fixed inset-x-0 top-0 z-[1004] h-[33vh] min-h-[180px] max-h-[280px] pointer-events-none">
      <div className="absolute inset-x-0 top-[4.1rem] flex justify-center px-3 sm:px-4">
        <div
          ref={surfaceRef}
          tabIndex={-1}
          onKeyDown={(event) => {
            event.stopPropagation();
            const target = event.target;
            const isTextInput = target instanceof HTMLInputElement;
            if (event.key === 'Escape') {
              event.preventDefault();
              submitReject();
              return;
            }
            if (isTextInput) {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitReject();
              }
              return;
            }
            if (event.key === '1') {
              event.preventDefault();
              resolve('once');
              return;
            }
            if (event.key === '2') {
              event.preventDefault();
              resolve('session');
              return;
            }
            if (event.key === '3') {
              event.preventDefault();
              if (isRejecting) {
                submitReject();
              } else {
                setIsRejecting(true);
              }
              return;
            }
            if (event.key === '4' && hasPrefixRule) {
              event.preventDefault();
              resolve('prefix_rule');
            }
          }}
          className="pointer-events-auto w-full max-w-[760px] overflow-hidden rounded-2xl border border-border/70 bg-popover/97 shadow-[0_16px_40px_rgba(0,0,0,0.30)] ring-1 ring-black/20 backdrop-blur-xl outline-none animate-in fade-in slide-in-from-top-2 duration-150"
        >
          <div className="border-b border-border/50 px-4 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground/80">
                <ShieldAlert size={13} className="text-primary" />
                <span>{t('spotlight.execApproveTitle')}</span>
              </div>
              <div className="text-[11px] text-muted-foreground/70">
                {t('spotlight.execEscCancel')}
              </div>
            </div>
          </div>

          <div className="px-4 py-3">
            <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70">
                  {t('spotlight.execCommand')}
                </span>
                <code
                  className="min-w-0 flex-1 truncate font-mono text-[13px] leading-5 text-foreground"
                  title={pending.request.command}
                >
                  {pending.request.command}
                </code>
                <div
                  className="hidden min-w-0 max-w-[280px] items-center gap-1 rounded-md border border-border/40 bg-black/10 px-2 py-1 sm:flex"
                  title={pending.approval.workdir}
                >
                  <span className="shrink-0 text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
                    {t('spotlight.execWorkingDirectory')}
                  </span>
                  <code className="truncate text-[11px] text-foreground/75">
                    {pending.approval.workdir}
                  </code>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border/50 bg-secondary/10 px-4 py-2.5">
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setIsRejecting(false);
                  setRejectNote('');
                  resolve('once');
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-primary px-2 py-1.5 text-[11px] font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-black/15 px-1 text-[9px] font-semibold">
                  1
                </span>
                {t('spotlight.execAllowOnce')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsRejecting(false);
                  setRejectNote('');
                  resolve('session');
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/50 px-2 py-1.5 text-[11px] text-foreground hover:bg-secondary/50"
              >
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-secondary/70 px-1 text-[9px] font-semibold text-muted-foreground">
                  2
                </span>
                {t('spotlight.execAllowSession')}
              </button>
              <button
                type="button"
                onClick={() => setIsRejecting((current) => !current)}
                className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/50 px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary/50"
              >
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-secondary/70 px-1 text-[9px] font-semibold text-muted-foreground">
                  3
                </span>
                {t('spotlight.execDeny')}
              </button>
              {hasPrefixRule && (
                <button
                  type="button"
                  onClick={() => {
                    setIsRejecting(false);
                    setRejectNote('');
                    resolve('prefix_rule');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200 hover:bg-amber-500/20"
                >
                  <span className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-black/10 px-1 text-[9px] font-semibold">
                    4
                  </span>
                  {t('spotlight.execAllowPrefix')}
                </button>
              )}
            </div>

            {isRejecting && (
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  ref={rejectInputRef}
                  type="text"
                  value={rejectNote}
                  onChange={(event) => setRejectNote(event.target.value)}
                  placeholder={t('spotlight.execRejectNotePlaceholder')}
                  className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background/60 px-3 py-1.5 text-[12px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsRejecting(false);
                    setRejectNote('');
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/50 px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-secondary/50"
                >
                  {t('spotlight.execRejectBack')}
                </button>
                <button
                  type="button"
                  onClick={submitReject}
                  className="inline-flex items-center justify-center rounded-lg border border-border/60 bg-background/70 px-2.5 py-1.5 text-[11px] text-foreground hover:bg-secondary/50"
                >
                  {t('spotlight.execDeny')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
