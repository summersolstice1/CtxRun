import { useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, ChevronDown, Brain, Check, Copy, FileText, Loader2, Wrench, CheckCircle2, AlertCircle, Clock3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCollapsedItems } from '@/lib/hooks';
import { CHAT_ATTACHMENT_COLLAPSE_THRESHOLD } from '@/lib/chat_attachment';
import { useAppStore } from '@/store/useAppStore';
import { MarkdownContent } from '@/components/ui/MarkdownContent';
import { ChatMessage, ChatToolCallTrace } from '@/lib/llm';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { open } from '@tauri-apps/plugin-shell';

const TOOL_TIMELINE_VISIBLE_RECENT = 3;

function normalizeExternalHttpUrl(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  const trimmed = href.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }

  return null;
}

function openExternalLink(href: unknown): void {
  const externalUrl = normalizeExternalHttpUrl(href);
  if (!externalUrl) return;

  void open(externalUrl).catch((error) => {
    console.error('[SpotlightChat] Failed to open external link:', error);
  });
}

function formatToolDuration(durationMs?: number): string | null {
  if (durationMs === undefined || !Number.isFinite(durationMs)) return null;
  if (durationMs < 1000) return `${Math.max(0, Math.round(durationMs))}ms`;
  const seconds = durationMs / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  return `${Math.round(seconds)}s`;
}

function sortToolCallsByStartedAt<T extends { startedAt: number; id: string }>(calls: T[]): T[] {
  return [...calls].sort((left, right) => {
    if (left.startedAt === right.startedAt) {
      return left.id.localeCompare(right.id);
    }
    return left.startedAt - right.startedAt;
  });
}

function buildToolTimelineSummary(call: ChatToolCallTrace, toolNoOutputLabel: string): string {
  if (call.status === 'running') {
    return call.argumentsPreview || '';
  }
  if (call.resultPreview) {
    return call.resultPreview;
  }
  if (call.status === 'success') {
    return toolNoOutputLabel;
  }
  return '';
}

function buildCollapsedToolTimeline(calls: ChatToolCallTrace[]): {
  visibleCalls: ChatToolCallTrace[];
  hiddenCount: number;
} {
  if (calls.length <= TOOL_TIMELINE_VISIBLE_RECENT) {
    return {
      visibleCalls: calls,
      hiddenCount: 0,
    };
  }

  const recentCalls = calls.slice(-TOOL_TIMELINE_VISIBLE_RECENT);
  const recentIds = new Set(recentCalls.map((call) => call.id));
  const runningCalls = calls.filter((call) => call.status === 'running' && !recentIds.has(call.id));
  const visibleCalls = sortToolCallsByStartedAt([...runningCalls, ...recentCalls]);

  return {
    visibleCalls,
    hiddenCount: Math.max(0, calls.length - visibleCalls.length),
  };
}

