import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FileMeta } from "@/types/hyperview";
import { readTextFile } from "@tauri-apps/plugin-fs";
import Editor, { OnMount } from "@monaco-editor/react";
import { Loader2 } from "lucide-react";

import {
  ensureMonacoThemes,
  getMonacoTheme,
  resolveMonacoPreviewLanguage,
} from "@/lib/monaco";
import { useAppStore } from "@/store/useAppStore";

const codeContentCache = new Map<string, string>();

interface CodeRendererProps {
  meta: FileMeta;
  content?: string;
  language?: string;
}

export function CodeRenderer({ meta, content: providedContent, language }: CodeRendererProps) {
  const theme = useAppStore((state) => state.theme);
  const [content, setContent] = useState(providedContent ?? "");
  const [loading, setLoading] = useState(providedContent === undefined);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  useEffect(() => {
    if (providedContent !== undefined) {
      setContent(providedContent);
      setLoading(false);
      return;
    }

    const cacheKey = `${meta.path}:${meta.size}`;
    const cachedContent = codeContentCache.get(cacheKey);
    if (cachedContent) {
      setContent(cachedContent);
      setLoading(false);
      return;
    }

    setLoading(true);

    const load = async () => {
      try {
        if (meta.size > 1024 * 1024 * 5) {
             const largeFileContent = "// File too large for simple preview.\n// Coming in Stage 2: Streaming Reader.";
             codeContentCache.set(cacheKey, largeFileContent);
             setContent(largeFileContent);
        } else {
             const text = await readTextFile(meta.path);
             codeContentCache.set(cacheKey, text);
             setContent(text);
        }
      } catch (e) {
        setContent(`Error reading file: ${e}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [meta.path, meta.size, providedContent]);

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme(getMonacoTheme(theme));
    }
  }, [theme]);

  useLayoutEffect(() => {
    return () => {
      const editor = editorRef.current;
      const model = editor?.getModel?.();

      if (!editor || !model) {
        return;
      }

      try {
        editor.setModel(null);
      } catch (error) {
        console.warn('Failed to detach code preview model before unmount:', error);
      }

      try {
        model.dispose?.();
      } catch (error) {
        console.warn('Failed to dispose code preview model during unmount:', error);
      }
    };
  }, []);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    ensureMonacoThemes(monaco);
    monaco.editor.setTheme(getMonacoTheme(theme));
  };

  const lang = resolveMonacoPreviewLanguage(meta.name, language);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin"/></div>;

  return (
    <Editor
      height="100%"
      onMount={handleEditorDidMount}
      language={lang}
      value={content}
      theme={getMonacoTheme(theme)}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        domReadOnly: true,
        fontSize: 13,
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        automaticLayout: true,
      }}
    />
  );
}
