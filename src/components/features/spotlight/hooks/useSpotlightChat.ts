import { useState, useRef, useCallback, useEffect } from 'react';
import { ChatContentPart, ChatMessage, ChatMessageAttachment, ChatRequestMessage, streamChatCompletion } from '@/lib/llm';
import { useAppStore } from '@/store/useAppStore';
import { useSpotlight } from '../core/SpotlightContext';
import { assembleChatPrompt } from '@/lib/template';
import { ChatAttachment } from '@/types/spotlight';

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

function buildDisplayAttachments(attachments: ChatAttachment[]): ChatMessageAttachment[] {
  return attachments.map(item => ({
    id: item.id,
    kind: item.kind,
    name: item.name,
    mime: item.mime,
    size: item.size,
    previewUrl: item.kind === 'image' ? item.content : undefined
  }));
}

function buildUserContentForApi(text: string, attachments: ChatAttachment[]): string | ChatContentPart[] {
  if (attachments.length === 0) {
    return text;
  }

  const parts: ChatContentPart[] = [];
  const normalizedText = text.trim();
  if (normalizedText) {
    parts.push({ type: 'text', text: normalizedText });
  }

  for (const item of attachments) {
    if (item.kind === 'image') {
      parts.push({ type: 'text', text: `Image: ${item.name}` });
      parts.push({
        type: 'image_url',
        image_url: {
          url: item.content,
          detail: 'auto'
        }
      });
    } else {
      parts.push({ type: 'text', text: item.content });
    }
  }

  return parts;
}

export function useSpotlightChat() {
  const {
    chatInput,
    setChatInput,
    activeTemplate,
    setActiveTemplate,
    attachments,
    clearAttachments,
    clearAttachmentError
  } = useSpotlight();
  const { aiConfig: uiAiConfig, setAIConfig } = useAppStore();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState(true);
  const requestHistoryRef = useRef<ChatRequestMessage[]>([]);
  const currentAssistantContentRef = useRef('');

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
    const hasAttachments = attachments.length > 0;

    if (activeTemplate) {
        finalContent = assembleChatPrompt(activeTemplate.content, chatInput);
    } else {
        if (!finalContent && !hasAttachments) return;
    }

    if (isStreaming) return;
    if (!finalContent && !hasAttachments) return;

    const freshConfig = useAppStore.getState().aiConfig;

    if (!freshConfig.apiKey) {
       setMessages(prev => [...prev, {
           role: 'assistant',
           content: `**Configuration Error**: API Key is missing. \n\nPlease go to Settings (in the main window) -> AI Configuration to set it up.`,
           reasoning: ''
       }]);
       return;
    }

    const userDisplayContent = finalContent.trim();
    const userDisplayAttachments = buildDisplayAttachments(attachments);
    const userRequestContent = buildUserContentForApi(finalContent, attachments);
    const requestHistoryBase = requestHistoryRef.current;
    const requestMessages: ChatRequestMessage[] = [
      ...requestHistoryBase,
      {
        role: 'user',
        content: userRequestContent
      }
    ];

    setMessages(prev => [
      ...prev,
      { role: 'user', content: userDisplayContent, attachments: userDisplayAttachments },
      { role: 'assistant', content: '', reasoning: '' }
    ]);
    setIsStreaming(true);
    setChatInput('');
    setActiveTemplate(null);
    clearAttachments();
    clearAttachmentError();
    currentAssistantContentRef.current = '';
    let streamFailed = false;

    await streamChatCompletion(requestMessages, freshConfig,
      (contentDelta, reasoningDelta) => {
        currentAssistantContentRef.current += contentDelta;
        // 使用节流更新而非直接更新
        append(contentDelta, reasoningDelta);
      },
      (err) => {
        // 错误时先 flush 缓冲区，再添加错误信息
        streamFailed = true;
        flushFinal();
        const errorSuffix = `\n\n**[Error]**: ${err}`;
        setMessages(current => {
          const updated = [...current];
          const lastMsg = updated[updated.length - 1];
          if (lastMsg) {
            updated[updated.length - 1] = {
              ...lastMsg,
              content: lastMsg.content + errorSuffix
            };
          }
          return updated;
        });
      },
      () => {
        // 流式结束时 flush 缓冲区
        flushFinal();
        if (!streamFailed) {
          const nextHistory: ChatRequestMessage[] = [
            ...requestHistoryBase,
            // Keep original multimodal payload (especially image_url) for follow-up turns.
            { role: 'user', content: userRequestContent }
          ];
          const assistantContent = currentAssistantContentRef.current.trim();
          if (assistantContent) {
            nextHistory.push({ role: 'assistant', content: assistantContent });
          }
          requestHistoryRef.current = nextHistory;
        }
        setIsStreaming(false);
      }
    );
  }, [
    chatInput,
    isStreaming,
    activeTemplate,
    attachments,
    setActiveTemplate,
    setChatInput,
    clearAttachments,
    clearAttachmentError,
    append,
    flushFinal
  ]);

  const clearChat = useCallback(() => {
    // 如果正在流式输出，先 flush 缓冲区避免内容丢失
    if (isStreaming) {
      flushFinal();
      return;
    }
    setMessages([]);
    setChatInput('');
    setActiveTemplate(null);
    clearAttachments();
    clearAttachmentError();
    requestHistoryRef.current = [];
    currentAssistantContentRef.current = '';
  }, [isStreaming, setChatInput, setActiveTemplate, clearAttachments, clearAttachmentError, flushFinal]);

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
