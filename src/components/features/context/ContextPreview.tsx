import { useState, useEffect, useRef } from 'react';
import { Editor, OnMount } from '@monaco-editor/react';
import { Copy, FileText, Loader2, AlertCircle, Search } from 'lucide-react';
import { FileNode } from '@/types/context';
import { getSelectedPaths, generateHeader } from '@/lib/context_assembler';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useAppStore } from '@/store/useAppStore';
import { useContextStore } from '@/store/useContextStore';
import { getText } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { invoke } from '@tauri-apps/api/core';

interface ContextPreviewProps {
  fileTree: FileNode[];
}

export function ContextPreview({ fileTree }: ContextPreviewProps) {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isCopied, setIsCopied] = useState(false);
  const { language, theme } = useAppStore();
  const { removeComments } = useContextStore();

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    const loadPreview = async () => {
      const paths = getSelectedPaths(fileTree);
      if (paths.length === 0) {
          if (isMounted) {
              setContent('');
              setIsLoading(false);
          }
          return;
      }

      setIsLoading(true);
      try {
        const header = generateHeader(fileTree, removeComments);
        const text = await invoke<string>('get_context_content', {
            paths,
            header,
            removeComments
        });

        if (isMounted) setContent(text);
      } catch (err) {
        console.error("Preview generation failed", err);
        if (isMounted) setContent(getText('common', 'previewError', language));
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    const timer = setTimeout(loadPreview, 100);
    return () => {
      isMounted = false;
      clearTimeout(timer);
      setContent('');
    };
  }, [fileTree, removeComments]);

  useEffect(() => {
    if (monacoRef.current) {
      // 修复：只要不是 light 模式，都使用深色主题
      const targetTheme = theme === 'light' ? 'codeforge-light' : 'codeforge-dark';
      monacoRef.current.editor.setTheme(targetTheme);
    }
  }, [theme]);

  const handleCopy = async () => {
    await writeText(content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    monaco.editor.defineTheme('codeforge-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#020817',
        'editor.lineHighlightBackground': '#1e293b20',
        'scrollbarSlider.background': '#33415550',
        'scrollbarSlider.hoverBackground': '#33415580',
        'editor.selectionBackground': '#3b82f640',
        'editorGutter.background': '#020817',
        'editorWidget.background': '#0f172a',
        'editorWidget.border': '#1e293b',
      }
    });

    monaco.editor.defineTheme('codeforge-light', {
      base: 'vs',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#ffffff',
        'editor.lineHighlightBackground': '#f1f5f9',
        'scrollbarSlider.background': '#94a3b850',
        'editor.selectionBackground': '#bfdbfe',
        'editorGutter.background': '#ffffff',
      }
    });

    // 修复：同样修改这里的判断逻辑
    const targetTheme = theme === 'light' ? 'codeforge-light' : 'codeforge-dark';
    monaco.editor.setTheme(targetTheme);
    editor.onKeyDown((e) => {
      if (!editor.getOption(monaco.editor.EditorOption.readOnly)) return;

      const code = e.code;

      const blockKeys = [
        'Backspace',
        'Delete',
        'Enter',
        'Tab'
      ];

      if (
        blockKeys.includes(code) ||
        (e.ctrlKey && code === 'KeyV') ||
        (e.metaKey && code === 'KeyV')
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    });
  };

  const triggerSearch = () => {
    editorRef.current?.trigger('source', 'actions.find');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
        <Loader2 size={24} className="animate-spin text-primary" />
        <p className="text-sm">{getText('context', 'generating', language)}</p>
      </div>
    );
  }

  if (!content.trim()) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 opacity-60">
        <AlertCircle size={32} />
        <p>{getText('context', 'noFiles', language)}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      <style>{`
        .monaco-editor .find-widget {
          top: -35px !important;
          right: 28px !important;
          border-radius: 6px !important;
          box-shadow: 0 4px 12px -2px rgba(0, 0, 0, 0.25) !important;
          border: 1px solid var(--border) !important;
          transition: top 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
          visibility: visible;
        }

        .monaco-editor .find-widget.visible {
          top: 25px !important;
        }

        .monaco-editor .find-widget.hidden {
          top: -60px !important;
          visibility: hidden;
        }
        .monaco-editor .find-widget .monaco-inputbox {
          height: 24px !important;
          min-height: 24px !important;
        }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border/50 bg-secondary/10 shrink-0 z-10 relative">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <FileText size={16} className="text-primary" />
          <span>{getText('context', 'previewTitle', language)}</span>
          <span className="text-xs text-muted-foreground font-normal ml-2">
            ({getText('context', 'chars', language, { count: content.length.toLocaleString() })})
            {removeComments && <span className="ml-2 px-1.5 py-0.5 bg-green-500/10 text-green-600 text-[10px] rounded border border-green-500/20">{getText('common', 'noComments', language)}</span>}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={triggerSearch}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground border border-transparent hover:border-border/50"
          >
            <Search size={14} />{getText('common', 'search', language)}
          </button>

          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md hover:bg-secondary transition-colors border border-transparent hover:border-border/50",
              isCopied ? "text-green-500" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {isCopied ? (
              <span className="text-green-500">{getText('context', 'copied', language)}</span>
            ) : (
              <>
                <Copy size={14} /> {getText('actions', 'copy', language)}
              </>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
        <Editor
          height="100%"
          language="xml"
          value={content}
          onMount={handleEditorDidMount}
          loading={
             <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-xs">{getText('common', 'loadingEditor', language)}</span>
             </div>
          }
          options={{
            readOnly: true,
            domReadOnly: true,
            minimap: {
              enabled: true,
              scale: 0.75,
              renderCharacters: false
            },
            scrollBeyondLastLine: false,
            fontSize: 12,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            lineHeight: 1.6,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },

            guides: {
              indentation: false,
            },

            folding: false,

            find: {
               addExtraSpaceOnTop: false,
               autoFindInSelection: "multiline",
               seedSearchStringFromSelection: 'always'
            },

            renderLineHighlight: 'none',
            matchBrackets: 'never',
            contextmenu: false,
          }}
        />
      </div>
    </div>
  );
}
