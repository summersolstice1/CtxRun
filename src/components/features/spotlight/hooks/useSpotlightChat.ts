import { useState, useRef, useCallback, useEffect } from 'react';
import { ChatMessage, streamChatCompletion } from '@/lib/llm';
import { useAppStore } from '@/store/useAppStore';
import { useSpotlight } from '../core/SpotlightContext';
import { assembleChatPrompt } from '@/lib/template';

// 节流配置
const THROTTLE_CONFIG = {
  BUFFER_THRESHOLD: 10,      // 缓冲区字符数阈值
  FLUSH_INTERVAL: 50,        // 定时刷新间隔
} as const;

/**
 * 流式更新节流 Hook
 * 累积内容到一定阈值或时间间隔后再批量更新状态，减少渲染次数
 */
function useThrottledStreamUpdate(
  onFlush: (content: string, reasoning: string) => void
) {
  const contentBufferRef = useRef("");
  const reasoningBufferRef = useRef("");
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const onFlushRef = useRef(onFlush);

  // 保持 onFlush 引用最新
  useEffect(() => {
    onFlushRef.current = onFlush;
  }, [onFlush]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
      }
    };
  }, []);

  // 刷新缓冲区到状态
  const flush = useCallback(() => {
    const content = contentBufferRef.current;
    const reasoning = reasoningBufferRef.current;

    if (content === "" && reasoning === "") {
      return;
    }

    onFlushRef.current(content, reasoning);

    // 清空缓冲区
    contentBufferRef.current = "";
    reasoningBufferRef.current = "";

    // 清除定时器
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
  }, []);

  // 节流模式：如果已有定时器在跑，不重置（避免慢速连接下的内容积攒）
  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;

    flushTimerRef.current = setTimeout(() => {
      flush();
      flushTimerRef.current = null;
    }, THROTTLE_CONFIG.FLUSH_INTERVAL);
  }, [flush]);

  // 添加增量到缓冲区
  const append = useCallback((contentDelta: string, reasoningDelta: string) => {
    contentBufferRef.current += contentDelta;
    reasoningBufferRef.current += reasoningDelta;

    // 达到阈值立即刷新
    if (contentBufferRef.current.length >= THROTTLE_CONFIG.BUFFER_THRESHOLD ||
        reasoningBufferRef.current.length >= THROTTLE_CONFIG.BUFFER_THRESHOLD) {
      flush();
      return;
    }

    // 否则设置定时刷新（防抖）
    scheduleFlush();
  }, [flush, scheduleFlush]);

  // 流式结束时强制刷新
  const flushFinal = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flush();
  }, [flush]);

  return { append, flushFinal };
}

export function useSpotlightChat() {
  const { chatInput, setChatInput, activeTemplate, setActiveTemplate } = useSpotlight();
  const { aiConfig: uiAiConfig, setAIConfig } = useAppStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);

  // 节流后的状态更新函数
  const throttledUpdate = useCallback((content: string, reasoning: string) => {
    setMessages(current => {
      const updated = [...current];
      const lastMsg = updated[updated.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        updated[updated.length - 1] = {
          ...lastMsg,
          content: lastMsg.content + content,
          reasoning: (lastMsg.reasoning || "") + reasoning
        };
      }
      return updated;
    });
  }, []);

  const { append, flushFinal } = useThrottledStreamUpdate(throttledUpdate);

  const sendMessage = useCallback(async () => {
    // 如果正在流式输出，先 flush 缓冲区避免内容丢失
    if (isStreaming) {
      flushFinal();
      return;
    }

    let finalContent = chatInput.trim();

    if (activeTemplate) {
        finalContent = assembleChatPrompt(activeTemplate.content, chatInput);
    } else {
        if (!finalContent) return;
    }

    if (isStreaming) return;
    if (!finalContent) return;

    const freshConfig = useAppStore.getState().aiConfig;

    if (!freshConfig.apiKey) {
       setMessages(prev => [...prev, {
           role: 'assistant',
           content: `**Configuration Error**: API Key is missing. \n\nPlease go to Settings (in the main window) -> AI Configuration to set it up.`,
           reasoning: ''
       }]);
       return;
    }

    setChatInput('');
    setActiveTemplate(null);

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: finalContent }];
    setMessages(newMessages);
    setIsStreaming(true);

    // 添加空的助手消息占位
    setMessages(prev => [...prev, { role: 'assistant', content: '', reasoning: '' }]);

    await streamChatCompletion(newMessages, freshConfig,
      (contentDelta, reasoningDelta) => {
        // 使用节流更新而非直接更新
        append(contentDelta, reasoningDelta);
      },
      (err) => {
        // 错误时先 flush 缓冲区，再添加错误信息
        flushFinal();
        setMessages(current => {
          const updated = [...current];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg) {
            updated[updated.length - 1] = {
              ...lastMsg,
              content: lastMsg.content + `\n\n**[Error]**: ${err}`
            };
          }
          return updated;
        });
      },
      () => {
        // 流式结束时 flush 缓冲区
        flushFinal();
        setIsStreaming(false);
      }
    );
  }, [chatInput, isStreaming, messages, activeTemplate, setActiveTemplate, setChatInput, append, flushFinal]);

  const clearChat = useCallback(() => {
    // 如果正在流式输出，先 flush 缓冲区避免内容丢失
    if (isStreaming) {
      flushFinal();
      return;
    }
    setMessages([]);
    setChatInput('');
    setActiveTemplate(null);
  }, [isStreaming, setChatInput, setActiveTemplate, flushFinal]);

  const cycleProvider = useCallback(() => {
    const currentSettings = useAppStore.getState().savedProviderSettings;
    const providers = Object.keys(currentSettings);
    const currentProvider = useAppStore.getState().aiConfig.providerId;

    if (providers.length > 0) {
        const currentIndex = providers.indexOf(currentProvider);
        const nextIndex = (currentIndex + 1) % providers.length;
        setAIConfig({ providerId: providers[nextIndex] });
    }
  }, [setAIConfig]);

  // 智能滚动：只在用户位于底部时自动滚动
  useEffect(() => {
    if (!isStreaming || !chatEndRef.current || !containerRef.current) return;

    // 只有当用户原本就在底部时，才执行自动滚动
    if (isUserAtBottom) {
      chatEndRef.current.scrollIntoView({
        behavior: 'auto', // 流式输出用 auto，避免平滑滚动的延迟感
        block: 'end'
      });
    }
  }, [messages, isStreaming, isUserAtBottom]);

  return {
    messages,
    isStreaming,
    chatEndRef,
    containerRef,
    isUserAtBottom,
    setIsUserAtBottom,
    sendMessage,
    clearChat,
    cycleProvider,
    providerId: uiAiConfig.providerId // 用于 UI 显示
  };
}
