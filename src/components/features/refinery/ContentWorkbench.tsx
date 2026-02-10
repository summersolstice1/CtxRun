import { useMemo, useState, useEffect } from 'react';
import { Copy, Trash2, ArrowUpRight, Calendar, HardDrive, Globe, Monitor, Clipboard, Image as ImageIcon } from 'lucide-react';
import { useRefineryStore } from '@/store/useRefineryStore';
import { useAppStore } from '@/store/useAppStore';
import { invoke } from '@tauri-apps/api/core';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { formatTimeAgo } from '@/lib/refinery_utils';
import { readFile } from '@tauri-apps/plugin-fs';
import { cn } from '@/lib/utils';

const REFINERY_PLUGIN_PREFIX = 'plugin:ctxrun-plugin-refinery|';

export function ContentWorkbench() {
  const { items, activeId, deleteItem } = useRefineryStore();
  const { language } = useAppStore();
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const activeItem = useMemo(() =>
    items.find(i => i.id === activeId),
  [items, activeId]);

  // 统一处理图片 URL 获取逻辑
  // 如果是 image 类型，取 content；如果是 mixed 类型，取 metadata.image_path
  const imagePath = useMemo(() => {
    if (!activeItem) return null;
    if (activeItem.kind === 'image') return activeItem.content;
    if (activeItem.kind === 'mixed') return activeItem.metaParsed?.image_path;
    return null;
  }, [activeItem]);

  // 当选中图片项或混合项时，读取图片文件并转为 Blob URL
  useEffect(() => {
    let currentUrl: string | null = null;

    if (imagePath) {
      readFile(imagePath)
        .then((bytes) => {
          const blob = new Blob([bytes], { type: 'image/png' });
          const url = URL.createObjectURL(blob);
          currentUrl = url;
          setImageUrl(url);
        })
        .catch((err) => {
          console.error('Failed to load image:', err);
          setImageUrl(null);
        });
    } else {
      setImageUrl(null);
    }

    // Cleanup: 释放之前的 Blob URL
    return () => {
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [imagePath]);

  if (!activeItem) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/30 gap-4 bg-background/50">
         <div className="w-24 h-24 rounded-2xl bg-secondary/20 flex items-center justify-center border border-dashed border-border">
            <Clipboard size={32} />
         </div>
         <p className="text-sm">Select an item to view details</p>
      </div>
    );
  }

  const handleCopy = async () => {
      try {
          if (activeItem.kind === 'text') {
              await invoke(`${REFINERY_PLUGIN_PREFIX}copy_refinery_text`, { text: activeItem.content || '' });
          } else if (activeItem.kind === 'image' && activeItem.content) {
              await invoke(`${REFINERY_PLUGIN_PREFIX}copy_refinery_image`, { imagePath: activeItem.content });
          }
      } catch (e) {
          console.error('Failed to copy:', e);
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
                        {activeItem.kind === 'image' ? 'Image Asset' :
                         activeItem.kind === 'mixed' ? 'Mixed Content' : 'Text Snippet'}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary rounded border border-primary/20 font-mono">
                        {activeItem.sizeInfo}
                    </span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar size={10} /> {formatTimeAgo(activeItem.createdAt, language)}</span>
                    <span className="flex items-center gap-1"><HardDrive size={10} /> ID: {activeItem.id.slice(0, 8)}</span>
                    {activeItem.sourceApp && <span className="flex items-center gap-1"><Monitor size={10} /> {activeItem.sourceApp}</span>}
                    {activeItem.url && (
                        <a href={activeItem.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary hover:underline max-w-[200px] truncate" title={activeItem.url}>
                            <Globe size={10} /> {activeItem.url}
                        </a>
                    )}
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
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 bg-slate-50/50 dark:bg-card">
            <div className="max-w-4xl mx-auto flex flex-col gap-6">

                {/* A. 文本部分 (Text 或 Mixed) */}
                {(activeItem.kind === 'text' || activeItem.kind === 'mixed') && (
                    <CodeBlock language={activeItem.metaParsed.format || 'text'} className="text-sm shadow-sm border border-border/50">
                        {activeItem.content || ''}
                    </CodeBlock>
                )}

                {/* B. 图片部分 (Image 或 Mixed) */}
                {imagePath && (
                    <div className="flex flex-col gap-2">
                        {activeItem.kind === 'mixed' && (
                            <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider pl-1 flex items-center gap-2">
                                <ImageIcon size={12} /> Embedded Image
                            </div>
                        )}
                        <div className={cn(
                            "relative group rounded-lg overflow-hidden border border-border bg-background shadow-sm",
                            activeItem.kind === 'image' ? "flex items-center justify-center min-h-[300px]" : "w-full"
                        )}>
                            {/* 透明棋盘格背景 */}
                            <div className="absolute inset-0 z-0 opacity-50"
                                style={{
                                    backgroundImage: `
                                        linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
                                        linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
                                        linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
                                        linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)
                                    `,
                                    backgroundSize: '20px 20px',
                                    backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px'
                                }}
                            />
                            <div className="relative z-10 w-full h-full flex justify-center">
                                {imageUrl ? (
                                    <img
                                        src={imageUrl}
                                        alt="Refinery Content"
                                        className="max-w-full max-h-[70vh] object-contain block"
                                    />
                                ) : (
                                    <div className="p-10 text-muted-foreground">Loading image...</div>
                                )}
                            </div>
                            {/* 图片信息浮层 */}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur text-white text-[10px] p-2 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity z-20">
                                <span className="truncate max-w-[70%]">{imagePath}</span>
                                <span>{activeItem.metaParsed.width}x{activeItem.metaParsed.height}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
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
