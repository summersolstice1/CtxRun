import { AlertTriangle, ChevronDown, Loader2, Square, SquareTerminal } from 'lucide-react';
import { useExecStore } from '@/store/useExecStore';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { formatExecStateLabel } from '@/lib/exec/format';

interface ExecSessionCardProps {
  toolCallId: string;
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

export function ExecSessionCard({ toolCallId }: ExecSessionCardProps) {
  const { t } = useTranslation();
  const sessionId = useExecStore((state) => state.toolCallToSessionId[toolCallId]);
  const session = useExecStore((state) => (sessionId ? state.sessions[sessionId] : undefined));
  const terminateSession = useExecStore((state) => state.terminateSession);

  if (!session) {
    return null;
  }

  const isRunning = session.state === 'running';
  const isFailed = session.state === 'failed';
  const isTerminated = session.state === 'terminated';
  const output = (session.combinedOutput || [session.stdout.trim(), session.stderr.trim()].filter(Boolean).join('\n')).trim();
  const duration = formatDuration(session.durationMs);
  const blockTone = isRunning
    ? 'border-amber-500/20 bg-amber-500/5'
    : isFailed || isTerminated
      ? 'border-rose-500/20 bg-rose-500/5'
      : 'border-border/50 bg-background/35';

  return (
    <details className={cn('group overflow-hidden rounded-xl border text-xs', blockTone)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 marker:hidden">
        <ChevronDown size={14} className="shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
        {isRunning ? (
          <Loader2 size={12} className="shrink-0 animate-spin text-amber-400" />
        ) : isFailed || isTerminated ? (
          <AlertTriangle size={12} className="shrink-0 text-rose-400" />
        ) : (
          <SquareTerminal size={12} className="shrink-0 text-emerald-400" />
        )}
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('spotlight.toolInlineShell')}
        </span>
        <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-foreground/90">
          {session.command}
        </code>
        <span
          className={cn(
            'shrink-0 text-[10px] uppercase tracking-wide',
            isRunning
              ? 'text-amber-300'
              : isFailed || isTerminated
                ? 'text-rose-300'
                : 'text-emerald-300',
          )}
        >
          {formatExecStateLabel(t, session.state)}
        </span>
        {duration && (
          <span className="shrink-0 text-[10px] text-muted-foreground/70">
            {duration}
          </span>
        )}
        {isRunning && (
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
            $ {session.command}
          </code>
        </div>

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
          {typeof session.exitCode === 'number' && (
            <span className="text-[10px] text-muted-foreground/70">
              exit {session.exitCode}
            </span>
          )}
        </div>
      </div>
    </details>
  );
}
