import { useEffect } from 'react';
import { usePreviewStore } from '@/store/usePreviewStore';
import { X, FileText } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { PreviewContent } from './PreviewContent';
import { PreviewModeSwitch } from './PreviewModeSwitch';

export function PreviewModal() {
  const { isOpen, activeFile, activeMode, isLoading, error, closePreview, setActiveMode } = usePreviewStore();

  // 监听 ESC 关闭
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        closePreview();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true); // Capture phase
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, closePreview]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-8"
          onClick={closePreview}
        >
          <div
            className="w-full max-w-5xl h-[80vh] bg-background border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col relative"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="h-12 border-b border-border flex items-center justify-between px-4 bg-secondary/10 shrink-0 select-none">
                <div className="flex items-center gap-3 overflow-hidden">
                    <div className="p-1.5 bg-secondary rounded text-muted-foreground">
                        <FileText size={16} />
                    </div>
                    <div className="flex flex-col min-w-0">
                         <span className="font-medium text-sm truncate">{activeFile?.name || 'Loading...'}</span>
                         {activeFile && <span className="text-[10px] text-muted-foreground font-mono">{activeFile.mime} • {activeFile.size.toLocaleString()} bytes</span>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {activeFile && activeFile.supportedModes.length > 1 && (
                        <PreviewModeSwitch
                          modes={activeFile.supportedModes}
                          value={activeMode}
                          onChange={setActiveMode}
                        />
                    )}
                    <button onClick={closePreview} className="p-1.5 hover:bg-destructive/10 hover:text-destructive rounded transition-colors">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 bg-card relative overflow-hidden">
                {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                        Loading metadata...
                    </div>
                ) : error ? (
                    <div className="absolute inset-0 flex items-center justify-center text-destructive flex-col gap-2">
                        <p className="font-bold">Preview Failed</p>
                        <p className="text-sm opacity-80">{error}</p>
                    </div>
                ) : activeFile ? (
                   <PreviewContent meta={activeFile} mode={activeMode} />
                ) : null}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
