import { useEffect, useRef, useState } from 'react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { invoke } from '@tauri-apps/api/core';
import {
  Check,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  FolderOpen,
  History,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useAppStore } from '@/store/useAppStore';
import { cn, getPathLabel } from '@/lib/utils';

export function WorkspaceSwitcher() {
  const { t } = useTranslation();
  const [projectRoot, recentProjectRoots, setProjectRoot, clearProjectRoot] = useAppStore(
    useShallow((state) => [
      state.projectRoot,
      state.recentProjectRoots,
      state.setProjectRoot,
      state.clearProjectRoot,
    ])
  );

  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const currentLabel = projectRoot ? getPathLabel(projectRoot) : t('workspace.choose');
  const recentRoots = recentProjectRoots.filter((path) => path !== projectRoot);

  const handleChooseWorkspace = async () => {
    try {
      const selected = await openDialog({ directory: true, multiple: false, recursive: false });
      if (typeof selected === 'string') {
        setProjectRoot(selected);
        setIsOpen(false);
      }
    } catch (error) {
      console.error('Failed to choose workspace:', error);
    }
  };

  const handleCopyPath = async (path?: string | null) => {
    if (!path) return;

    try {
      await writeText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      console.error('Failed to copy workspace path:', error);
    }
  };

  const handleOpenFolder = async (path?: string | null) => {
    if (!path) return;

    try {
      await invoke('open_folder_in_file_manager', { path });
    } catch (error) {
      console.error('Failed to open workspace folder:', error);
    }
  };

  return (
    <div className="relative pointer-events-auto">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        title={projectRoot || t('workspace.choose')}
        className={cn(
          'flex items-center gap-2 rounded-md border border-border/50 bg-secondary/30 px-2 py-0.5 transition-colors hover:bg-secondary/50',
          isOpen && 'border-primary/40 bg-secondary/60'
        )}
      >
        <FolderOpen size={12} className="text-primary/70" />
        <span className="max-w-[180px] truncate text-[10px] font-medium text-muted-foreground">
          {currentLabel}
        </span>
        <ChevronsUpDown size={11} className="text-muted-foreground/70" />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full left-0 z-50 mt-2 w-[340px] overflow-hidden rounded-lg border border-border bg-popover shadow-xl animate-in fade-in zoom-in-95 duration-150"
        >
          <div className="space-y-4 p-4">
            <div className="space-y-1">
              <div className="text-sm font-semibold text-foreground">{t('workspace.title')}</div>
              <p className="text-xs leading-relaxed text-muted-foreground">{t('workspace.sharedHint')}</p>
            </div>

            <div className="rounded-lg border border-border/60 bg-secondary/20 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {t('workspace.current')}
              </div>
              {projectRoot ? (
                <div className="mt-2 space-y-1">
                  <div className="truncate text-sm font-medium text-foreground" title={projectRoot}>
                    {getPathLabel(projectRoot)}
                  </div>
                  <div className="break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                    {projectRoot}
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-sm text-muted-foreground">{t('workspace.notSelected')}</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleChooseWorkspace}
                className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <FolderOpen size={14} />
                {t('workspace.switch')}
              </button>
              <button
                type="button"
                onClick={() => handleCopyPath(projectRoot)}
                disabled={!projectRoot}
                className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                {t('workspace.copyPath')}
              </button>
              <button
                type="button"
                onClick={() => handleOpenFolder(projectRoot)}
                disabled={!projectRoot}
                className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <ExternalLink size={14} />
                {t('workspace.openFolder')}
              </button>
              <button
                type="button"
                onClick={() => {
                  clearProjectRoot();
                  setIsOpen(false);
                }}
                disabled={!projectRoot}
                className="flex items-center justify-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={14} />
                {t('workspace.clear')}
              </button>
            </div>

            <div className="space-y-2 border-t border-border pt-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                <History size={13} className="text-primary/70" />
                {t('workspace.recent')}
              </div>
              {recentRoots.length > 0 ? (
                <div className="space-y-1">
                  {recentRoots.map((path) => (
                    <button
                      key={path}
                      type="button"
                      onClick={() => {
                        setProjectRoot(path);
                        setIsOpen(false);
                      }}
                      className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-secondary/60"
                      title={path}
                    >
                      <FolderOpen size={13} className="mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-foreground">{getPathLabel(path)}</div>
                        <div className="truncate font-mono text-[10px] text-muted-foreground">{path}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-md bg-secondary/20 px-3 py-2 text-xs text-muted-foreground">
                  {t('workspace.emptyRecent')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
