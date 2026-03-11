import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  FileSpreadsheet,
  FolderCog,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePromptStore } from '@/store/usePromptStore';
import type { RefinerySettings } from '@/store/useAppStore';
import { formatRefineryBufferThreshold } from '@/lib/calculator';
import { cn } from '@/lib/utils';

const REFINERY_PLUGIN_PREFIX = 'plugin:ctxrun-plugin-refinery|';

interface DataMaintenanceSectionProps {
  refinerySettings: RefinerySettings;
  setRefinerySettings: (config: Partial<RefinerySettings>) => void;
}

export function DataMaintenanceSection({
  refinerySettings,
  setRefinerySettings,
}: DataMaintenanceSectionProps) {
  const { t } = useTranslation();
  const { loadPrompts, refreshGroups, refreshCounts } = usePromptStore();
  const [importStatus, setImportStatus] = useState('');

  const handleExport = async () => {
    try {
      const filePath = await save({
        filters: [{ name: 'CSV File', extensions: ['csv'] }],
        defaultPath: `codeforge_prompts_${new Date().toISOString().split('T')[0]}.csv`,
      });

      if (!filePath) return;

      const count = await invoke<number>('export_prompts_to_csv', { savePath: filePath });
      setImportStatus(`${t('settings.exportSuccess')}: ${count} items`);
    } catch (error) {
      console.error(error);
      setImportStatus(`Export failed: ${error}`);
    }
  };

  const handleImport = async () => {
    try {
      const filePath = await open({
        filters: [{ name: 'CSV File', extensions: ['csv'] }],
        multiple: false,
      });

      if (!filePath || typeof filePath !== 'string') return;

      const shouldOverwrite = confirm(t('settings.importModeMsg'));
      const mode = shouldOverwrite ? 'overwrite' : 'merge';

      setImportStatus(t('common.loading'));
      const count = await invoke<number>('import_prompts_from_csv', { filePath, mode });

      setImportStatus(`${t('settings.importSuccess')}: ${count} items`);

      await loadPrompts(true);
      await refreshGroups();
      await refreshCounts();
    } catch (error) {
      console.error(error);
      setImportStatus(`Import failed: ${error}`);
    }
  };

  const handleExportProjectConfigs = async () => {
    try {
      const filePath = await save({
        filters: [{ name: 'JSON Config', extensions: ['json'] }],
        defaultPath: `ctxrun_project_configs_${new Date().toISOString().split('T')[0]}.json`,
      });

      if (!filePath) return;

      const count = await invoke<number>('export_project_configs', { savePath: filePath });
      setImportStatus(`${t('settings.exportSuccess')}: ${count} projects`);
    } catch (error) {
      console.error(error);
      setImportStatus(`Export failed: ${error}`);
    }
  };

  const handleImportProjectConfigs = async () => {
    try {
      const filePath = await open({
        filters: [{ name: 'JSON Config', extensions: ['json'] }],
        multiple: false,
      });

      if (!filePath || typeof filePath !== 'string') return;

      const shouldOverwrite = confirm(t('settings.importProjectConfigMsg'));
      const mode = shouldOverwrite ? 'overwrite' : 'merge';

      setImportStatus(t('common.loading'));
      const count = await invoke<number>('import_project_configs', { filePath, mode });

      setImportStatus(`${t('settings.importSuccess')}: ${count} projects`);
    } catch (error) {
      console.error(error);
      setImportStatus(`Import failed: ${error}`);
    }
  };

  const handleManualCleanup = async () => {
    try {
      const count = await invoke<number>(`${REFINERY_PLUGIN_PREFIX}manual_cleanup`);
      setImportStatus(t('settings.cleanupSuccess').replace('{count}', count.toString()));
    } catch (error) {
      setImportStatus(t('settings.cleanupFailed').replace('{error}', String(error)));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
      <div>
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <FileSpreadsheet size={18} className="text-green-600" />
          {t('settings.dataTitle')}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">{t('settings.dataDesc')}</p>
      </div>

      <div className="bg-secondary/20 border border-border rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 text-green-600 rounded-md">
              <Database size={20} />
            </div>
            <div>
              <h4 className="text-sm font-medium">{t('settings.promptsBackup')}</h4>
              <p className="text-xs text-muted-foreground">CSV Format</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-2 py-2 bg-background border border-border hover:border-primary/50 hover:text-primary rounded-md text-xs font-medium transition-all shadow-sm"
          >
            <Download size={14} />
            {t('settings.btnExportCsv')}
          </button>
          <button
            onClick={handleImport}
            className="flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-xs font-medium transition-all shadow-sm"
          >
            <Upload size={14} />
            {t('settings.btnImportCsv')}
          </button>
        </div>

        {importStatus && (
          <div className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1.5 pt-1 border-t border-border/30 mt-1">
            <Check size={10} />
            {importStatus}
          </div>
        )}
      </div>

      <div className="w-full h-px bg-border/50 my-2" />

      <div>
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <FolderCog size={18} className="text-blue-600" />
          {t('settings.projectConfigTitle')}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">{t('settings.projectConfigDesc')}</p>
      </div>

      <div className="bg-secondary/20 border border-border rounded-lg p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/10 text-blue-500 rounded-md">
              <Database size={20} />
            </div>
            <div>
              <h4 className="text-sm font-medium">{t('settings.configBackup')}</h4>
              <p className="text-xs text-muted-foreground">JSON Format</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleExportProjectConfigs}
            className="flex items-center justify-center gap-2 py-2 bg-background border border-border hover:border-primary/50 hover:text-primary rounded-md text-xs font-medium transition-all shadow-sm"
          >
            <Download size={14} />
            {t('settings.btnExportJson')}
          </button>
          <button
            onClick={handleImportProjectConfigs}
            className="flex items-center justify-center gap-2 py-2 bg-background border border-border hover:border-primary/50 hover:text-primary rounded-md text-xs font-medium transition-all shadow-sm"
          >
            <Upload size={14} />
            {t('settings.btnImportJson')}
          </button>
        </div>
      </div>

      <div className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg flex gap-2 items-start text-xs text-yellow-600/80">
        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
        <p>{t('settings.csvTip')}</p>
      </div>

      <div className="w-full h-px bg-border/50 my-2" />

      <div>
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <Database size={18} className="text-purple-600" />
          {t('settings.refineryCleanup')}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">{t('settings.refineryCleanupDesc')}</p>
      </div>

      <div className="bg-secondary/20 border border-border rounded-lg p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-foreground">{t('settings.cleanupEnabled')}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {t('settings.refineryCleanupDesc')}
            </div>
          </div>
          <button
            onClick={() => setRefinerySettings({ enabled: !refinerySettings.enabled })}
            className={cn(
              'relative w-11 h-6 rounded-full transition-colors',
              refinerySettings.enabled ? 'bg-primary' : 'bg-secondary',
            )}
          >
            <div
              className={cn(
                'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                refinerySettings.enabled ? 'translate-x-5' : 'translate-x-0',
              )}
            />
          </button>
        </div>

        {refinerySettings.enabled && (
          <>
            <div className="space-y-2">
              <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                {t('settings.cleanupStrategy')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => setRefinerySettings({ strategy: 'time' })}
                  className={cn(
                    'px-3 py-2 rounded-md text-sm border transition-all',
                    refinerySettings.strategy === 'time'
                      ? 'bg-primary/10 border-primary text-primary font-medium'
                      : 'bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50',
                  )}
                >
                  {t('settings.strategyTime')}
                </button>
                <button
                  onClick={() => setRefinerySettings({ strategy: 'count' })}
                  className={cn(
                    'px-3 py-2 rounded-md text-sm border transition-all',
                    refinerySettings.strategy === 'count'
                      ? 'bg-primary/10 border-primary text-primary font-medium'
                      : 'bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50',
                  )}
                >
                  {t('settings.strategyCount')}
                </button>
                <button
                  onClick={() => setRefinerySettings({ strategy: 'both' })}
                  className={cn(
                    'px-3 py-2 rounded-md text-sm border transition-all',
                    refinerySettings.strategy === 'both'
                      ? 'bg-primary/10 border-primary text-primary font-medium'
                      : 'bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50',
                  )}
                >
                  {t('settings.strategyBoth')}
                </button>
              </div>
            </div>

            {(refinerySettings.strategy === 'time' || refinerySettings.strategy === 'both') && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground">{t('settings.timeLimit')}</span>
                  <span className="font-mono text-muted-foreground">
                    {refinerySettings.days || 30} {t('settings.daysLabel')}
                  </span>
                </div>
                <input
                  type="range"
                  min="7"
                  max="90"
                  step="1"
                  className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                  value={refinerySettings.days || 30}
                  onChange={(event) =>
                    setRefinerySettings({ days: Number.parseInt(event.target.value, 10) })
                  }
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>7 {t('settings.daysLabel')}</span>
                  <span>90 {t('settings.daysLabel')}</span>
                </div>
              </div>
            )}

            {(refinerySettings.strategy === 'count' || refinerySettings.strategy === 'both') && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-foreground">{t('settings.countLimit')}</span>
                  <span className="font-mono text-muted-foreground">
                    {refinerySettings.maxCount || 1000} {t('settings.entriesLabel')}
                  </span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="5000"
                  step="100"
                  className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                  value={refinerySettings.maxCount || 1000}
                  onChange={(event) =>
                    setRefinerySettings({ maxCount: Number.parseInt(event.target.value, 10) })
                  }
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>100 {t('settings.entriesLabel')}</span>
                  <span>5000 {t('settings.entriesLabel')}</span>
                </div>
                <div className="text-[10px] text-muted-foreground italic">
                  {t('settings.bufferInfo').replace(
                    '{threshold}',
                    formatRefineryBufferThreshold(refinerySettings.maxCount || 1000).toString(),
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div
                onClick={() => setRefinerySettings({ keepPinned: !refinerySettings.keepPinned })}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/10 border border-border cursor-pointer hover:bg-secondary/20 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      'w-4 h-4 border-2 rounded flex items-center justify-center transition-colors',
                      refinerySettings.keepPinned
                        ? 'border-primary bg-primary'
                        : 'border-muted-foreground/50',
                    )}
                  >
                    {refinerySettings.keepPinned && (
                      <Check size={12} className="text-primary-foreground" />
                    )}
                  </div>
                  <span className="text-sm text-foreground select-none">
                    {t('settings.keepPinned')}
                  </span>
                </div>

                <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                  {refinerySettings.keepPinned ? 'ON' : 'OFF'}
                </div>
              </div>

              <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/10 border border-border opacity-80">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-green-500 bg-green-500 rounded flex items-center justify-center">
                    <Check size={12} className="text-white" />
                  </div>
                  <span className="text-sm text-foreground">{t('settings.keepNotes')}</span>
                </div>
                <span className="text-[10px] text-muted-foreground ml-auto">(Protected)</span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
              <div>
                <div className="text-sm font-medium text-primary">{t('settings.btnCleanupNow')}</div>
              </div>
              <button
                onClick={handleManualCleanup}
                className="flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 rounded-md text-xs font-medium transition-all shadow-sm"
              >
                <RefreshCw size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
