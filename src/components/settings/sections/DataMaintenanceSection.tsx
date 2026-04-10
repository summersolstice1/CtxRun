import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  AlertTriangle,
  Check,
  Database,
  Download,
  FileSpreadsheet,
  FolderCog,
  Loader2,
  RefreshCw,
  Upload,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePromptStore } from '@/store/usePromptStore';
import type { RefinerySettings } from '@/store/useAppStore';
import {
  SETTINGS_LAYOUT,
  SettingsSurface,
} from '@/components/settings/SettingsUi';
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
  const { loadPrompts, refreshGroups, refreshCounts } = usePromptStore(
    useShallow((state) => ({
      loadPrompts: state.loadPrompts,
      refreshGroups: state.refreshGroups,
      refreshCounts: state.refreshCounts,
    })),
  );
  const [importStatus, setImportStatus] = useState('');
  const [busyAction, setBusyAction] = useState<
    'exportCsv' | 'importCsv' | 'exportJson' | 'importJson' | 'cleanup' | null
  >(null);
  const isBusy = busyAction !== null;

  const handleExport = async () => {
    if (busyAction) return;
    setBusyAction('exportCsv');
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
    } finally {
      setBusyAction(null);
    }
  };

  const handleImport = async () => {
    if (busyAction) return;
    setBusyAction('importCsv');
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
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportProjectConfigs = async () => {
    if (busyAction) return;
    setBusyAction('exportJson');
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
    } finally {
      setBusyAction(null);
    }
  };

  const handleImportProjectConfigs = async () => {
    if (busyAction) return;
    setBusyAction('importJson');
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
    } finally {
      setBusyAction(null);
    }
  };

  const handleManualCleanup = async () => {
    if (busyAction) return;
    setBusyAction('cleanup');
    try {
      const count = await invoke<number>(`${REFINERY_PLUGIN_PREFIX}manual_cleanup`);
      setImportStatus(t('settings.cleanupSuccess').replace('{count}', count.toString()));
    } catch (error) {
      setImportStatus(t('settings.cleanupFailed').replace('{error}', String(error)));
    } finally {
      setBusyAction(null);
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

      <div className={SETTINGS_LAYOUT.pageGrid}>
        <SettingsSurface className="space-y-3 lg:col-span-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-green-500/10 p-2 text-green-600">
                <Database size={20} />
              </div>
              <div>
                <h4 className="text-sm font-medium">{t('settings.promptsBackup')}</h4>
                <p className="text-xs text-muted-foreground">CSV Format</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={handleExport}
              disabled={isBusy}
              className="flex items-center justify-center gap-2 rounded-md border border-border bg-background py-2 text-xs font-medium transition-all shadow-sm hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'exportCsv' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {t('settings.btnExportCsv')}
            </button>
            <button
              onClick={handleImport}
              disabled={isBusy}
              className="flex items-center justify-center gap-2 rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground transition-all shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'importCsv' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {t('settings.btnImportCsv')}
            </button>
          </div>

          {importStatus && (
            <div className="mt-1 flex items-center justify-center gap-1.5 border-t border-border/30 pt-1 text-center text-[10px] text-muted-foreground">
              <Check size={10} />
              {importStatus}
            </div>
          )}
        </SettingsSurface>

        <SettingsSurface className="space-y-3 lg:col-span-6">
          <div>
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <FolderCog size={18} className="text-blue-600" />
              {t('settings.projectConfigTitle')}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings.projectConfigDesc')}
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-md bg-blue-500/10 p-2 text-blue-500">
                <Database size={20} />
              </div>
              <div>
                <h4 className="text-sm font-medium">{t('settings.configBackup')}</h4>
                <p className="text-xs text-muted-foreground">JSON Format</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              onClick={handleExportProjectConfigs}
              disabled={isBusy}
              className="flex items-center justify-center gap-2 rounded-md border border-border bg-background py-2 text-xs font-medium transition-all shadow-sm hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'exportJson' ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {t('settings.btnExportJson')}
            </button>
            <button
              onClick={handleImportProjectConfigs}
              disabled={isBusy}
              className="flex items-center justify-center gap-2 rounded-md border border-border bg-background py-2 text-xs font-medium transition-all shadow-sm hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busyAction === 'importJson' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {t('settings.btnImportJson')}
            </button>
          </div>
        </SettingsSurface>

        <div className="lg:col-span-12">
          <div className="flex items-start gap-2 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 text-xs text-yellow-600/80">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <p>{t('settings.csvTip')}</p>
          </div>
        </div>

        <SettingsSurface className="space-y-5 lg:col-span-12">
          <div>
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Database size={18} className="text-purple-600" />
              {t('settings.refineryCleanup')}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings.refineryCleanupDesc')}
            </p>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-secondary/20 p-4">
            <div>
              <div className="text-sm font-medium text-foreground">
                {t('settings.cleanupEnabled')}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t('settings.refineryCleanupDesc')}
              </div>
            </div>
            <button
              onClick={() => setRefinerySettings({ enabled: !refinerySettings.enabled })}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                refinerySettings.enabled ? 'bg-primary' : 'bg-secondary',
              )}
            >
              <div
                className={cn(
                  'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
                  refinerySettings.enabled ? 'translate-x-5' : 'translate-x-0',
                )}
              />
            </button>
          </div>

          {refinerySettings.enabled && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="space-y-2 lg:col-span-7">
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t('settings.cleanupStrategy')}
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    onClick={() => setRefinerySettings({ strategy: 'time' })}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm transition-all',
                      refinerySettings.strategy === 'time'
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50',
                    )}
                  >
                    {t('settings.strategyTime')}
                  </button>
                  <button
                    onClick={() => setRefinerySettings({ strategy: 'count' })}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm transition-all',
                      refinerySettings.strategy === 'count'
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50',
                    )}
                  >
                    {t('settings.strategyCount')}
                  </button>
                  <button
                    onClick={() => setRefinerySettings({ strategy: 'both' })}
                    className={cn(
                      'rounded-md border px-3 py-2 text-sm transition-all',
                      refinerySettings.strategy === 'both'
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50',
                    )}
                  >
                    {t('settings.strategyBoth')}
                  </button>
                </div>
              </div>

              <div className="space-y-3 lg:col-span-5">
                <div
                  onClick={() => setRefinerySettings({ keepPinned: !refinerySettings.keepPinned })}
                  className="group flex cursor-pointer items-center justify-between rounded-lg border border-border bg-secondary/10 p-3 transition-colors hover:bg-secondary/20"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded border-2 transition-colors',
                        refinerySettings.keepPinned
                          ? 'border-primary bg-primary'
                          : 'border-muted-foreground/50',
                      )}
                    >
                      {refinerySettings.keepPinned && (
                        <Check size={12} className="text-primary-foreground" />
                      )}
                    </div>
                    <span className="select-none text-sm text-foreground">
                      {t('settings.keepPinned')}
                    </span>
                  </div>

                  <div className="text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    {refinerySettings.keepPinned ? 'ON' : 'OFF'}
                  </div>
                </div>

                <div className="flex items-center gap-2 rounded-lg border border-border bg-secondary/10 p-3 opacity-80">
                  <div className="flex items-center gap-2">
                    <div className="flex h-4 w-4 items-center justify-center rounded border-2 border-green-500 bg-green-500">
                      <Check size={12} className="text-white" />
                    </div>
                    <span className="text-sm text-foreground">{t('settings.keepNotes')}</span>
                  </div>
                  <span className="ml-auto text-[10px] text-muted-foreground">(Protected)</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:col-span-12 lg:grid-cols-2">
                {(refinerySettings.strategy === 'time' || refinerySettings.strategy === 'both') && (
                  <div className="space-y-2 rounded-xl border border-border bg-secondary/10 p-4">
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
                  <div className="space-y-2 rounded-xl border border-border bg-secondary/10 p-4">
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
                    <div className="text-[10px] italic text-muted-foreground">
                      {t('settings.bufferInfo').replace(
                        '{threshold}',
                        formatRefineryBufferThreshold(refinerySettings.maxCount || 1000).toString(),
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3 lg:col-span-12">
                <div>
                  <div className="text-sm font-medium text-primary">
                    {t('settings.btnCleanupNow')}
                  </div>
                </div>
                <button
                  onClick={handleManualCleanup}
                  disabled={isBusy}
                  className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-all shadow-sm hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyAction === 'cleanup' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
              </div>
            </div>
          )}
        </SettingsSurface>
      </div>
    </div>
  );
}
