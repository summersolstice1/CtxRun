import { useEffect } from 'react';
import { open } from '@tauri-apps/plugin-shell';
import { useTranslation } from 'react-i18next';
import { MAX_INLINE_PREVIEW_BYTES, OVERSIZED_PREVIEW_ERROR } from '@/lib/previewLimits';
import { usePreviewStore } from '@/store/usePreviewStore';
import { FileText, Pin, PinOff, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { PreviewContent } from './PreviewContent';
import { PreviewModeSwitch } from './PreviewModeSwitch';

function formatBytes(value: number) {
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }
  if (value >= 1024 * 1024) {
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

export function PreviewModal() {
  const { t } = useTranslation();
  const {
    isOpen,
    activeFile,
    activeMode,
    isLoading,
    error,
    isPinned,
    closePreview,
    setActiveMode,
    togglePinned,
  } = usePreviewStore();
  const isOversizedPreview = error === OVERSIZED_PREVIEW_ERROR;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isPinned) {
        e.preventDefault();
        e.stopPropagation();
        closePreview();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, isPinned, closePreview]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-8"
          onClick={isPinned ? undefined : closePreview}
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
                         <span className="font-medium text-sm truncate">{activeFile?.name || t('peek.loading')}</span>
                         {activeFile && <span className="text-[10px] text-muted-foreground font-mono">{activeFile.mime} • {activeFile.size.toLocaleString()} bytes</span>}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {activeFile && !error && activeFile.supportedModes.length > 1 && (
                        <PreviewModeSwitch
                          modes={activeFile.supportedModes}
                          value={activeMode}
                          onChange={setActiveMode}
                        />
                    )}
                    <button
                      onClick={togglePinned}
                      className="rounded p-1.5 transition-colors hover:bg-secondary/70"
                      title={isPinned ? t('peek.unpinPreview') : t('peek.pinPreview')}
                    >
                        {isPinned ? <PinOff size={18} /> : <Pin size={18} />}
                    </button>
                    <button onClick={closePreview} className="p-1.5 hover:bg-destructive/10 hover:text-destructive rounded transition-colors">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Content Body */}
            <div className="flex-1 bg-card relative overflow-hidden">
                {isLoading ? (
                    <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                        {t('peek.loading')}
                    </div>
                ) : error ? (
                    <div className="absolute inset-0 flex items-center justify-center px-6 text-destructive flex-col gap-3 text-center">
                        <p className="font-bold">
                          {isOversizedPreview ? t('peek.oversizedTitle') : t('peek.failed')}
                        </p>
                        <p className="max-w-xl text-sm opacity-80">
                          {isOversizedPreview
                            ? t('peek.oversizedDescription', { limit: formatBytes(MAX_INLINE_PREVIEW_BYTES) })
                            : error}
                        </p>
                        {isOversizedPreview && activeFile && (
                          <button
                            type="button"
                            onClick={() => void open(activeFile.path).catch(() => undefined)}
                            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary/90"
                          >
                            {t('peek.openExternal')}
                          </button>
                        )}
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
