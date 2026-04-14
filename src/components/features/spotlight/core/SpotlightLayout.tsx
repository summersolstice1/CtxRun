import { DragEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { cn } from '@/lib/utils';
import { useSpotlight } from './SpotlightContext';
import uploadAnimationUrl from '@/assets/upload-files.lottie';

interface SpotlightLayoutProps {
  children: ReactNode;
  header: ReactNode;
  resultCount?: number; // 用于 Footer 显示
  isStreaming?: boolean;
  footerStatusAddon?: ReactNode;
  footerActions?: ReactNode;
  overlay?: ReactNode;
}

export function SpotlightLayout({
  children,
  header,
  resultCount = 0,
  isStreaming = false,
  footerStatusAddon,
  footerActions,
  overlay,
}: SpotlightLayoutProps) {
  const { mode, addAttachments, clearAttachmentError } = useSpotlight();
  const { t } = useTranslation();
  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  const hasDraggedFiles = (e: DragEvent<HTMLDivElement>) =>
    Array.from(e.dataTransfer?.types ?? []).includes('Files');

  useEffect(() => {
    if (mode !== 'chat') {
      dragDepthRef.current = 0;
      setIsDragOver(false);
    }
  }, [mode]);

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (mode !== 'chat') return;
    dragDepthRef.current += 1;
    clearAttachmentError();
    setIsDragOver(true);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (mode !== 'chat') return;
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
    if (!isDragOver) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (mode !== 'chat') return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragOver(false);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    if (!hasDraggedFiles(e)) return;
    e.preventDefault();
    e.stopPropagation();
    if (mode !== 'chat') return;
    dragDepthRef.current = 0;
    setIsDragOver(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      await addAttachments(files);
    }
  };

  // 辅助函数：获取左侧状态文字
  const getStatusText = () => {
    switch (mode) {
      case 'search':
        return `${resultCount} ${t('spotlight.results')}`;
      case 'clipboard':
        return t('spotlight.clipboardConsole');
      case 'chat':
      default:
        return t('spotlight.console');
    }
  };

  return (
    // 外层透明包裹：p-[1px] 给 border/ring 留出渲染空间，防止圆角边缘被系统窗口裁切产生锯齿
    <div
      className="w-screen h-screen flex flex-col items-center bg-transparent font-sans overflow-hidden p-[1px]"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="w-full h-full flex flex-col bg-background/95 backdrop-blur-xl border border-border/50 rounded-lg shadow-2xl ring-1 ring-black/5 dark:ring-white/10 transition-all duration-300 relative overflow-hidden">
        
        {/* 背景特效 */}
        <div className={cn("absolute inset-0 pointer-events-none transition-opacity duration-1000 ease-in-out", mode === 'chat' ? "opacity-100" : "opacity-0")}>
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-cyan-500/10" />
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-purple-500/5 to-transparent" />
        </div>

        {/* 顶部搜索栏 */}
        {header}

        {/* 内容区域 */}
        <div className="relative z-10 flex-1 min-h-0 flex flex-col">
            {children}
        </div>

        {overlay}

        {mode === 'chat' && isDragOver && (
          <div className="absolute inset-0 z-30 pointer-events-none flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
            <DotLottieReact
              src={uploadAnimationUrl}
              autoplay
              loop
              className="w-48 h-48 select-none"
            />
          </div>
        )}
        
        {/* 底部 Footer */}
        <div data-tauri-drag-region className="h-8 shrink-0 bg-secondary/30 border-t border-border/40 flex items-center justify-between px-4 text-[10px] text-muted-foreground/60 select-none backdrop-blur-sm cursor-move relative z-10">
            <span className="pointer-events-none flex items-center gap-2">
                {getStatusText()}
                {/* 只有在 AI 模式且正在生成时才显示呼吸灯 */}
                {mode === 'chat' && isStreaming && <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />}
                {footerStatusAddon}
            </span>
            <div className="flex gap-4 pointer-events-none">
                {footerActions ?? (
                  <>
                      {/* 模式 1 & 3：搜索和剪贴板共用类似的导航提示 */}
                      {(mode === 'search' || mode === 'clipboard') ? (
                          <>
                              <span>{t('spotlight.nav')} ↑↓</span>
                              {/* 已移除：Alt + 1~9 Quick Paste 提示 */}
                              <span>{mode === 'clipboard' ? 'Paste' : t('spotlight.copy')} ↵</span>
                          </>
                      ) : (
                          /* 模式 2：AI 聊天提示 */
                          <>
                          <span className={cn(isStreaming && "opacity-30")}>{t('spotlight.clear')} Ctrl+K</span>
                          <span>{t('spotlight.send')} ↵</span>
                          </>
                      )}
                      <span>{t('spotlight.resizeModeToggle')} F8</span>
                      <span>{t('spotlight.close')} Esc</span>
                  </>
                )}
            </div>
        </div>
      </div>
    </div>
  );
}
