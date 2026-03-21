import { AlertTriangle, ChevronDown, Loader2, ShieldAlert, Square, SquareTerminal } from 'lucide-react';
import { useExecStore } from '@/store/useExecStore';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { formatExecStateLabel } from '@/lib/exec/format';
import { ChatToolCallTrace } from '@/lib/llm';

interface ExecSessionCardProps {
  toolCallId: string;
  call?: ChatToolCallTrace;
}

function formatDuration(durationMs?: number): string | null {
  if (!durationMs || durationMs < 0) return null;
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function isBlockedPreview(value?: string): boolean {
  if (!value) return false;
  return /\bblocked\b|拦截|阻止/.test(value.toLowerCase());
}

export function ExecSessionCard({ toolCallId, call }: ExecSessionCardProps) {
  const { t } = useTranslation();
  const sessionId = useExecStore((state) => state.toolCallToSessionId[toolCallId]);
  const session = useExecStore((state) => (sessionId ? state.sessions[sessionId] : undefined));
  const pending = useExecStore((state) => state.pendingByToolCallId[toolCallId]);
  const terminateSession = useExecStore((state) => state.terminateSession);

  if (!session && !pending && !call) {
    return null;
  }

  const fallbackCommand = pending?.command || call?.argumentsPreview || call?.name || '';
  const fallbackOutput = [pending?.reason, call?.resultPreview, call?.warnings?.join('\n')]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join('\n')
    .trim();
  const isPendingApproval = !session && Boolean(pending);
  const isFallbackRunning = !session && !isPendingApproval && call?.status === 'running';
  const isBlocked = !session && !isPendingApproval && call?.status === 'error' && isBlockedPreview(call.resultPreview);
  const isRunning = session?.state === 'running';
  const isFailed = session
    ? session.state === 'failed'
    : !isPendingApproval && !isBlocked && call?.status === 'error';
  const isTerminated = session?.state === 'terminated';
  const output = session
    ? (session.combinedOutput || [session.stdout.trim(), session.stderr.trim()].filter(Boolean).join('\n')).trim()
    : fallbackOutput;
  const duration = formatDuration(session?.durationMs ?? call?.durationMs);
  const blockTone = isRunning || isFallbackRunning || isPendingApproval
    ? 'border-amber-500/20 bg-amber-500/5'
    : isBlocked
      ? 'border-orange-500/20 bg-orange-500/5'
      : isFailed || isTerminated
        ? 'border-rose-500/20 bg-rose-500/5'
        : 'border-border/50 bg-background/35';
  const statusLabel = isPendingApproval
    ? t('spotlight.execApprovalRequired')
    : isBlocked
      ? t('spotlight.execBlocked')
      : session
        ? formatExecStateLabel(t, session.state)
        : isFallbackRunning
          ? t('spotlight.toolRunning')
          : call?.status === 'success'
            ? t('spotlight.toolCompleted')
            : t('spotlight.toolFailed');
  const command = session?.command || fallbackCommand;
  const workdir = session?.workdir || pending?.workdir;

  return (
    <details className={cn('group overflow-hidden rounded-xl border text-xs', blockTone)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 marker:hidden">
        <ChevronDown size={14} className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
        {isPendingApproval ? (
          <ShieldAlert size={12} className="shrink-0 text-amber-300" />
        ) : isRunning || isFallbackRunning ? (
          <Loader2 size={12} className="shrink-0 animate-spin text-amber-400" />
        ) : isBlocked ? (
          <AlertTriangle size={12} className="shrink-0 text-orange-300" />
        ) : isFailed || isTerminated ? (
          <AlertTriangle size={12} className="shrink-0 text-rose-400" />
        ) : (
          <SquareTerminal size={12} className="shrink-0 text-emerald-400" />
        )}
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('spotlight.toolInlineShell')}
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/90">
          {command}
        </code>
        <span
          className={cn(
            'shrink-0 text-[10px] uppercase tracking-wide',
            isPendingApproval || isRunning || isFallbackRunning
              ? 'text-amber-300'
              : isBlocked
                ? 'text-orange-300'
                : isFailed || isTerminated
                ? 'text-rose-300'
                : 'text-emerald-300',
          )}
        >
          {statusLabel}
        </span>
        {duration && (
          <span className="shrink-0 text-[10px] text-muted-foreground/70">
            {duration}
          </span>
        )}
        {session && isRunning && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void terminateSession(session.id);
            }}
            className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-md border border-rose-500/35 bg-rose-500/12 px-2 py-1 text-[10px] font-medium text-rose-200 hover:bg-rose-500/20"
          >
            <Square size={10} />
            {t('spotlight.execTerminate')}
          </button>
        )}
      </summary>

      <div className="space-y-2 border-t border-border/40 px-3 py-3">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
            {t('spotlight.toolInlineCommand')}
          </div>
          <code className="block whitespace-pre-wrap break-all rounded-lg bg-black/20 px-2.5 py-2 font-mono text-[11px] leading-5 text-foreground/90">
            $ {command}
          </code>
        </div>

        {workdir && (
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              {t('spotlight.execWorkingDirectory')}
            </div>
            <code className="block whitespace-pre-wrap break-all rounded-lg bg-black/20 px-2.5 py-2 font-mono text-[11px] leading-5 text-foreground/90">
              {workdir}
            </code>
          </div>
        )}

        {output && (
          <div>
            <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">
              {t('spotlight.toolInlineOutput')}
            </div>
            <pre className="max-h-56 overflow-auto rounded-lg bg-black/30 px-2.5 py-2 text-[11px] leading-relaxed text-foreground/85 whitespace-pre-wrap break-words">
              {output}
            </pre>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {typeof session?.exitCode === 'number' && (
            <span className="text-[10px] text-muted-foreground/70">
              exit {session.exitCode}
            </span>
          )}
        </div>
      </div>
    </details>
  );
}