function MessageCopyMenu({ content }: { content: string }) {
  const [isCopied, setIsCopied] = useState(false);
  const { t } = useTranslation();

  const handleCopy = async () => {
    try {
      await writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity",
        isCopied
          ? "text-green-500 bg-green-500/10 border border-green-500/20"
          : "text-muted-foreground hover:text-foreground hover:bg-secondary/80 border border-transparent"
      )}
      title={t('spotlight.copyMessage')}
    >
      {isCopied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

interface ChatMessageItemProps {
  msg: ChatMessage;
  idx: number;
  isStreaming: boolean;
  messagesLength: number;
}

// 使用 React.memo 优化单条消息的渲染
const ChatMessageItem = memo(({ msg, idx, isStreaming, messagesLength }: ChatMessageItemProps) => {
  const { t } = useTranslation();
  const isLastMessage = idx === messagesLength - 1;
  const isStreamingLast = isStreaming && isLastMessage;
  const hasUserText = msg.role === 'user' && Boolean(msg.content.trim());
  const userAttachments = msg.role === 'user' ? (msg.attachments ?? []) : [];
  const hasUserAttachments = userAttachments.length > 0;
  const assistantToolCalls = msg.role === 'assistant' ? (msg.toolCalls ?? []) : [];
  const hasAssistantToolCalls = assistantToolCalls.length > 0;
  const runningToolCallCount = assistantToolCalls.filter((call) => call.status === 'running').length;
  const orderedToolCalls = sortToolCallsByStartedAt(assistantToolCalls);
  const [showAllToolCalls, setShowAllToolCalls] = useState(false);
  const collapsedToolTimeline = buildCollapsedToolTimeline(orderedToolCalls);
  const visibleToolCalls = showAllToolCalls ? orderedToolCalls : collapsedToolTimeline.visibleCalls;
  const hiddenToolCallCount = showAllToolCalls ? 0 : collapsedToolTimeline.hiddenCount;
  const shouldCollapseToolCalls = orderedToolCalls.length > TOOL_TIMELINE_VISIBLE_RECENT;
  const {
    expanded: showAllUserAttachments,
    setExpanded: setShowAllUserAttachments,
    shouldCollapse: shouldCollapseUserAttachments,
    visibleItems: visibleUserAttachments,
    hiddenCount: hiddenUserAttachmentCount,
    hiddenPreview: hiddenUserAttachmentPreview
  } = useCollapsedItems({
    items: userAttachments,
    threshold: CHAT_ATTACHMENT_COLLAPSE_THRESHOLD,
    getPreviewText: item => item.name
  });

  if (msg.role === 'user') {
    return (
      <div className="flex animate-in fade-in slide-in-from-bottom-2 duration-300 group justify-end">
        <div className="max-w-full flex flex-col items-end gap-2">
          {hasUserText && (
            <div className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm border relative max-w-full bg-primary text-primary-foreground border-primary/50 rounded-tr-sm select-text cursor-text whitespace-pre-wrap">
              {msg.content}
            </div>
          )}

          {hasUserAttachments && (
            <div className="flex flex-wrap justify-end gap-2 max-w-full">
              {visibleUserAttachments.map(item => (
                item.kind === 'image' && item.previewUrl ? (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-border/60 bg-background/60 p-1.5 shadow-sm"
                    title={item.name}
                  >
                    <img
                      src={item.previewUrl}
                      alt={item.name}
                      loading="lazy"
                      className="w-20 h-20 rounded-xl object-cover border border-border/40"
                    />
                    <div className="mt-1 px-1 text-[10px] text-muted-foreground max-w-20 truncate">
                      {item.name}
                    </div>
                  </div>
                ) : (
                  <div
                    key={item.id}
                    className="max-w-[220px] flex items-center gap-2 rounded-2xl border border-border/60 bg-background/60 px-2.5 py-2 text-xs text-foreground/90"
                    title={item.name}
                  >
                    <FileText size={14} className="shrink-0 text-muted-foreground" />
                    <span className="truncate">{item.name}</span>
                  </div>
                )
              ))}
              {!showAllUserAttachments && hiddenUserAttachmentCount > 0 && (
                <button
                  onClick={() => setShowAllUserAttachments(true)}
                  className="max-w-[220px] rounded-2xl border border-border/60 bg-background/60 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  title={hiddenUserAttachmentPreview || `+${hiddenUserAttachmentCount}`}
                >
                  +{hiddenUserAttachmentCount}
                </button>
              )}
              {showAllUserAttachments && shouldCollapseUserAttachments && (
                <button
                  onClick={() => setShowAllUserAttachments(false)}
                  className="max-w-[220px] rounded-2xl border border-border/60 bg-background/60 px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                >
                  {t('actions.collapse')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex animate-in fade-in slide-in-from-bottom-2 duration-300 group justify-start">
      <div className="rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm border relative max-w-full bg-secondary/50 border-border/50 text-foreground rounded-tl-sm select-text cursor-text">
        {!isStreaming && <MessageCopyMenu content={msg.content} />}
        <>
          {msg.reasoning && (
            <details className="mb-2 group/reasoning" open={isStreamingLast}>
              <summary className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-muted-foreground/60 cursor-pointer hover:text-purple-400 transition-colors select-none list-none outline-none">
                <Brain size={12} />
                <span>{t('spotlight.thinking')}</span>
                <ChevronDown size={12} className="group-open/reasoning:rotate-180 transition-transform duration-200" />
              </summary>
              <div className="mt-2 pl-2 border-l-2 border-purple-500/20 text-xs text-muted-foreground/80 leading-relaxed opacity-80 reasoning-body">
                <MarkdownContent
                  content={msg.reasoning}
                  linkClassName="text-purple-300 hover:text-purple-200"
                  onOpenLink={openExternalLink}
                  showExternalIndicator
                />
                {isStreamingLast && !msg.content && <span className="inline-block w-1.5 h-3 ml-1 bg-purple-500/50 align-middle animate-pulse" />}
              </div>
            </details>
          )}
          <MarkdownContent
            content={msg.content || (isStreamingLast && !msg.reasoning ? "..." : "")}
            linkClassName="text-purple-300 hover:text-purple-200"
            onOpenLink={openExternalLink}
            showExternalIndicator
          />

          {hasAssistantToolCalls && (
            <div className="mt-2 pt-2 border-t border-border/40">
              <div className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase font-bold text-muted-foreground/60">
                <Wrench size={12} />
                <span>{t('spotlight.toolCalls')} ({assistantToolCalls.length})</span>
                {runningToolCallCount > 0 && (
                  <span className="text-[10px] normal-case text-amber-400/90">
                    {runningToolCallCount} {t('spotlight.toolRunning')}
                  </span>
                )}
                {shouldCollapseToolCalls && (
                  <button
                    type="button"
                    onClick={() => setShowAllToolCalls((current) => !current)}
                    className="ml-auto text-[10px] normal-case text-purple-300/90 hover:text-purple-200 transition-colors"
                  >
                    {showAllToolCalls
                      ? t('spotlight.toolShowLess')
                      : t('spotlight.toolShowMore', { count: hiddenToolCallCount })}
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {visibleToolCalls.map((call) => {
                  const isRunning = call.status === 'running';
                  const isSuccess = call.status === 'success';
                  const statusLabel = isRunning
                    ? t('spotlight.toolRunning')
                    : isSuccess
                      ? t('spotlight.toolCompleted')
                      : t('spotlight.toolFailed');
                  const durationLabel = formatToolDuration(call.durationMs);
                  const summary = buildToolTimelineSummary(call, t('spotlight.toolNoOutput'));
                  const warningCount = call.warnings?.length ?? 0;
                  const timelineTitle = [
                    `${call.name} · ${statusLabel}${durationLabel ? ` · ${durationLabel}` : ''}`,
                    call.argumentsPreview ? `${t('spotlight.toolArgs')}: ${call.argumentsPreview}` : '',
                    summary ? `${t('spotlight.toolOutput')}: ${summary}` : '',
                    warningCount > 0 ? `${t('spotlight.toolWarnings')}: ${call.warnings?.join(' · ')}` : '',
                  ].filter(Boolean).join('\n');

                  return (
                    <div
                      key={call.id}
                      className="rounded-md border border-border/50 bg-background/35 px-2.5 py-1.5 text-[11px]"
                      title={timelineTitle}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isRunning ? (
                          <Loader2 size={12} className="text-amber-400 animate-spin" />
                        ) : isSuccess ? (
                          <CheckCircle2 size={12} className="text-emerald-400" />
                        ) : (
                          <AlertCircle size={12} className="text-rose-400" />
                        )}
                        <code className="font-mono text-foreground/90 shrink-0">{call.name}</code>
                        <span className="text-[10px] text-muted-foreground/70 shrink-0">{statusLabel}</span>
                        {durationLabel && (
                          <span className="text-[10px] text-muted-foreground/70 flex items-center gap-1 shrink-0">
                            <Clock3 size={10} />
                            <span>{durationLabel}</span>
                          </span>
                        )}
                        {warningCount > 0 && (
                          <span className="text-[10px] text-amber-400/90 shrink-0">
                            ⚠ {warningCount}
                          </span>
                        )}
                        {summary && (
                          <span className="ml-1 min-w-0 flex-1 truncate text-muted-foreground/85">
                            {summary}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 自定义比较逻辑：只有当消息内容、推理内容或流式状态发生变化时才重新渲染
  return prevProps.msg.content === nextProps.msg.content &&
    prevProps.msg.reasoning === nextProps.msg.reasoning &&
    prevProps.msg.toolCalls === nextProps.msg.toolCalls &&
    prevProps.msg.attachments === nextProps.msg.attachments &&
    prevProps.isStreaming === nextProps.isStreaming;
});

ChatMessageItem.displayName = 'ChatMessageItem';

interface ChatModeProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  chatEndRef: React.RefObject<HTMLDivElement | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onScrollPositionChange?: (isAtBottom: boolean) => void;
}

export function ChatMode({ messages, isStreaming, chatEndRef, containerRef, onScrollPositionChange }: ChatModeProps) {
  const { t } = useTranslation();
  const { aiConfig } = useAppStore();
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);

  // 监听滚动事件，判断用户是否在底部
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;

    // 距离底部 70px 内算作在底部（允许 70px 的缓冲区）
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 70;
    setIsUserAtBottom(isAtBottom);
    onScrollPositionChange?.(isAtBottom);
  };

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-start text-muted-foreground animate-in fade-in slide-in-from-bottom-2 duration-500 pt-10">
        <div className="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center mb-4 text-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.15)] animate-pulse">
          <Sparkles size={24} />
        </div>
        <h3 className="text-foreground font-medium mb-1">{t('spotlight.aiReady')}</h3>
        <p className="text-xs text-center max-w-[200px] opacity-70 leading-relaxed">
          {t('spotlight.aiDesc')} <span className="text-purple-500 font-medium">{aiConfig.providerId}</span>.
        </p>
        <div className="mt-8 text-[10px] opacity-40 font-mono bg-background/50 border border-border/50 px-2 py-1 rounded">
          {t('spotlight.ephemeral')}
        </div>
      </div>
    );
  }

  const messagesLength = messages.length;

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 p-4 overflow-y-auto custom-scrollbar flex flex-col gap-4"
    >
      {messages.map((msg, idx) => (
        <ChatMessageItem
          key={idx}
          msg={msg}
          idx={idx}
          isStreaming={isStreaming}
          messagesLength={messagesLength}
        />
      ))}
      <div ref={chatEndRef} />

      {/* "回到最新"浮动按钮 - 当用户向上滚动查看历史时显示 */}
      {isStreaming && !isUserAtBottom && (
        <button
          onClick={() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}
          className="fixed bottom-12 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1.5 rounded-full text-xs shadow-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-2"
          title={t('spotlight.seeLatest')}
        >
          <ChevronDown size={14} />
          <span className="font-medium">{t('spotlight.latest')}</span>
        </button>
      )}
    </div>
  );
}
