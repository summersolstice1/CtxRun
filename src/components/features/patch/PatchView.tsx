import { useState, useEffect } from 'react';
import { open as openDialog, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { writeText as writeClipboard } from '@tauri-apps/plugin-clipboard-manager';
import { useAppStore } from '@/store/useAppStore';
import { useTranslation } from 'react-i18next';
import { parseMultiFilePatch, applyPatches } from '@/lib/patch_parser';
import { PatchSidebar } from './PatchSidebar';
import { DiffWorkspace } from './DiffWorkspace';
import { PatchMode, PatchFileItem, ExportFormat, ExportLayout } from './patch_types';
import { Toast, ToastType } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { Loader2, Wand2, AlertTriangle, FileText, Check } from 'lucide-react';
import { streamChatCompletion } from '@/lib/llm';
import { invoke } from '@tauri-apps/api/core';
import { ExportDialog } from './dialogs/ExportDialog';

const GIT_PLUGIN_PREFIX = 'plugin:ctxrun-plugin-git|';

const MANUAL_DIFF_ID = 'manual-scratchpad';

interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

interface GitDiffFile {
  path: string;
  status: 'Added' | 'Modified' | 'Deleted' | 'Renamed';
  original_content: string;
  modified_content: string;
  is_binary: boolean; 
  is_large: boolean;  
}

export function PatchView() {
  const { aiConfig, projectRoot: globalProjectRoot, setProjectRoot } = useAppStore();
  const { t } = useTranslation();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [mode, setMode] = useState<PatchMode>('diff');

  const [yamlInput, setYamlInput] = useState('');

  const [files, setFiles] = useState<PatchFileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);

  const [selectedExportIds, setSelectedExportIds] = useState<Set<string>>(new Set());
  const [toastState, setToastState] = useState<{ show: boolean; msg: string; type: ToastType }>({
    show: false,
    msg: '',
    type: 'success'
  });

  const [isFixing, setIsFixing] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{ show: boolean; file: PatchFileItem | null }>({
      show: false,
      file: null
  });

  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [baseHash, setBaseHash] = useState<string>('');
  const [compareHash, setCompareHash] = useState<string>('');
  const [isGitLoading, setIsGitLoading] = useState(false);

  const showNotification = (msg: string, type: ToastType = 'success') => {
    setToastState({ show: true, msg, type });
  };

  useEffect(() => {
    if (mode === 'diff') {
      const isManualOrGitFile = (f: PatchFileItem) => f.isManual || !!f.gitStatus;
      if (files.length > 0 && !files.every(isManualOrGitFile)) {
        setFiles(prev => prev.filter(isManualOrGitFile));
      }
      if (!files.some(f => f.id === MANUAL_DIFF_ID)) {
        const manualItem: PatchFileItem = { id: MANUAL_DIFF_ID, path: 'Manual Comparison', original: '', modified: '', status: 'success', isManual: true };
        setFiles(prev => [manualItem, ...prev]);
        if (!selectedFileId && !globalProjectRoot) {
          setSelectedFileId(MANUAL_DIFF_ID);
        }
      }
    } else if (mode === 'patch') {
      const aiFiles = files.filter(p => !p.isManual && !p.gitStatus);
      setFiles(aiFiles);
      if (selectedFileId === MANUAL_DIFF_ID || files.find(f => f.id === selectedFileId)?.gitStatus) {
        setSelectedFileId(aiFiles.length > 0 ? aiFiles[0].id : null);
      }
    }
  }, [mode]);

  const handleLoadPatchProject = async () => {
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        // Update global project root - shared across all features
        setProjectRoot(selected);
        showNotification(t('patch.projectLoaded'));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClear = () => {
      setYamlInput('');
      setFiles([]);
      setSelectedFileId(null);
  };

  const handleManualUpdate = (orig: string, mod: string) => {
      if (mode !== 'diff') return;
      setFiles(prev => prev.map(f => {
          if (f.id === MANUAL_DIFF_ID) return { ...f, original: orig, modified: mod };
          return f;
      }));
  };

  useEffect(() => {
    if (mode !== 'patch' || !globalProjectRoot || !yamlInput.trim()) {
      if(mode === 'patch') setFiles([]);
      return;
    }

    const timer = setTimeout(async () => {
        const filePatches = parseMultiFilePatch(yamlInput);
        const newFiles: PatchFileItem[] = await Promise.all(filePatches.map(async (fp) => {
            const fullPath = `${globalProjectRoot}/${fp.filePath}`;
            try {
                const original = await readTextFile(fullPath);
                const result = applyPatches(original, fp.operations);
                return { 
                    id: fullPath, 
                    path: fp.filePath, 
                    original, 
                    modified: result.modified, 
                    status: result.success ? 'success' : 'error', 
                    errorMsg: result.success ? undefined : t('patch.failedToMatch', { count: result.errors.length })
                };
            } catch (err) {
                return { 
                    id: fullPath, 
                    path: fp.filePath, 
                    original: '', 
                    modified: '', 
                    status: 'error', 
                    errorMsg: t('patch.fileNotFound') 
                };
            }
        }));
        
        setFiles(newFiles);
        const firstError = newFiles.find(f => f.status === 'error');
        if (firstError) {
          setSelectedFileId(firstError.id);
        } else if (newFiles.length > 0) {
          setSelectedFileId(newFiles[0].id);
        } else {
          setSelectedFileId(null);
        }
    }, 300);

    return () => clearTimeout(timer);
  }, [mode, globalProjectRoot, yamlInput, t]);

  const handleAiFix = async (file: PatchFileItem) => {
      if (isFixing || !file.original) return;
      const patchData = parseMultiFilePatch(yamlInput).find(p => p.filePath === file.path);
      if (!patchData) return;
      setIsFixing(true);
      showNotification(t('patch.aiRepairing'), 'info');
      const prompt = `...`; // 省略长字符串
      let fullResponse = "";
      try {
          await streamChatCompletion(
              [{ role: 'user', content: prompt }], aiConfig,
              (text) => { fullResponse += text; },
              (err) => { console.error(err); showNotification(t('patch.aiFixFailed'), 'error'); },
              () => {
                  const cleanCode = fullResponse.replace(/^```[\w]*\n/, '').replace(/\n```$/, '');
                  setFiles(prev => prev.map(f => f.id === file.id ? { ...f, modified: cleanCode, status: 'success', errorMsg: undefined } : f));
                  setIsFixing(false);
                  showNotification(t('patch.aiFixApplied'), 'success');
              }
          );
      } catch (e) {
          setIsFixing(false);
      }
  };
  
  const handleSaveClick = (file: PatchFileItem) => {
    if (!file.modified || file.isManual || file.gitStatus) return;
    setConfirmDialog({ show: true, file });
  };

  const executeSave = async () => {
    const file = confirmDialog.file;
    if (!file) return;
    try {
        await writeTextFile(file.id, file.modified);
        showNotification(t('patch.toastSaved'));
        setFiles(prev => prev.map(f => f.id === file.id ? { ...f, original: file.modified, status: 'success', errorMsg: undefined } : f));
        setConfirmDialog({ show: false, file: null });
    } catch (e) {
        console.error(e);
        showNotification(t('patch.saveFailed'), 'error');
    }
  };

  // =================================================================
  // Git 相关逻辑函数
  // =================================================================

  const handleBrowseGitProject = async () => {
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (typeof selected === 'string') {
        // Update global project root - shared across all features
        setProjectRoot(selected);
        setIsGitLoading(true);
        try {
          const result = await invoke<GitCommit[]>(`${GIT_PLUGIN_PREFIX}get_git_commits`, { projectPath: selected });
          setCommits(result);

          // 修改此处逻辑：默认对比 Working Directory 和 HEAD
          if (result.length > 0) {
            setBaseHash(result[0].hash); // HEAD
            setCompareHash("__WORK_DIR__"); // Working Directory
          }
        } catch (err: any) {
          showNotification(t('common.errorMsg', { msg: err.toString() }), 'error');
          setCommits([]);
        } finally {
          setIsGitLoading(false);
        }
      }
    } catch (e) { console.error(e); }
  };

  const handleGenerateDiff = async () => {
    if (!globalProjectRoot || !baseHash || !compareHash) return;
    setIsGitLoading(true);
    setFiles(prev => prev.filter(p => p.isManual));
    setSelectedFileId(null);
    try {
      const result = await invoke<GitDiffFile[]>(`${GIT_PLUGIN_PREFIX}get_git_diff`, {
        projectPath: globalProjectRoot,
        oldHash: baseHash,
        newHash: compareHash,
      });
      
      const newFiles: PatchFileItem[] = result.map(f => ({
        id: f.path, 
        path: f.path, 
        original: f.original_content, 
        modified: f.modified_content,
        status: 'success', 
        gitStatus: f.status,
        isBinary: f.is_binary,
        isLarge: f.is_large
      }));

      setFiles(prev => [...prev.filter(p => p.isManual), ...newFiles]);
      
      // 智能默认选中：排除二进制和大文件
      const autoSelected = new Set(
          newFiles
            .filter(f => !f.isBinary && !f.isLarge)
            .map(f => f.id)
      );
      setSelectedExportIds(autoSelected);

      if (newFiles.length > 0) {
        setSelectedFileId(newFiles[0].id);
      } else {
         setSelectedFileId(MANUAL_DIFF_ID);
         showNotification(t('patch.noDiff'), 'info');
      }
    } catch (err: any) {
      showNotification(t('common.errorMsg', { msg: err.toString() }), 'error');
    } finally {
      setIsGitLoading(false);
    }
  };

  const [_isExporting, setIsExporting] = useState(false);

  const toggleFileExport = (id: string, checked: boolean) => {
      setSelectedExportIds(prev => {
          const next = new Set(prev);
          if (checked) next.add(id);
          else next.delete(id);
          return next;
      });
  };

  const handleExportTrigger = () => {
      if (!globalProjectRoot || !baseHash || !compareHash) return;
      if (selectedExportIds.size === 0) {
          showNotification(t('patch.selectOne'), "warning");
          return;
      }
      setIsExportDialogOpen(true);
  };

  const performExport = async (format: ExportFormat, layout: ExportLayout) => {
    setIsExportDialogOpen(false);
    setIsExporting(true);

    try {
        const extMap: Record<ExportFormat, string> = {
            'Markdown': 'md',
            'Json': 'json',
            'Xml': 'xml',
            'Txt': 'txt'
        };

        const filePath = await save({
            title: `Export ${layout} Diff as ${format}`,
            defaultPath: `diff_${layout.toLowerCase()}_${baseHash.slice(0,7)}_${compareHash.slice(0,7)}.${extMap[format]}`,
            filters: [{ name: format, extensions: [extMap[format]] }]
        });

        if (filePath) {
            const selectedList = Array.from(selectedExportIds);

            await invoke(`${GIT_PLUGIN_PREFIX}export_git_diff`, {
                projectPath: globalProjectRoot,
                oldHash: baseHash,
                newHash: compareHash,
                format: format,
                layout: layout,
                savePath: filePath,
                selectedPaths: selectedList
            });
            showNotification(t('patch.exportSuccess'), "success");
        }
    } catch (err: any) {
        showNotification(t('common.exportFailed', { msg: err.toString() }), 'error');
    } finally {
        setIsExporting(false);
    }
  };

  const currentFile = files.find(f => f.id === selectedFileId);

  return (
    <div className="h-full flex overflow-hidden bg-background relative">
      <div className={cn("shrink-0 transition-all duration-300 ease-in-out overflow-hidden border-r border-border", isSidebarOpen ? "w-[350px] opacity-100" : "w-0 opacity-0 border-none")}>
        <div className="w-[350px] h-full">
            <PatchSidebar
                mode={mode} setMode={setMode}
                projectRoot={globalProjectRoot} onLoadProject={handleLoadPatchProject}
                yamlInput={yamlInput} onYamlChange={setYamlInput} onClearYaml={handleClear}
                files={files} selectedFileId={selectedFileId} onSelectFile={setSelectedFileId}
                gitProjectRoot={globalProjectRoot} onBrowseGitProject={handleBrowseGitProject}
                commits={commits} baseHash={baseHash} setBaseHash={setBaseHash}
                compareHash={compareHash} setCompareHash={setCompareHash}
                onCompare={handleGenerateDiff} isGitLoading={isGitLoading}
                selectedExportIds={selectedExportIds}
                onToggleExport={toggleFileExport}
            />
        </div>
      </div>
      
      <div className="flex-1 flex flex-col min-w-0 relative">
          {currentFile && currentFile.status === 'error' && !currentFile.isManual && (
              <div className="absolute bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2">
                  <button onClick={() => handleAiFix(currentFile)} disabled={isFixing} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-full shadow-lg shadow-purple-500/20 transition-all active:scale-95 disabled:opacity-50">
                      {isFixing ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />}
                      {isFixing ? t('patch.aiFixing') : t('patch.fixAI')}
                  </button>
              </div>
          )}

          <DiffWorkspace
             selectedFile={currentFile || null}
             onSave={handleSaveClick}
             onCopy={async (txt) => { await writeClipboard(txt); showNotification(t('patch.copied')); }}
             onManualUpdate={handleManualUpdate}
             isSidebarOpen={isSidebarOpen}
             onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
             isReadOnly={currentFile?.isManual !== true}
             onExport={mode === 'diff' && globalProjectRoot ? handleExportTrigger : undefined}
          />
      </div>
      <ExportDialog 
        isOpen={isExportDialogOpen}
        onClose={() => setIsExportDialogOpen(false)}
        onConfirm={performExport}
        count={selectedExportIds.size}
      />

      {confirmDialog.show && confirmDialog.file && (
          <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200 p-4">
              <div className="w-full max-w-[450px] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                  <div className="p-6 pb-4">
                      <div className="flex items-center gap-4">
                          <div className={cn("w-12 h-12 rounded-full flex items-center justify-center shrink-0", confirmDialog.file.status === 'error' ? "bg-red-500/10 text-red-500" : "bg-yellow-500/10 text-yellow-500")}>
                              <AlertTriangle size={24} />
                          </div>
                          <div>
                              <h3 className="font-semibold text-lg text-foreground">{t('patch.saveConfirmTitle')}</h3>
                              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{confirmDialog.file.status === 'error' ? t('common.fileHasErrors') : t('patch.saveConfirmMessage', { path: '' }).replace('"{path}"', '')}</p>
                          </div>
                      </div>
                      <div className="mt-5 bg-secondary/30 border border-border rounded-lg p-3 flex items-start gap-3">
                          <FileText size={16} className="text-muted-foreground mt-0.5" />
                          <code className="text-xs font-mono text-foreground break-all leading-relaxed">{confirmDialog.file.path}</code>
                      </div>
                  </div>
                  <div className="p-4 bg-secondary/5 border-t border-border flex justify-end gap-3">
                      <button onClick={() => setConfirmDialog({ show: false, file: null })} className="px-4 py-2 text-sm font-medium rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">{t('patch.cancel')}</button>
                      <button onClick={executeSave} className={cn("px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 shadow-sm transition-colors", confirmDialog.file.status === 'error' ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90")}>
                          {confirmDialog.file.status === 'error' ? (<><AlertTriangle size={16} />{t('patch.forceSave')}</>) : (<><Check size={16} /> {t('patch.confirm')}</>)}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <Toast 
        message={toastState.msg} 
        type={toastState.type} 
        show={toastState.show} 
        onDismiss={() => setToastState(prev => ({ ...prev, show: false }))} 
      />
    </div>
  );
}