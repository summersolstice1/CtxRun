import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Paperclip, SendHorizonal, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TransferDevice, TransferMessage } from '@/types/transfer';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ChatPanelProps {
  isRunning: boolean;
  isBusy: boolean;
  selectedDevice: TransferDevice | null;
  messages: TransferMessage[];
  onSendMessage: (content: string) => Promise<void>;
  onAttachFile: () => Promise<void>;
  onOpenFolder: (path: string) => Promise<void>;
}

function formatFileSize(value?: number | null) {
  if (!value) return '0 B';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatClock(timestampMs: number) {
  return new Date(timestampMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatPanel({
  isRunning,
  isBusy,
  selectedDevice,
  messages,
  onSendMessage,
  onAttachFile,
  onOpenFolder,
}: ChatPanelProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, selectedDevice?.id]);

  const handleSend = async () => {
    const next = draft.trim();
    if (!next || !selectedDevice) return;
    await onSendMessage(next);
    setDraft('');
  };

  const canInteract = Boolean(selectedDevice && isRunning && !isBusy);

  return (
    <section className="flex min-w-0 flex-1 flex-col rounded-[30px] border border-white/10 bg-[#081120]/80 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      {selectedDevice ? (
        <>
          <div className="border-b border-white/10 px-5 py-5 md:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-500/12 text-cyan-100">
                  {selectedDevice.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xl font-semibold text-slate-50">{selectedDevice.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
                    <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      {t('transfer.online')}
                    </span>
                    <span>{selectedDevice.ipAddress}</span>
                    <span className="text-slate-600">/</span>
                    <span className="uppercase tracking-[0.2em] text-slate-500">{selectedDevice.deviceType}</span>
                  </div>
                </div>
              </div>

              <div className="text-sm text-slate-400">
                {t('transfer.sessionWorkspace')} · {messages.length}
              </div>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="relative flex-1 overflow-y-auto px-4 py-5 custom-scrollbar md:px-6"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_34%)]" />

            <div className="relative space-y-4">
              {messages.length === 0 ? (
                <div className="flex min-h-[280px] items-center justify-center rounded-[28px] border border-dashed border-white/12 bg-white/[0.03] px-8 text-center">
                  <div className="max-w-md">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-500/10 text-cyan-100">
                      <Sparkles size={20} />
                    </div>
                    <div className="mt-4 text-lg font-semibold text-slate-50">{t('transfer.emptyChat')}</div>
                    <div className="mt-2 text-sm leading-7 text-slate-400">
                      {t('transfer.workspaceWaitingBody')}
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((message) => {
                  if (message.kind === 'system') {
                    return (
                      <div key={message.id} className="flex justify-center">
                        <div className="rounded-full border border-white/8 bg-white/[0.04] px-4 py-1.5 text-center text-xs tracking-[0.16em] text-slate-400">
                          {message.content}
                        </div>
                      </div>
                    );
                  }

                  const outgoing = message.direction === 'sent';
                  return (
                    <div key={message.id} className={cn('flex', outgoing ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[82%] rounded-[24px] border px-4 py-4 shadow-[0_14px_40px_rgba(0,0,0,0.18)]',
                          outgoing
                            ? 'border-cyan-300/15 bg-[linear-gradient(135deg,rgba(34,211,238,0.18),rgba(8,17,32,0.85))]'
                            : 'border-white/10 bg-white/[0.04]'
                        )}
                      >
                        {message.kind === 'text' ? (
                          <div className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-50">
                            {message.content}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex items-start gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-slate-200">
                                <Paperclip size={15} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-semibold text-slate-50">{message.fileName}</div>
                                <div className="mt-1 text-xs text-slate-400">
                                  {formatFileSize(message.fileSize)} ·{' '}
                                  {message.status ? t(`transfer.${message.status}`) : t('transfer.pending')}
                                </div>
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full bg-gradient-to-r from-cyan-300 via-sky-400 to-blue-400 transition-all duration-200"
                                  style={{ width: `${Math.max(message.progressPercent ?? 0, message.status === 'completed' ? 100 : 6)}%` }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-500">
                                <span>{message.status ? t(`transfer.${message.status}`) : t('transfer.pending')}</span>
                                <span>{Math.round(message.progressPercent ?? (message.status === 'completed' ? 100 : 0))}%</span>
                              </div>
                            </div>

                            {message.savedPath && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void onOpenFolder(message.savedPath!)}
                                className="gap-2 rounded-xl border-white/10 bg-white/[0.04] text-slate-100 hover:border-cyan-300/25 hover:bg-cyan-500/10 hover:text-cyan-50"
                              >
                                <FolderOpen size={13} />
                                {t('transfer.openFolder')}
                              </Button>
                            )}
                          </div>
                        )}

                        <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-slate-500">
                          {formatClock(message.timestampMs)}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="border-t border-white/10 px-4 py-4 md:px-6 md:py-5">
            <div className="rounded-[26px] border border-white/10 bg-black/15 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  disabled={!canInteract}
                  placeholder={t('transfer.inputPlaceholder')}
                  className="min-h-[72px] rounded-[20px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-slate-50 outline-none transition-colors placeholder:text-slate-500 focus-visible:border-cyan-300/25 focus-visible:ring-2 focus-visible:ring-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                />

                <Button
                  variant="outline"
                  onClick={() => void onAttachFile()}
                  disabled={!canInteract}
                  className="h-auto min-h-[56px] gap-2 rounded-[20px] border-white/10 bg-white/[0.04] px-4 text-slate-100 hover:border-cyan-300/25 hover:bg-cyan-500/10 hover:text-cyan-50"
                >
                  <Paperclip size={15} />
                  {t('transfer.attachFile')}
                </Button>

                <Button
                  onClick={() => void handleSend()}
                  disabled={!canInteract || !draft.trim()}
                  className="h-auto min-h-[56px] gap-2 rounded-[20px] border border-cyan-300/15 bg-cyan-500 px-5 text-slate-950 shadow-[0_18px_50px_rgba(56,189,248,0.28)] hover:bg-cyan-400"
                >
                  <SendHorizonal size={15} />
                  {t('transfer.send')}
                </Button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 py-8">
          <div className="max-w-xl rounded-[30px] border border-dashed border-white/12 bg-white/[0.03] p-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] border border-cyan-300/15 bg-cyan-500/10 text-cyan-100">
              <Sparkles size={22} />
            </div>
            <div className="mt-5 text-2xl font-semibold tracking-tight text-slate-50">
              {isRunning ? t('transfer.workspaceWaitingTitle') : t('transfer.workspaceIdleTitle')}
            </div>
            <div className="mt-3 text-sm leading-7 text-slate-400">
              {isRunning ? t('transfer.workspaceWaitingBody') : t('transfer.workspaceIdleBody')}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
