import { createContext, useContext, useRef, useState, ReactNode, useCallback } from 'react';
import { SpotlightMode, SearchScope } from '@/types/spotlight';
import { Prompt } from '@/types/prompt';

interface SpotlightContextType {
  // 状态
  mode: SpotlightMode;
  query: string;
  chatInput: string;
  searchScope: SearchScope;
  activeTemplate: Prompt | null;

  // 动作
  setMode: (mode: SpotlightMode) => void;
  setQuery: (query: string) => void;
  setChatInput: (input: string) => void;
  setSearchScope: (scope: SearchScope) => void;
  setActiveTemplate: (prompt: Prompt | null) => void;

  toggleMode: () => void;

  // 引用
  inputRef: React.RefObject<HTMLInputElement>;
  focusInput: () => void;
}

const SpotlightContext = createContext<SpotlightContextType | null>(null);

export function SpotlightProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SpotlightMode>('search');
  const [query, setQuery] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('global');
  const [activeTemplate, setActiveTemplate] = useState<Prompt | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const focusInput = useCallback(() => {
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  }, []);

  const setMode = useCallback((newMode: SpotlightMode) => {
    setModeState(newMode);
    setActiveTemplate(null);
    focusInput();
  }, [focusInput]);

  const toggleMode = useCallback(() => {
    setModeState(prev => {
        setActiveTemplate(null);
        if (prev === 'search') return 'chat';
        if (prev === 'chat') return 'clipboard'; // 增加这一步
        return 'search';
    });
    focusInput();
  }, [focusInput]);

  return (
    <SpotlightContext.Provider value={{
      mode,
      query,
      chatInput,
      searchScope,
      activeTemplate,
      setMode,
      setQuery,
      setChatInput,
      setSearchScope,
      setActiveTemplate,
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
