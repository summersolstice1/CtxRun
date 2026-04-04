import { useEffect, useRef, useState } from 'react';
import { FolderOpen, Paperclip, SendHorizonal } from 'lucide-react';
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
    <section className="flex min-w-0 flex-1 flex-col bg-background">
      {selectedDevice ? (
        <>
          <div className="border-b border-border px-5 py-4">
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-foreground">
                {selectedDevice.name}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {t('transfer.online')} · {selectedDevice.ipAddress}
              </div>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-5 custom-scrollbar">
            {messages.length === 0 ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 px-6 text-sm text-muted-foreground">
                {t('transfer.emptyChat')}
              </div>
            ) : (
              messages.map((message) => {
                if (message.kind === 'system') {
                  return (
                    <div
                      key={message.id}
                      className="mx-auto max-w-md rounded-full bg-secondary/60 px-3 py-1 text-center text-xs text-muted-foreground"
                    >
                      {message.content}
                    </div>
                  );
                }

                const outgoing = message.direction === 'sent';
                return (
                  <div
                    key={message.id}
                    className={cn('flex', outgoing ? 'justify-end' : 'justify-start')}
                  >
                    <div
                      className={cn(
                        'max-w-[78%] rounded-2xl border px-4 py-3 shadow-sm',
                        outgoing
                          ? 'border-cyan-400/20 bg-cyan-500/10'
                          : 'border-border bg-card'
                      )}
                    >
                      {message.kind === 'text' ? (
                        <div className="whitespace-pre-wrap break-words text-sm text-foreground">
                          {message.content}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-start gap-3">
                            <div className="rounded-lg bg-secondary/80 p-2 text-muted-foreground">
                              <Paperclip size={14} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-foreground">
                                {message.fileName}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {formatFileSize(message.fileSize)} ·{' '}
                                {message.status ? t(`transfer.${message.status}`) : t('transfer.pending')}
                              </div>
                            </div>
                          </div>
                          {typeof message.progressPercent === 'number' &&
                            message.progressPercent > 0 &&
                            message.progressPercent < 100 && (
                              <div className="space-y-1">
                                <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                                  <div
                                    className="h-full bg-cyan-400 transition-all duration-200"
                                    style={{ width: `${message.progressPercent}%` }}
                                  />
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {Math.round(message.progressPercent)}%
                                </div>
                              </div>
                            )}
                          {message.savedPath && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => void onOpenFolder(message.savedPath!)}
                              className="gap-2"
                            >
                              <FolderOpen size={13} />
                              {t('transfer.openFolder')}
                            </Button>
                          )}
                        </div>
                      )}
                      <div className="mt-2 text-[11px] text-muted-foreground">
                        {new Date(message.timestampMs).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-border bg-card/60 px-5 py-4">
            <div className="grid grid-cols-[1fr_auto_auto] gap-3">
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
                className="min-h-[48px] rounded-xl border border-input bg-background px-3 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <Button variant="outline" onClick={() => void onAttachFile()} disabled={!canInteract} className="gap-2">
                <Paperclip size={14} />
                {t('transfer.attachFile')}
              </Button>
              <Button onClick={() => void handleSend()} disabled={!canInteract || !draft.trim()} className="gap-2">
                <SendHorizonal size={14} />
                {t('transfer.send')}
              </Button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex h-full items-center justify-center p-8">
          <div className="max-w-md rounded-2xl border border-dashed border-border bg-card/40 px-6 py-8 text-center text-sm text-muted-foreground">
            {isRunning ? t('transfer.selectDevice') : t('transfer.waitingConnection')}
          </div>
        </div>
      )}
    </section>
  );
}
