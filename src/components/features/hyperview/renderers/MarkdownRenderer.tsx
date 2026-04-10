import { useEffect, useState } from "react";
import { FileMeta } from "@/types/hyperview";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Loader2 } from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";
import { createStringLruCache } from "./previewTextCache";

const markdownContentCache = createStringLruCache();

interface MarkdownRendererProps {
  meta: FileMeta;
  content?: string;
}

export function MarkdownRenderer({ meta, content: providedContent }: MarkdownRendererProps) {
  const [content, setContent] = useState(providedContent ?? "");
  const [loading, setLoading] = useState(providedContent === undefined);

  useEffect(() => {
    let cancelled = false;

    if (providedContent !== undefined) {
      setContent(providedContent);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const cacheKey = `${meta.path}:${meta.size}`;
    const cachedContent = markdownContentCache.get(cacheKey);
    if (cachedContent) {
      setContent(cachedContent);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);

    const load = async () => {
      try {
        const nextContent =
          meta.size > 1024 * 1024 * 2
            ? "# File too large\n\nPreviewing large markdown files is disabled for performance."
            : await readTextFile(meta.path);
        markdownContentCache.set(cacheKey, nextContent);
        if (!cancelled) {
          setContent(nextContent);
        }
      } catch (e) {
        if (!cancelled) {
          setContent(`# Error\n\nCould not read file: ${e}`);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
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
