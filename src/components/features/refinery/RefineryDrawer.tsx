import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X, Copy, Trash2, Star, Calendar, Monitor,
  HardDrive, ArrowUpRight, Loader2, Image as ImageIcon,
  Edit2, Save, PenTool
} from 'lucide-react';
import { useRefineryStore } from '@/store/useRefineryStore';
import { useAppStore } from '@/store/useAppStore';
import { invoke } from '@tauri-apps/api/core';
import { formatTimeAgo } from '@/lib/refinery_utils';
import { cn } from '@/lib/utils';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { useImageLoader } from '@/hooks/useImageLoader';
import { getText } from '@/lib/i18n';

export function RefineryDrawer() {
  const {
    activeId, items, isDrawerOpen, setDrawerOpen,
    deleteItem, togglePin, updateNote, loadItemDetail
  } = useRefineryStore();
  const { language } = useAppStore();

  const activeItem = items.find((i) => i.id === activeId);
  const imagePath = activeItem?.kind === 'image' ? activeItem.content : null;
  const { imageUrl, isLoading } = useImageLoader(imagePath);

  // 编辑状态
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  // 当选中的 Item 改变时，重置状态
  useEffect(() => {
    if (activeItem) {
      // 如果是文本类型且 content 为空，加载完整内容
      if (activeItem.kind === 'text' && !activeItem.content && activeId) {
        loadItemDetail(activeId);
        return; // 等待加载完成
      }

      setEditTitle(activeItem.title || '');
      setEditContent(activeItem.content || '');

      // 如果是刚创建的手动笔记且为空，自动进入编辑模式
      if (activeItem.isManual && !activeItem.content && !activeItem.isEdited) {
        setIsEditing(true);
      } else {
        setIsEditing(false);
      }
    }
  }, [activeItem?.id, activeItem?.content]);

  const handleCopy = async () => {
    if (!activeItem) return;
    try {
      if (activeItem.kind === 'text') {
        // 如果在编辑模式，复制编辑中的内容
        await invoke('copy_refinery_text', { text: isEditing ? editContent : activeItem.content });
      } else if (activeItem.kind === 'image' && activeItem.content) {
        await invoke('copy_refinery_image', { imagePath: activeItem.content });
      }
    } catch (e) {
      console.error('Failed to copy:', e);
    }
  };

  const handleDelete = () => {
    if (!activeItem) return;
    deleteItem(activeItem.id);
    setDrawerOpen(false);
  };

  const handleSave = async () => {
    if (!activeItem) return;
    await updateNote(activeItem.id, editContent, editTitle);
    setIsEditing(false);
  };

  const handleCancel = () => {
    if (!activeItem) return;
    // 恢复原值
    setEditTitle(activeItem.title || '');
    setEditContent(activeItem.content || '');
    setIsEditing(false);
  };

  const isImage = activeItem?.kind === 'image';

  return (
    <AnimatePresence>
      {isDrawerOpen && activeItem && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setDrawerOpen(false)}
            className="fixed inset-0 bg-black/20 backdrop-blur-[1px] z-[60]"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 h-full w-[66vw] max-w-[800px] bg-background border-l border-border shadow-2xl z-[70] flex flex-col"
          >
            {/* 1. Header Area */}
            <div className="flex flex-col border-b border-border/50 shrink-0 bg-background z-10">
              {/* Tools Row */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <button
                    onClick={() => setDrawerOpen(false)}
                    className="p-1.5 hover:bg-secondary rounded-full transition-colors text-foreground"
                  >
                    <X size={18} />
                  </button>
                  <div className="h-4 w-px bg-border/60" />
                  <span className="text-[10px] flex items-center gap-1.5 uppercase tracking-wider font-bold opacity-70">
                    {activeItem.isManual ? (
                      <><PenTool size={12} /> Note</>
                    ) : (
                      <><Monitor size={12} /> {activeItem.sourceApp || 'System'}</>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {!isEditing ? (
                    <>
                      <ActionBtn onClick={() => setIsEditing(true)} icon={<Edit2 size={16} />} title="Edit" />
                      <div className="h-4 w-px bg-border/60 mx-1" />
                      <ActionBtn onClick={() => togglePin(activeItem.id)} active={activeItem.isPinned} icon={<Star size={16} />} />
                      <ActionBtn onClick={handleCopy} icon={<Copy size={16} />} />
                      <ActionBtn onClick={handleDelete} icon={<Trash2 size={16} />} className="hover:text-destructive" />
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleCancel}
                        className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary rounded-md transition-colors mr-2"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSave}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md shadow-sm transition-colors"
                      >
                        <Save size={14} />
                        Save Changes
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Title Row */}
              <div className="px-6 pb-4 pt-1">
                {isEditing ? (
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Add a title..."
                    className="w-full text-lg font-bold bg-secondary/30 border border-transparent focus:border-primary/30 focus:bg-background rounded-md px-2 py-1 outline-none transition-all placeholder:text-muted-foreground/40"
                    autoFocus={!activeItem.title}
                  />
                ) : (
                  <h2 className={cn(
                    "text-lg font-bold px-2 py-1 leading-tight break-words",
                    !activeItem.title && "text-muted-foreground/50 italic font-normal"
                  )}>
                    {activeItem.title || (language === 'zh' ? '无标题' : 'Untitled Note')}
                  </h2>
                )}
              </div>

              {/* Metadata Bar */}
              <div className="px-6 py-2 bg-secondary/10 border-t border-border/30 flex items-center gap-4 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar size={10} />
                  {formatTimeAgo(activeItem.createdAt, language)}
                </span>
                <span className="flex items-center gap-1">
                  <HardDrive size={10} />
                  {activeItem.sizeInfo}
                </span>
                {activeItem.isEdited && (
                  <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 border border-orange-500/20">
                    Edited
                  </span>
                )}
              </div>
            </div>

            {/* 2. Content Body */}
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-background relative scrollbar-hide">
              {isImage ? (
                <div className="p-8 flex flex-col items-center min-h-full justify-center bg-secondary/5">
                  {isLoading ? (
                    <Loader2 className="animate-spin text-muted-foreground" />
                  ) : imageUrl ? (
                    <div className="relative shadow-lg rounded-lg overflow-hidden border border-border">
                      <img src={imageUrl} alt="Content" className="max-w-full h-auto block" />
                    </div>
                  ) : (
                    <div className="text-destructive flex flex-col items-center gap-2">
                      <ImageIcon size={32} />
                      <span>Image load failed</span>
                    </div>
                  )}
                  {isEditing && (
                    <div className="mt-4 p-3 bg-yellow-500/10 text-yellow-600 text-xs rounded border border-yellow-500/20">
                      Image content cannot be edited, only title.
                    </div>
                  )}
                </div>
              ) : (
                // Text Content
                isEditing ? (
                  <div className="h-full p-6">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full h-full min-h-[400px] resize-none bg-transparent outline-none font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/20"
                      placeholder="Start typing..."
                      spellCheck={false}
                    />
                  </div>
                ) : (
                  <div className="p-6">
                    <CodeBlock
                      language={activeItem.metaParsed.format || 'text'}
                      className="text-sm shadow-sm border border-border/50 bg-secondary/5 min-h-[200px]"
                    >
                      {activeItem.content || ''}
                    </CodeBlock>
                  </div>
                )
              )}
            </div>

            {/* 3. Footer Actions (Context) */}
            {!isEditing && (
              <div className="p-4 border-t border-border bg-background/95 backdrop-blur shrink-0 flex justify-end">
                <button className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-xs font-medium shadow-sm transition-all active:scale-95">
                  <ArrowUpRight size={14} />
                  {getText('refinery', 'sendToContext', language)}
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ActionBtn({ icon, onClick, active, className, title }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'p-2 rounded-md transition-all text-muted-foreground hover:text-foreground hover:bg-secondary',
        active && 'text-orange-500 bg-orange-500/5 hover:bg-orange-500/10',
        className
      )}
      title={title}
    >
      {icon}
    </button>
  );
}
