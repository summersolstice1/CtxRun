import { AnimatePresence, motion } from 'framer-motion';
import { X, Copy, Trash2, Star, Share2, Calendar, Monitor, HardDrive, ArrowUpRight, Loader2, Image as ImageIcon } from 'lucide-react';
import { useRefineryStore } from '@/store/useRefineryStore';
import { useAppStore } from '@/store/useAppStore';
import { invoke } from '@tauri-apps/api/core';
import { formatTimeAgo } from '@/lib/refinery_utils';
import { cn } from '@/lib/utils';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { useImageLoader } from '@/hooks/useImageLoader';
import { getText } from '@/lib/i18n';

export function RefineryDrawer() {
  const { activeId, items, isDrawerOpen, setDrawerOpen, deleteItem, togglePin } = useRefineryStore();
  const { language } = useAppStore();

  const activeItem = items.find((i) => i.id === activeId);
  const imagePath = activeItem?.kind === 'image' ? activeItem.content : null;
  const { imageUrl, isLoading, error } = useImageLoader(imagePath);

  const handleCopy = async () => {
    if (!activeItem) return;
    try {
      if (activeItem.kind === 'text') {
        await invoke('copy_refinery_text', { text: activeItem.content || '' });
      } else if (activeItem.kind === 'image' && activeItem.content) {
        await invoke('copy_refinery_image', { imagePath: activeItem.content });
      }
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const handleDelete = () => {
    if (!activeItem) return;
    if (confirm(getText('refinery', 'deleteConfirm', language))) {
      deleteItem(activeItem.id);
      setDrawerOpen(false);
    }
  };

  const handleShare = async () => {
    if (!activeItem) return;
    // TODO: Implement share functionality
    console.log('Share:', activeItem.id);
  };

  return (
    <AnimatePresence>
      {isDrawerOpen && activeItem && (
        <>
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[60]"
          />

          {/* Drawer Content (2/3 width) */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-[66vw] bg-background border-l border-border shadow-2xl z-[70] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border/50 shrink-0">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setDrawerOpen(false)}
                  className="p-2 hover:bg-secondary rounded-full transition-colors"
                  title={getText('refinery', 'close', language)}
                >
                  <X size={20} />
                </button>
                <div className="h-4 w-px bg-border/60" />
                <div className="flex flex-col">
                  <span className="text-sm font-bold truncate max-w-md">
                    {activeItem.kind === 'image'
                      ? getText('refinery', 'imageAsset', language)
                      : getText('refinery', 'textSnippet', language)}
                  </span>
                  {activeItem.sourceApp && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Monitor size={10} />
                      {activeItem.sourceApp}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <ActionBtn
                  onClick={() => togglePin(activeItem.id)}
                  active={activeItem.isPinned}
                  icon={<Star size={16} />}
                  title={activeItem.isPinned ? getText('refinery', 'unpin', language) : getText('refinery', 'pin', language)}
                />
                <ActionBtn onClick={handleCopy} icon={<Copy size={16} />} title={getText('refinery', 'copy', language)} />
                <ActionBtn onClick={handleShare} icon={<Share2 size={16} />} title={getText('refinery', 'share', language)} />
                <div className="h-4 w-px bg-border/60 mx-1" />
                <ActionBtn
                  onClick={handleDelete}
                  icon={<Trash2 size={16} />}
                  title={getText('refinery', 'delete', language)}
                  className="hover:text-destructive"
                />
              </div>
            </div>

            {/* Meta Info Bar */}
            <div className="px-6 py-3 border-b border-border/30 bg-secondary/20 flex items-center gap-4 text-[10px] text-muted-foreground shrink-0">
              <span className="flex items-center gap-1">
                <Calendar size={10} />
                {formatTimeAgo(activeItem.createdAt, language)}
              </span>
              <span className="flex items-center gap-1">
                <HardDrive size={10} />
                ID: {activeItem.id.slice(0, 8)}
              </span>
              <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded border border-primary/20 font-mono">
                {activeItem.sizeInfo}
              </span>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-10">
              {activeItem.kind === 'image' ? (
                <div className="flex flex-col items-center gap-6">
                  {isLoading ? (
                    <div className="flex flex-col items-center gap-4 text-muted-foreground/40">
                      <Loader2 size={48} className="animate-spin" />
                      <span className="text-sm">{getText('refinery', 'loadingImage', language)}</span>
                    </div>
                  ) : error ? (
                    <div className="flex flex-col items-center gap-4 text-destructive/60">
                      <ImageIcon size={48} />
                      <span className="text-sm">{getText('refinery', 'failedToLoadImage', language)}</span>
                      <span className="text-xs">{error}</span>
                    </div>
                  ) : imageUrl ? (
                    <div className="relative group max-w-full">
                      <img
                        src={imageUrl}
                        className="max-w-full rounded-lg shadow-lg border border-border/20"
                        alt="Content"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur text-white text-[10px] p-3 flex justify-between opacity-0 group-hover:opacity-100 transition-opacity rounded-b-lg">
                        <span className="truncate max-w-[60%]">{activeItem.content}</span>
                        <span className="font-mono">
                          {activeItem.metaParsed.width}x{activeItem.metaParsed.height}
                        </span>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="max-w-4xl mx-auto">
                  <CodeBlock
                    language={activeItem.metaParsed.format || 'text'}
                    className="text-sm shadow-sm border border-border/50"
                  >
                    {activeItem.content || ''}
                  </CodeBlock>
                </div>
              )}
            </div>

            {/* Footer Action Bar */}
            <div className="p-4 border-t border-border flex justify-end bg-background shrink-0">
              <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-xs font-medium shadow-sm transition-all active:scale-95">
                <ArrowUpRight size={14} />
                {getText('refinery', 'sendToContext', language)}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ActionBtn({
  icon,
  onClick,
  active,
  className,
  title
}: {
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'p-2.5 hover:bg-secondary rounded-xl transition-all text-muted-foreground hover:text-foreground',
        active && 'text-orange-500 fill-orange-500 bg-orange-500/5',
        className
      )}
      title={title}
    >
      {icon}
    </button>
  );
}
