import { createContext, useContext, useRef, useState, ReactNode, useCallback } from 'react';
import { SpotlightMode, SearchScope } from '@/types/spotlight';
import { Prompt } from '@/types/prompt';
import { ChatAttachment } from '@/types/spotlight';
import { parseChatAttachments } from '@/lib/chat_attachment';
import type { ChatAttachmentError } from '@/lib/chat_attachment';

interface SpotlightContextType {
  // 状态
  mode: SpotlightMode;
  query: string;
  chatInput: string;
  searchScope: SearchScope;
  activeTemplate: Prompt | null;
  attachments: ChatAttachment[];
  attachmentError: ChatAttachmentError | null;
  attachmentErrors: ChatAttachmentError[];

  // 动作
  setMode: (mode: SpotlightMode) => void;
  setQuery: (query: string) => void;
  setChatInput: (input: string) => void;
  setSearchScope: (scope: SearchScope) => void;
  setActiveTemplate: (prompt: Prompt | null) => void;
  addAttachments: (files: FileList | File[]) => Promise<void>;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  clearAttachmentError: () => void;

  toggleMode: () => void;

  // 引用
  inputRef: React.RefObject<HTMLInputElement | null>;
  focusInput: () => void;
}

const SpotlightContext = createContext<SpotlightContextType | null>(null);

export function SpotlightProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SpotlightMode>('search');
  const [query, setQuery] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('global');
  const [activeTemplate, setActiveTemplate] = useState<Prompt | null>(null);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [attachmentErrors, setAttachmentErrors] = useState<ChatAttachmentError[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const attachmentsRef = useRef<ChatAttachment[]>([]);
  const addQueueRef = useRef<Promise<void>>(Promise.resolve());
  const attachmentSessionRef = useRef(0);

  const focusInput = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  }, []);

  const clearAttachments = useCallback(() => {
    attachmentSessionRef.current += 1;
    attachmentsRef.current = [];
    setAttachments([]);
    setAttachmentErrors([]);
  }, []);

  const clearAttachmentError = useCallback(() => {
    setAttachmentErrors([]);
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => {
      const next = prev.filter(item => item.id !== id);
      attachmentsRef.current = next;
      return next;
    });
    setAttachmentErrors([]);
  }, []);

  const addAttachments = useCallback(async (incoming: FileList | File[]) => {
    const files = Array.from(incoming as ArrayLike<File>);
    if (files.length === 0) return;

    const run = addQueueRef.current.then(async () => {
      const sessionAtStart = attachmentSessionRef.current;
      const current = attachmentsRef.current;
      const existingBytes = current.reduce((sum, item) => sum + item.size, 0);

      const result = await parseChatAttachments(files, {
        existingCount: current.length,
        existingBytes
      });

      if (sessionAtStart !== attachmentSessionRef.current) {
        return;
      }

      if (result.items.length > 0) {
        const next = [...attachmentsRef.current, ...result.items];
        attachmentsRef.current = next;
        setAttachments(next);
      }

      setAttachmentErrors(result.errors);
    });

    addQueueRef.current = run.catch(() => undefined);
    await run;
  }, []);

  const setMode = useCallback((newMode: SpotlightMode) => {
    setModeState(newMode);
    setActiveTemplate(null);
    clearAttachments();
    focusInput();
  }, [focusInput, clearAttachments]);

  const toggleMode = useCallback(() => {
    setModeState(prev => {
        setActiveTemplate(null);
        clearAttachments();
        if (prev === 'search') return 'chat';
        if (prev === 'chat') return 'clipboard'; // 增加这一步
        return 'search';
    });
    focusInput();
  }, [focusInput, clearAttachments]);

  return (
    <SpotlightContext.Provider value={{
      mode,
      query,
      chatInput,
      searchScope,
      activeTemplate,
      attachments,
      attachmentError: attachmentErrors[0] ?? null,
      attachmentErrors,
      setMode,
      setQuery,
      setChatInput,
      setSearchScope,
      setActiveTemplate,
      addAttachments,
      removeAttachment,
      clearAttachments,
      clearAttachmentError,
      toggleMode,
      inputRef,
      focusInput
    }}>
      {children}
    </SpotlightContext.Provider>
  );
}

export function useSpotlight() {
  const context = useContext(SpotlightContext);
  if (!context) {
    throw new Error('useSpotlight must be used within a SpotlightProvider');
  }
  return context;
}
