import { useMemo } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Copy, Trash2, ArrowUpRight, FileJson, Calendar, HardDrive } from 'lucide-react';
import { useRefineryStore } from '@/store/useRefineryStore';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useAppStore } from '@/store/useAppStore';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { cn } from '@/lib/utils';
import { formatTimeAgo } from '@/lib/refinery_utils';

export function ContentWorkbench() {
  const { items, activeId, deleteItem } = useRefineryStore();
  const { language } = useAppStore();

  const activeItem = useMemo(() =>
    items.find(i => i.id === activeId),
  [items, activeId]);

  if (!activeItem) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/30 gap-4 bg-background/50">
         <div className="w-24 h-24 rounded-2xl bg-secondary/20 flex items-center justify-center border border-dashed border-border">
            <FileJson size={32} />
         </div>
         <p className="text-sm">Select an item to view details</p>
      </div>
    );
  }

  const handleCopy = async () => {
      try {
          if (activeItem.kind === 'text') {
              await writeText(activeItem.content || '');
          } else {
              // 对于图片，通常只复制路径，或者后续实现读取二进制写入剪贴板
              await writeText(activeItem.content);
          }
      } catch (e) {
          console.error(e);
      }
  };

  const handleDelete = () => {
      if(confirm("Delete this item permanently?")) {
          deleteItem(activeItem.id);
      }
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background h-full overflow-hidden">

        {/* 1. Meta Header */}
        <div className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0 bg-secondary/5">
            <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                        {activeItem.kind === 'image' ? 'Image Asset' : 'Text Snippet'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded border border-primary/20 font-mono">
                        {activeItem.sizeInfo}
                    </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar size={10} /> {formatTimeAgo(activeItem.createdAt, language)}</span>
                    <span className="flex items-center gap-1"><HardDrive size={10} /> ID: {activeItem.id.slice(0, 8)}</span>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <button onClick={handleCopy} className="p-2 hover:bg-secondary rounded-md text-muted-foreground hover:text-foreground transition-colors" title="Copy Content">
                    <Copy size={16} />
                </button>
                <button onClick={handleDelete} className="p-2 hover:bg-destructive/10 rounded-md text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                    <Trash2 size={16} />
                </button>
            </div>
        </div>

        {/* 2. Content Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/50 dark:bg-[#0c0c0c]">
            {activeItem.kind === 'image' ? (
                <div className="h-full flex items-center justify-center min-h-[300px]">
                    <div className="relative group max-w-full max-h-full shadow-lg rounded-lg overflow-hidden border border-border bg-[url('https://transparenttextures.com/patterns/cubes.png')] bg-white/5">
                        <img
                            src={convertFileSrc(activeItem.content)}
                            alt="Refinery Content"
                            className="max-w-full max-h-[70vh] object-contain block"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur text-white text-[10px] p-2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                            <span>{activeItem.content}</span>
                            <span>{activeItem.metaParsed.width}x{activeItem.metaParsed.height}</span>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="max-w-4xl mx-auto">
                    <CodeBlock language={activeItem.metaParsed.format || 'text'} className="text-sm shadow-sm border border-border/50">
                        {activeItem.content || ''}
                    </CodeBlock>
                </div>
            )}
        </div>

        {/* 3. Action Bar (Bottom) - Placeholder for Context Action */}
        <div className="p-3 border-t border-border flex justify-end bg-background">
            <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-xs font-medium shadow-sm transition-all active:scale-95">
                <ArrowUpRight size={14} />
                Send to Context (Coming Soon)
            </button>
        </div>
    </div>
  );
}
