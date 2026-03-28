import { useEffect, useState } from "react";
import { FileMeta } from "@/types/hyperview";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Loader2 } from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";

const markdownContentCache = new Map<string, string>();

interface MarkdownRendererProps {
  meta: FileMeta;
  content?: string;
}

export function MarkdownRenderer({ meta, content: providedContent }: MarkdownRendererProps) {
  const [content, setContent] = useState(providedContent ?? "");
  const [loading, setLoading] = useState(providedContent === undefined);

  useEffect(() => {
    if (providedContent !== undefined) {
      setContent(providedContent);
      setLoading(false);
      return;
    }

    const cacheKey = `${meta.path}:${meta.size}`;
    const cachedContent = markdownContentCache.get(cacheKey);
    if (cachedContent) {
      setContent(cachedContent);
      setLoading(false);
      return;
    }

    setLoading(true);

    const load = async () => {
      try {
        if (meta.size > 1024 * 1024 * 2) { // > 2MB
             const largeFileContent = "# File too large\n\nPreviewing large markdown files is disabled for performance.";
             markdownContentCache.set(cacheKey, largeFileContent);
             setContent(largeFileContent);
        } else {
             const text = await readTextFile(meta.path);
             markdownContentCache.set(cacheKey, text);
             setContent(text);
        }
      } catch (e) {
        setContent(`# Error\n\nCould not read file: ${e}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [meta.path, meta.size, providedContent]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-muted-foreground"/></div>;

  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar bg-transparent">
      <MarkdownContent
        content={content}
        variant="github"
        className="p-6 text-sm"
      />
    </div>
  );
}
