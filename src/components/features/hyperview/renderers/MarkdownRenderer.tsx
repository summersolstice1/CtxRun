import { useEffect, useState } from "react";
import { FileMeta } from "@/types/hyperview";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { Loader2 } from "lucide-react";
import { MarkdownContent } from "@/components/ui/MarkdownContent";

export function MarkdownRenderer({ meta }: { meta: FileMeta }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        if (meta.size > 1024 * 1024 * 2) { // > 2MB
             setContent("# File too large\n\nPreviewing large markdown files is disabled for performance.");
        } else {
             const text = await readTextFile(meta.path);
             setContent(text);
        }
      } catch (e) {
        setContent(`# Error\n\nCould not read file: ${e}`);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [meta.path]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-muted-foreground"/></div>;

  return (
    <div className="h-full w-full overflow-y-auto custom-scrollbar bg-background">
      <MarkdownContent
        content={content}
        className="max-w-4xl mx-auto p-8 text-sm leading-relaxed"
      />
    </div>
  );
}
