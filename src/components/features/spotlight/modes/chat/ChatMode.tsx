import { useState, memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, ChevronDown, Brain, Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { getText } from '@/lib/i18n';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { ChatMessage } from '@/lib/llm';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';

// 将 ReactMarkdown 的 components 提取到外部，避免每次渲染都创建新对象
const markdownComponents = {
  code({ node, inline, className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || '');
    return !inline && match ? (
      <CodeBlock language={match[1]} className="text-sm">{String(children).replace(/\n$/, '')}</CodeBlock>
    ) : (
      <code className={cn("bg-black/20 px-1 py-0.5 rounded font-mono", className)} {...props}>{children}</code>
    );
  }
};

const reasoningComponents = {
  code({ node, inline, className, children, ...props }: any) {
    return <code className={cn("bg-black/10 dark:bg-black/30 px-1 py-0.5 rounded font-mono", className)} {...props}>{children}</code>;
  }
};

function MessageCopyMenu({ content }: { content: string }) {
  const [isCopied, setIsCopied] = useState(false);
  const { language } = useAppStore();

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
      title={getText('spotlight', 'copyMessage', language)}
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
  const { language } = useAppStore();
  const isLastMessage = idx === messagesLength - 1;
  const isStreamingLast = isStreaming && isLastMessage;

  return (
    <div className={cn("flex animate-in fade-in slide-in-from-bottom-2 duration-300 group", msg.role === 'user' ? "justify-end" : "justify-start")}>
      <div className={cn("rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm border relative max-w-full", msg.role === 'user' ? "bg-primary text-primary-foreground border-primary/50 rounded-tr-sm" : "bg-secondary/50 border-border/50 text-foreground rounded-tl-sm markdown-body", "select-text cursor-text")}>
        {msg.role === 'assistant' && !isStreaming && <MessageCopyMenu content={msg.content} />}
        {msg.role === 'user' ? <div className="whitespace-pre-wrap">{msg.content}</div> : (
          <>
            {msg.reasoning && (
              <details className="mb-2 group/reasoning" open={isStreamingLast}>
                <summary className="flex items-center gap-1.5 text-[10px] uppercase font-bold text-muted-foreground/60 cursor-pointer hover:text-purple-400 transition-colors select-none list-none outline-none">
                  <Brain size={12} />
                  <span>{getText('spotlight', 'thinking', language)}</span>
                  <ChevronDown size={12} className="group-open/reasoning:rotate-180 transition-transform duration-200" />
                </summary>
                <div className="mt-2 pl-2 border-l-2 border-purple-500/20 text-xs text-muted-foreground/80 leading-relaxed opacity-80 reasoning-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={reasoningComponents}
                  >
                    {msg.reasoning}
                  </ReactMarkdown>
                  {isStreamingLast && !msg.content && <span className="inline-block w-1.5 h-3 ml-1 bg-purple-500/50 align-middle animate-pulse" />}
                </div>
              </details>
            )}
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {msg.content || (isStreamingLast && !msg.reasoning ? "..." : "")}
            </ReactMarkdown>
          </>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // 自定义比较逻辑：只有当消息内容、推理内容或流式状态发生变化时才重新渲染
  return prevProps.msg.content === nextProps.msg.content &&
    prevProps.msg.reasoning === nextProps.msg.reasoning &&
    prevProps.isStreaming === nextProps.isStreaming;
});

ChatMessageItem.displayName = 'ChatMessageItem';

interface ChatModeProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  chatEndRef: React.RefObject<HTMLDivElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  onScrollPositionChange?: (isAtBottom: boolean) => void;
}

export function ChatMode({ messages, isStreaming, chatEndRef, containerRef, onScrollPositionChange }: ChatModeProps) {
  const { language, aiConfig } = useAppStore();
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
        <h3 className="text-foreground font-medium mb-1">{getText('spotlight', 'aiReady', language)}</h3>
        <p className="text-xs text-center max-w-[200px] opacity-70 leading-relaxed">
          {getText('spotlight', 'aiDesc', language)} <span className="text-purple-500 font-medium">{aiConfig.providerId}</span>.
        </p>
        <div className="mt-8 text-[10px] opacity-40 font-mono bg-background/50 border border-border/50 px-2 py-1 rounded">
          {getText('spotlight', 'ephemeral', language)}
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
      <style>{`
        .markdown-body p { margin-bottom: 0.5em; }
        .markdown-body p:last-child { margin-bottom: 0; }
        .markdown-body pre { margin: 0.5em 0; overflow-x: auto; }
        .markdown-body code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 0.9em; }
        .markdown-body { word-break: break-word; overflow-wrap: break-word; }
        /* 针对思考过程的微调样式 */
        .reasoning-body p { margin-bottom: 0.4em; }
        .reasoning-body pre { background: rgba(0,0,0,0.1); padding: 0.5em; border-radius: 4px; overflow-x: auto; }
      `}</style>
      
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
          title={language === 'zh' ? '查看最新回复' : 'See latest response'}
        >
          <ChevronDown size={14} />
          <span className="font-medium">{language === 'zh' ? '最新' : 'Latest'}</span>
        </button>
      )}
    </div>
  );
}