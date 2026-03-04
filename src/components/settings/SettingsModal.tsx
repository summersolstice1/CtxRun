import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Monitor, Moon, Sun, Circle, Languages, Check, Filter, DownloadCloud, Bot, Bell, Database, Upload, Download, FileSpreadsheet, AlertTriangle, FolderCog, Shield, RefreshCw, AppWindow, Edit3, Info, Search as SearchIcon } from 'lucide-react';

const MAC_SPRING = {
  type: "spring" as const,
  stiffness: 400,
  damping: 32,
  mass: 1
};

const CONTENT_VARIANTS = {
  initial: { opacity: 0, x: 12, scale: 0.99 },
  animate: { opacity: 1, x: 0, scale: 1 },
  exit: { opacity: 0, x: -8, scale: 0.995 },
};
import { save, open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useAppStore } from '@/store/useAppStore';
import { usePromptStore } from '@/store/usePromptStore';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { formatRefineryBufferThreshold } from '@/lib/calculator';
import { FilterManager } from '../features/context/FilterManager';
import { PromptLibraryManager } from './PromptLibraryManager';
import { IgnoredSecretsManager } from './IgnoredSecretsManager';
import { ShortcutInput } from '@/components/ui/ShortcutInput';
import { AboutSection } from './AboutSection';
import { SearchEngineIcon } from '@/components/ui/SearchEngineIcon';

interface McpHttpStatus {
  running: boolean;
  host: string;
  port: number;
  endpoint: string;
  authEnabled: boolean;
  allowStart: boolean;
}

export function SettingsModal() {
  const {
    isSettingsOpen, setSettingsOpen,
    theme, setTheme,
    language, setLanguage,
    globalIgnore, updateGlobalIgnore,
    aiConfig, setAIConfig,
    savedProviderSettings,
    renameAIProvider,
    spotlightShortcut, setSpotlightShortcut,
    automatorShortcut, setAutomatorShortcut,
    restReminder, setRestReminder,
    windowDestroyDelay, setWindowDestroyDelay,
    spotlightAppearance, setSpotlightAppearance,
    searchSettings, setSearchSettings,
    refinerySettings, setRefinerySettings,
    mcpHttpSettings, setMcpHttpSettings
  } = useAppStore();
  const { t } = useTranslation();

  const { loadPrompts, refreshGroups, refreshCounts } = usePromptStore();

  const [activeSection, setActiveSection] = useState<'appearance' | 'language' | 'filters' | 'library' | 'ai' | 'data' | 'security' | 'about' | 'search'>('appearance');
  const [importStatus, setImportStatus] = useState<string>('');
  const [isScanningApps, setIsScanningApps] = useState(false);
  const [mcpStatus, setMcpStatus] = useState<McpHttpStatus | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpActionPending, setMcpActionPending] = useState(false);
  const [mcpHostInput, setMcpHostInput] = useState(mcpHttpSettings.host);
  const [mcpPortInput, setMcpPortInput] = useState(String(mcpHttpSettings.port));
  const [mcpTokenInput, setMcpTokenInput] = useState(mcpHttpSettings.token);

  const formatDuration = (seconds: number) => {
    if (seconds === 0) return t('settings.never');
    if (seconds < 60) return `${seconds} ${t('settings.seconds')}`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const minText = t('settings.minutes');
    const secText = t('settings.seconds');
    if (secs === 0) return `${mins} ${minText}`;
    return `${mins} ${minText} ${secs} ${secText}`;
  };

  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  const refreshMcpStatus = async () => {
    setMcpLoading(true);
    try {
      const status = await invoke<McpHttpStatus>('mcp_http_status');
      setMcpStatus(status);
    } catch (e) {
      console.error('Failed to get MCP HTTP status:', e);
      setImportStatus(t('settings.mcpActionFailed').replace('{error}', String(e)));
    } finally {
      setMcpLoading(false);
    }
  };

  const applyMcpConnectionSettings = async () => {
    const host = mcpHostInput.trim();
    const parsedPort = Number(mcpPortInput);
    const port = Number.isInteger(parsedPort) ? parsedPort : NaN;

    if (!host) {
      setImportStatus(t('settings.mcpInvalidHost'));
      return;
    }
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      setImportStatus(t('settings.mcpInvalidPort'));
      return;
    }

    setMcpActionPending(true);
    try {
      await invoke<McpHttpStatus>('mcp_http_configure', {
        config: {
          host,
          port,
          token: mcpTokenInput,
          restartIfRunning: true
        }
      });

      setMcpHttpSettings({
        host,
        port,
        token: mcpTokenInput
      });
      setImportStatus(t('settings.mcpConfigSaved'));
      await refreshMcpStatus();
    } catch (e) {
      console.error('Failed to update MCP HTTP configuration:', e);
      setImportStatus(t('settings.mcpActionFailed').replace('{error}', String(e)));
    } finally {
      setMcpActionPending(false);
    }
  };

  const applyMcpEnabled = async (enabled: boolean) => {
    setMcpActionPending(true);
    try {
      await invoke<McpHttpStatus>('mcp_http_configure', {
        config: {
          allowStart: enabled,
          restartIfRunning: false
        }
      });

      if (enabled) {
        await invoke<McpHttpStatus>('mcp_http_start');
      } else {
        await invoke<McpHttpStatus>('mcp_http_stop');
      }
      setMcpHttpSettings({ enabled });
      await refreshMcpStatus();
    } catch (e) {
      console.error('Failed to switch MCP HTTP service:', e);
      setImportStatus(t('settings.mcpActionFailed').replace('{error}', String(e)));
    } finally {
      setMcpActionPending(false);
    }
  };

  const toggleMcpRuntime = async () => {
    const running = Boolean(mcpStatus?.running);
    setMcpActionPending(true);
    try {
      if (running) {
        await invoke<McpHttpStatus>('mcp_http_stop');
      } else {
        await invoke<McpHttpStatus>('mcp_http_start');
      }
      await refreshMcpStatus();
    } catch (e) {
      console.error('Failed to toggle MCP HTTP runtime:', e);
      setImportStatus(t('settings.mcpActionFailed').replace('{error}', String(e)));
    } finally {
      setMcpActionPending(false);
    }
  };

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
        renameInputRef.current.focus();
    }
  }, [isRenaming]);

  useEffect(() => {
    const updateBackendConfig = async () => {
      try {
        await invoke('update_cleanup_config', {
          config: {
            enabled: refinerySettings.enabled,
            strategy: refinerySettings.strategy,
            days: refinerySettings.days,
            maxCount: refinerySettings.maxCount,
            keepPinned: refinerySettings.keepPinned,
          }
        });
      } catch (e) {
        console.error('Failed to update refinery cleanup config:', e);
      }
    };

    updateBackendConfig();
  }, [refinerySettings]);

  useEffect(() => {
    if (!isSettingsOpen || activeSection !== 'security') return;
    setMcpHostInput(mcpHttpSettings.host);
    setMcpPortInput(String(mcpHttpSettings.port));
    setMcpTokenInput(mcpHttpSettings.token || '');
    refreshMcpStatus();
  }, [isSettingsOpen, activeSection]);

  const handleRenameSubmit = () => {
      if (renameValue.trim()) {
          renameAIProvider(aiConfig.providerId, renameValue.trim());
      }
      setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleRenameSubmit();
      if (e.key === 'Escape') setIsRenaming(false);
  };

  const handleExport = async () => {
    try {
      const filePath = await save({
        filters: [{ name: 'CSV File', extensions: ['csv'] }],
        defaultPath: `codeforge_prompts_${new Date().toISOString().split('T')[0]}.csv`
      });

      if (!filePath) return;

      const count = await invoke<number>('export_prompts_to_csv', { savePath: filePath });
      setImportStatus(`${t('settings.exportSuccess')}: ${count} items`);
    } catch (e) {
      console.error(e);
      setImportStatus(`Export failed: ${e}`);
    }
  };

  const handleImport = async () => {
    try {
      const filePath = await open({
        filters: [{ name: 'CSV File', extensions: ['csv'] }],
        multiple: false
      });

      if (!filePath || typeof filePath !== 'string') return;

      const isOverwrite = confirm(t('settings.importModeMsg'));
      const mode = isOverwrite ? 'overwrite' : 'merge';

      setImportStatus(t('settings.loading'));
      const count = await invoke<number>('import_prompts_from_csv', {
        filePath,
        mode
      });

      setImportStatus(`${t('settings.importSuccess')}: ${count} items`);

      await loadPrompts(true);
      await refreshGroups();
      await refreshCounts();

    } catch (e) {
      console.error(e);
      setImportStatus(`Import failed: ${e}`);
    }
  };

  const handleExportProjectConfigs = async () => {
    try {
      const filePath = await save({
        filters: [{ name: 'JSON Config', extensions: ['json'] }],
        defaultPath: `ctxrun_project_configs_${new Date().toISOString().split('T')[0]}.json`
      });

      if (!filePath) return;

      const count = await invoke<number>('export_project_configs', { savePath: filePath });
      setImportStatus(`${t('settings.exportSuccess')}: ${count} projects`);
    } catch (e) {
      console.error(e);
      setImportStatus(`Export failed: ${e}`);
    }
  };

  const handleImportProjectConfigs = async () => {
    try {
      const filePath = await open({
        filters: [{ name: 'JSON Config', extensions: ['json'] }],
        multiple: false
      });

      if (!filePath || typeof filePath !== 'string') return;

      const isOverwrite = confirm(t('settings.importProjectConfigMsg'));
      const mode = isOverwrite ? 'overwrite' : 'merge';

      setImportStatus(t('settings.loading'));
      const count = await invoke<number>('import_project_configs', {
        filePath,
        mode
      });

      setImportStatus(`${t('settings.importSuccess')}: ${count} projects`);
    } catch (e) {
      console.error(e);
      setImportStatus(`Import failed: ${e}`);
    }
  };

  const handleRefreshApps = async () => {
    setIsScanningApps(true);
    setImportStatus(t('common.loading'));
    try {
      const msg = await invoke<string>('refresh_apps');
      setImportStatus(msg);
    } catch (e) {
      setImportStatus(`Scan failed: ${e}`);
    } finally {
      setIsScanningApps(false);
    }
  };

  const handleManualCleanup = async () => {
    try {
      const count = await invoke<number>('manual_cleanup');
      setImportStatus(t('settings.cleanupSuccess').replace('{count}', count.toString()));
    } catch (e) {
      setImportStatus(t('settings.cleanupFailed').replace('{error}', String(e)));
    }
  };

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-200 p-4">

      <div className="w-full max-w-[600px] h-full max-h-[500px] bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

        <div className="h-14 px-6 border-b border-border flex items-center justify-between bg-secondary/10 shrink-0">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <SettingsIcon />
            {t('settings.title')}
          </h2>
          <button 
            onClick={() => setSettingsOpen(false)}
            className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-secondary text-muted-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden min-h-0">
            <div className="w-40 bg-secondary/5 border-r border-border p-2 space-y-1 overflow-y-auto custom-scrollbar shrink-0">
                <NavBtn active={activeSection === 'appearance'} onClick={() => setActiveSection('appearance')} icon={<Monitor size={14} />} label={t('settings.navAppearance')}  />
                <NavBtn active={activeSection === 'language'} onClick={() => setActiveSection('language')} icon={<Languages size={14} />} label={t('settings.navLanguage')} />
                <NavBtn active={activeSection === 'search'} onClick={() => setActiveSection('search')} icon={<SearchIcon size={14} />} label={t('settings.navSearch')} />
                <NavBtn active={activeSection === 'ai'} onClick={() => setActiveSection('ai')} icon={<Bot size={14} />} label={t('settings.navAI')} />
                <NavBtn active={activeSection === 'security'} onClick={() => setActiveSection('security')} icon={<Shield size={14} />} label={t('settings.navSecurity')} />
                <div className="my-2 h-px bg-border/50 mx-2" />
                <NavBtn active={activeSection === 'filters'} onClick={() => setActiveSection('filters')} icon={<Filter size={14} />} label={t('settings.navFilters')} />
                <NavBtn active={activeSection === 'library'} onClick={() => setActiveSection('library')} icon={<DownloadCloud size={14} />} label={t('settings.navLibrary')} />
                <NavBtn active={activeSection === 'data'} onClick={() => setActiveSection('data')} icon={<Database size={14} />} label={t('settings.navData')} />
                <div className="my-2 h-px bg-border/50 mx-2" />
                <NavBtn active={activeSection === 'about'} onClick={() => setActiveSection('about')} icon={<Info size={14} />} label={t('settings.navAbout')} />
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-hidden relative min-w-0 bg-background/50">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeSection}
                        variants={CONTENT_VARIANTS}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
                        className="h-full w-full overflow-y-auto custom-scrollbar p-6"
                    >
                        {activeSection === 'about' && <AboutSection />}

                        {activeSection === 'appearance' && (
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                            {t('settings.appearance')}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <ThemeCard active={theme === 'dark'} onClick={() => setTheme('dark')} icon={<Moon size={24} />} label={t('settings.themeDark')} />
                            <ThemeCard active={theme === 'light'} onClick={() => setTheme('light')} icon={<Sun size={24} />} label={t('settings.themeLight')} />
                            <ThemeCard active={theme === 'black'} onClick={() => setTheme('black')} icon={<Circle size={24} fill="currentColor" />} label={t('settings.themeBlack')} />
                        </div>
                        
                        <div className="w-full h-px bg-border/50 my-4" />

                        {/* 快捷键配置区域 */}
                        <div className="grid grid-cols-1 gap-4">
                          <ShortcutInput
                            label={t('settings.shortcutLabel')}
                            value={spotlightShortcut}
                            onChange={setSpotlightShortcut}
                            tip={t('settings.shortcutTip')}
                          />
                          <ShortcutInput
                            label={t('settings.automatorShortcutLabel')}
                            value={automatorShortcut}
                            onChange={setAutomatorShortcut}
                            tip={t('settings.automatorShortcutTip')}
                          />
                        </div>

                        <div className="space-y-4 pt-4 border-t border-border/50">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                                {t('settings.spotlightSize')}
                            </h3>

                            <div className="space-y-3">
                                <div className="flex justify-between text-xs">
                                    <span>{t('settings.width')}</span>
                                    <span className="font-mono text-muted-foreground">{spotlightAppearance.width}px</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="500" 
                                    max="1000" 
                                    step="20"
                                    className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                    value={spotlightAppearance.width}
                                    onChange={(e) => setSpotlightAppearance({ width: parseInt(e.target.value) })}
                                />
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between text-xs">
                                    <span>{t('settings.defaultHeight')}</span>
                                    <span className="font-mono text-muted-foreground">{spotlightAppearance.defaultHeight}px</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="150" 
                                    max="800" 
                                    step="10"
                                    className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                    value={spotlightAppearance.defaultHeight}
                                    onChange={(e) => setSpotlightAppearance({ defaultHeight: parseInt(e.target.value) })}
                                />
                            </div>

                            <div className="space-y-3">
                                <div className="flex justify-between text-xs">
                                    <span>{t('settings.chatHeight')}</span>
                                    <span className="font-mono text-muted-foreground">{spotlightAppearance.maxChatHeight}px</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="400" 
                                    max="900" 
                                    step="50"
                                    className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                    value={spotlightAppearance.maxChatHeight}
                                    onChange={(e) => setSpotlightAppearance({ maxChatHeight: parseInt(e.target.value) })}
                                />
                            </div>
                        </div>

                        <div className="w-full h-px bg-border/50 my-4" />

                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                <Bell size={14} />
                                {t('settings.restReminder')}
                            </h3>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                                    <div>
                                        <div className="text-sm font-medium text-foreground">
                                            {t('settings.restReminderEnabled')}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                            {t('settings.restReminderDesc')}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setRestReminder({ enabled: !restReminder.enabled })}
                                        className={cn(
                                            "relative w-11 h-6 rounded-full transition-colors",
                                            restReminder.enabled ? "bg-primary" : "bg-secondary"
                                        )}
                                    >
                                        <div className={cn(
                                            "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                                            restReminder.enabled ? "translate-x-5" : "translate-x-0"
                                        )} />
                                    </button>
                                </div>

                                {/* 间隔时间设置 */}
                                {restReminder.enabled && (
                                    <div className="space-y-3 p-3 rounded-lg bg-secondary/10 border border-border">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-foreground">
                                                {t('settings.restReminderInterval')}
                                            </span>
                                            <span className="font-mono text-muted-foreground">
                                                {restReminder.intervalMinutes} {t('settings.minutes')}
                                            </span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="1" 
                                            max="180" 
                                            step="1"
                                            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                            value={restReminder.intervalMinutes}
                                            onChange={(e) => setRestReminder({ intervalMinutes: parseInt(e.target.value) })}
                                        />
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>1 {t('settings.minutes')}</span>
                                            <span>180 {t('settings.minutes')}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="w-full h-px bg-border/50 my-4" />

                        <div className="space-y-4">
                            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                <X size={14} />
                                {t('settings.autoDestroy')}
                            </h3>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                                    <div>
                                        <div className="text-sm font-medium text-foreground">
                                           {t('settings.autoDestroy')}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5">
                                           {t('settings.autoDestroyDesc')}
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-3 p-3 rounded-lg bg-secondary/10 border border-border">
                                    <div className="flex justify-between text-xs">
                                        <span className="text-foreground">
                                            {t('settings.destroyDelay')}
                                        </span>
                                        <span className="font-mono text-muted-foreground">
                                            {formatDuration(windowDestroyDelay)}
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1800"
                                        step="30"
                                        className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                        value={windowDestroyDelay}
                                        onChange={(e) => setWindowDestroyDelay(parseInt(e.target.value))}
                                    />
                                    <div className="flex justify-between text-[10px] text-muted-foreground">
                                        <span>{t('settings.never')}</span>
                                        <span>30 {t('settings.minutes')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'language' && (
                     <div className="space-y-4">
                        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                            {t('settings.language')}
                        </h3>
                        <div className="space-y-2">
                            <LangItem active={language === 'zh'} onClick={() => setLanguage('zh')} label={t('settings.langZh')} subLabel={t('settings.langSubLabelZh')} />
                            <LangItem active={language === 'en'} onClick={() => setLanguage('en')} label={t('settings.langEn')} subLabel={t('settings.langSubLabelEn')} />
                        </div>
                     </div>
                )}

                {activeSection === 'search' && (
                    <div className="p-6 space-y-6 animate-in fade-in slide-in-from-right-4 duration-200 overflow-y-auto custom-scrollbar">
                        <div>
                            <h3 className="text-sm font-medium text-foreground">{t('settings.searchTitle')}</h3>
                            <p className="text-xs text-muted-foreground mt-1">{t('settings.searchDesc')}</p>
                        </div>

                        <div className="space-y-3">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('settings.defaultEngine')}</label>
                            <div className="grid grid-cols-2 gap-3">
                                <ThemeCard
                                    active={searchSettings.defaultEngine === 'google'}
                                    onClick={() => setSearchSettings({ defaultEngine: 'google' })}
                                    icon={<SearchEngineIcon engine="google" size={24} />}
                                    label={t('settings.engineGoogle')}
                                />
                                <ThemeCard
                                    active={searchSettings.defaultEngine === 'bing'}
                                    onClick={() => setSearchSettings({ defaultEngine: 'bing' })}
                                    icon={<SearchEngineIcon engine="bing" size={24} />}
                                    label={t('settings.engineBing')}
                                />
                                <ThemeCard
                                    active={searchSettings.defaultEngine === 'baidu'}
                                    onClick={() => setSearchSettings({ defaultEngine: 'baidu' })}
                                    icon={<SearchEngineIcon engine="baidu" size={24} />}
                                    label={t('settings.engineBaidu')}
                                />
                                <ThemeCard
                                    active={searchSettings.defaultEngine === 'custom'}
                                    onClick={() => setSearchSettings({ defaultEngine: 'custom' })}
                                    icon={<SearchEngineIcon engine="custom" size={24} />}
                                    label={t('settings.engineCustom')}
                                />
                            </div>
                        </div>

                        <div className="space-y-2 pt-4 border-t border-border/50">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('settings.customUrlLabel')}</label>
                            <input
                                type="text"
                                className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
                                placeholder="https://..."
                                value={searchSettings.customUrl}
                                onChange={e => setSearchSettings({ customUrl: e.target.value })}
                            />
                            <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                                {t('settings.customUrlTip')}
                            </p>
                        </div>
                    </div>
                )}

                {activeSection === 'filters' && (
                    <div className="h-full flex flex-col">
                        <div className="mb-4">
                            <h3 className="text-sm font-medium text-foreground">{t('settings.filtersTitle')}</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                {t('settings.filtersDesc')}
                            </p>
                        </div>
                        <div className="flex-1 border border-border rounded-lg p-4 bg-secondary/5 overflow-hidden flex flex-col min-h-[200px]">
                            <FilterManager 
                                localConfig={globalIgnore} 
                                onUpdate={updateGlobalIgnore}
                            />
                        </div>
                    </div>
                )}

                {/*  Content */}
                {activeSection === 'library' && (
                    <PromptLibraryManager />
                )}

                {/*  AI 设置面板 */}
                {activeSection === 'ai' && (
                    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
                        <div>
                            <h3 className="text-sm font-medium text-foreground">{t('settings.aiTitle')}</h3>
                            <p className="text-xs text-muted-foreground mt-1">{t('settings.aiDesc')}</p>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('settings.provider')}</label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                    {Object.keys(savedProviderSettings).map((p) => {
                                        const isActive = aiConfig.providerId === p;

                                        if (isActive && isRenaming) {
                                            return (
                                                <div key={p} className="relative">
                                                    <input
                                                        ref={renameInputRef}
                                                        className="w-full py-2 px-3 rounded-md text-sm border border-primary bg-background outline-none font-medium shadow-sm"
                                                        value={renameValue}
                                                        onChange={(e) => setRenameValue(e.target.value)}
                                                        onBlur={handleRenameSubmit}
                                                        onKeyDown={handleRenameKeyDown}
                                                    />
                                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none">
                                                        <Check size={14} />
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <button
                                                key={p}
                                                onClick={() => setAIConfig({ providerId: p })}
                                                className={cn(
                                                    "group relative py-2 px-3 rounded-md text-sm border transition-all capitalize flex items-center justify-center gap-2",
                                                    isActive
                                                        ? "bg-primary/10 border-primary text-primary font-medium shadow-sm"
                                                        : "bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50"
                                                )}
                                                onDoubleClick={() => {
                                                    if (isActive) {
                                                        setRenameValue(p);
                                                        setIsRenaming(true);
                                                    }
                                                }}
                                            >
                                                <span className="truncate">{p}</span>

                                                {isActive && (
                                                    <span
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setRenameValue(p);
                                                            setIsRenaming(true);
                                                        }}
                                                        className="opacity-50 hover:opacity-100 hover:bg-background/50 p-0.5 rounded transition-all cursor-pointer"
                                                        title={t('common.rename')}
                                                    >
                                                        <Edit3 size={12} />
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="text-[10px] text-muted-foreground/60 text-right pt-1">
                                    {t('common.renameHelp')}
                                </p>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('settings.apiKey')}</label>
                                <input 
                                    type="password"
                                    className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all placeholder:text-muted-foreground/30 font-mono"
                                    placeholder={`sk-...`}
                                    value={aiConfig.apiKey}
                                    onChange={e => setAIConfig({ apiKey: e.target.value })}
                                />
                                <p className="text-[10px] text-muted-foreground/60">{t('settings.apiKeyTip')}</p>
                            </div>
                            
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('settings.temp')}</label>
                                    <span className="font-mono text-sm text-foreground">{aiConfig.temperature.toFixed(1)}</span>
                                </div>
                                <input 
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
                                    value={aiConfig.temperature}
                                    onChange={e => setAIConfig({ temperature: parseFloat(e.target.value) })}
                                />
                                <p className="text-[10px] text-muted-foreground/60">
                                    {t('settings.tempTip')}
                                </p>
                            </div>

                            {/* Base URL & Model */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('settings.baseUrl')}</label>
                                    <input
                                        type="text"
                                        className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all placeholder:text-muted-foreground/30"
                                        placeholder={t('settings.baseUrlPlaceholder')}
                                        value={aiConfig.baseUrl || ''}
                                        onChange={e => setAIConfig({ baseUrl: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{t('settings.modelId')}</label>
                                    <input 
                                        type="text"
                                        className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all placeholder:text-muted-foreground/30"
                                        placeholder={aiConfig.providerId === 'deepseek' ? 'deepseek-chat' : 'gpt-4o'}
                                        value={aiConfig.modelId}
                                        onChange={e => setAIConfig({ modelId: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Data Management */}
                {activeSection === 'data' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">

                        {/* 顶部标题区 */}
                        <div>
                            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                                <FileSpreadsheet size={18} className="text-green-600"/>
                                {t('settings.dataTitle')}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                {t('settings.dataDesc')}
                            </p>
                        </div>

                        {/* 1. Prompt 数据管理卡片 (改造成横向) */}
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

                            {/* 导入状态提示 */}
                            {importStatus && (
                                <div className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1.5 pt-1 border-t border-border/30 mt-1">
                                    <Check size={10} /> {importStatus}
                                </div>
                            )}
                        </div>

                        <div className="w-full h-px bg-border/50 my-2" />

                        <div>
                            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                                <FolderCog size={18} className="text-blue-600"/>
                                {t('settings.projectConfigTitle')}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                {t('settings.projectConfigDesc')}
                            </p>
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

                        {/* 底部提示 */}
                        <div className="p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-lg flex gap-2 items-start text-xs text-yellow-600/80">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                            <p>{t('settings.csvTip')}</p>
                        </div>

                        {/* 分割线 */}
                        <div className="w-full h-px bg-border/50 my-2" />

                        {/* 应用索引管理 */}
                        <div>
                            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                                <AppWindow size={18} className="text-cyan-600"/>
                                {t('spotlight.appIndex')}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                {t('spotlight.rebuildAppIndex')}
                            </p>
                        </div>

                        <div className="bg-secondary/20 border border-border rounded-lg p-4 flex items-center justify-between">
                            <div className="text-xs text-muted-foreground">
                                {t('spotlight.appIndexStored')}
                            </div>
                            <button
                                onClick={handleRefreshApps}
                                disabled={isScanningApps}
                                className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border hover:border-primary/50 hover:text-primary rounded-md text-xs font-medium transition-all shadow-sm disabled:opacity-50"
                            >
                                <RefreshCw size={14} className={cn(isScanningApps && "animate-spin")} />
                                {t('spotlight.refreshIndexNow')}
                            </button>
                        </div>
                    </div>
                )}

                {/* Refinery Cleanup Section */}
                {activeSection === 'data' && (
                    <div className="w-full h-px bg-border/50 my-2" />
                )}

                {activeSection === 'data' && (
                    <div>
                        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
                            <Database size={18} className="text-purple-600"/>
                            {t('settings.refineryCleanup')}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            {t('settings.refineryCleanupDesc')}
                        </p>
                    </div>
                )}

                {activeSection === 'data' && (
                    <div className="bg-secondary/20 border border-border rounded-lg p-4 flex flex-col gap-4">
                        {/* 启用开关 */}
                        <div className="flex items-center justify-between">
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
                                    "relative w-11 h-6 rounded-full transition-colors",
                                    refinerySettings.enabled ? "bg-primary" : "bg-secondary"
                                )}
                            >
                                <div className={cn(
                                    "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                                    refinerySettings.enabled ? "translate-x-5" : "translate-x-0"
                                )} />
                            </button>
                        </div>

                        {refinerySettings.enabled && (
                            <>
                                {/* 清理策略选择 */}
                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                        {t('settings.cleanupStrategy')}
                                    </label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button
                                            onClick={() => setRefinerySettings({ strategy: 'time' })}
                                            className={cn(
                                                "px-3 py-2 rounded-md text-sm border transition-all",
                                                refinerySettings.strategy === 'time'
                                                    ? "bg-primary/10 border-primary text-primary font-medium"
                                                    : "bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50"
                                            )}
                                        >
                                            {t('settings.strategyTime')}
                                        </button>
                                        <button
                                            onClick={() => setRefinerySettings({ strategy: 'count' })}
                                            className={cn(
                                                "px-3 py-2 rounded-md text-sm border transition-all",
                                                refinerySettings.strategy === 'count'
                                                    ? "bg-primary/10 border-primary text-primary font-medium"
                                                    : "bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50"
                                            )}
                                        >
                                            {t('settings.strategyCount')}
                                        </button>
                                        <button
                                            onClick={() => setRefinerySettings({ strategy: 'both' })}
                                            className={cn(
                                                "px-3 py-2 rounded-md text-sm border transition-all",
                                                refinerySettings.strategy === 'both'
                                                    ? "bg-primary/10 border-primary text-primary font-medium"
                                                    : "bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50"
                                            )}
                                        >
                                            {t('settings.strategyBoth')}
                                        </button>
                                    </div>
                                </div>

                                {/* 时间限制滑块 */}
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
                                            onChange={(e) => setRefinerySettings({ days: parseInt(e.target.value) })}
                                        />
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>7 {t('settings.daysLabel')}</span>
                                            <span>90 {t('settings.daysLabel')}</span>
                                        </div>
                                    </div>
                                )}

                                {/* 数量限制滑块 */}
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
                                            onChange={(e) => setRefinerySettings({ maxCount: parseInt(e.target.value) })}
                                        />
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>100 {t('settings.entriesLabel')}</span>
                                            <span>5000 {t('settings.entriesLabel')}</span>
                                        </div>
                                        <div className="text-[10px] text-muted-foreground italic">
                                            {t('settings.bufferInfo').replace('{threshold}', formatRefineryBufferThreshold(refinerySettings.maxCount || 1000).toString())}
                                        </div>
                                    </div>
                                )}

                                {/* 保留选项 - 优化版 */}
                                <div className="space-y-3">
                                    <div
                                        /* 1. 将点击事件移到父容器，扩大点击区域 */
                                        onClick={() => setRefinerySettings({ keepPinned: !refinerySettings.keepPinned })}
                                        /* 2. 增加 cursor-pointer 和 hover 效果提升交互感 */
                                        className="flex items-center justify-between p-3 rounded-lg bg-secondary/10 border border-border cursor-pointer hover:bg-secondary/20 transition-colors group"
                                    >
                                        <div className="flex items-center gap-2">
                                            {/* 3. 这里的视觉框现在会跟随点击变化 */}
                                            <div className={cn(
                                                "w-4 h-4 border-2 rounded flex items-center justify-center transition-colors",
                                                refinerySettings.keepPinned ? "border-primary bg-primary" : "border-muted-foreground/50"
                                            )}>
                                                {refinerySettings.keepPinned && <Check size={12} className="text-primary-foreground" />}
                                            </div>
                                            <span className="text-sm text-foreground select-none">
                                                {t('settings.keepPinned')}
                                            </span>
                                        </div>

                                        {/* 4. 右侧辅助提示 */}
                                        <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                            {refinerySettings.keepPinned ? 'ON' : 'OFF'}
                                        </div>
                                    </div>

                                    {/* 笔记保护项（只读展示，因为代码里写死了总是保护） */}
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

                                {/* 立即清理按钮 */}
                                <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                                    <div>
                                        <div className="text-sm font-medium text-primary">
                                            {t('settings.btnCleanupNow')}
                                        </div>
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
                )}

                {/* Security & Whitelist Section */}
                {activeSection === 'security' && (
                    <div className="h-full flex flex-col gap-4">
                        <div className="bg-secondary/20 border border-border rounded-lg p-4 space-y-4">
                            <div>
                                <h3 className="text-sm font-medium text-foreground">{t('settings.mcpTitle')}</h3>
                                <p className="text-xs text-muted-foreground mt-1">{t('settings.mcpDesc')}</p>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="text-sm text-foreground">{t('settings.mcpEnabled')}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{t('settings.mcpEnabledDesc')}</div>
                                </div>
                                <button
                                    onClick={() => applyMcpEnabled(!mcpHttpSettings.enabled)}
                                    disabled={mcpActionPending}
                                    className={cn(
                                        "relative w-11 h-6 rounded-full transition-colors disabled:opacity-50",
                                        mcpHttpSettings.enabled ? "bg-primary" : "bg-secondary"
                                    )}
                                >
                                    <div className={cn(
                                        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                                        mcpHttpSettings.enabled ? "translate-x-5" : "translate-x-0"
                                    )} />
                                </button>
                            </div>

                            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-background/50">
                                <div>
                                    <div className="text-sm text-foreground">{t('settings.mcpAutoStart')}</div>
                                    <div className="text-xs text-muted-foreground mt-0.5">{t('settings.mcpAutoStartDesc')}</div>
                                </div>
                                <button
                                    onClick={() => setMcpHttpSettings({ autoStart: !mcpHttpSettings.autoStart })}
                                    className={cn(
                                        "relative w-11 h-6 rounded-full transition-colors",
                                        mcpHttpSettings.autoStart ? "bg-primary" : "bg-secondary"
                                    )}
                                >
                                    <div className={cn(
                                        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform",
                                        mcpHttpSettings.autoStart ? "translate-x-5" : "translate-x-0"
                                    )} />
                                </button>
                            </div>

                            <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <label className="text-[11px] text-muted-foreground">{t('settings.mcpHost')}</label>
                                        <input
                                            type="text"
                                            value={mcpHostInput}
                                            onChange={(e) => setMcpHostInput(e.target.value)}
                                            className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                                            placeholder="127.0.0.1"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <label className="text-[11px] text-muted-foreground">{t('settings.mcpPort')}</label>
                                        <input
                                            type="number"
                                            min={1}
                                            max={65535}
                                            value={mcpPortInput}
                                            onChange={(e) => setMcpPortInput(e.target.value)}
                                            className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                                            placeholder="39180"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] text-muted-foreground">{t('settings.mcpToken')}</label>
                                    <input
                                        type="password"
                                        value={mcpTokenInput}
                                        onChange={(e) => setMcpTokenInput(e.target.value)}
                                        className="w-full h-8 px-2 rounded-md border border-border bg-background text-xs outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                                        placeholder="Bearer token (optional)"
                                    />
                                    <p className="text-[10px] text-muted-foreground">{t('settings.mcpTokenTip')}</p>
                                </div>
                                <button
                                    onClick={applyMcpConnectionSettings}
                                    disabled={mcpActionPending}
                                    className="w-full py-1.5 text-xs rounded-md border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors disabled:opacity-50"
                                >
                                    {t('settings.mcpSaveConfig')}
                                </button>
                            </div>

                            <div className="rounded-lg border border-border bg-background/50 p-3 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">{t('settings.mcpStatus')}</span>
                                    <span className={cn(
                                        "font-medium",
                                        mcpStatus?.running ? "text-emerald-500" : "text-muted-foreground"
                                    )}>
                                        {mcpStatus?.running ? t('settings.mcpStatusRunning') : t('settings.mcpStatusStopped')}
                                    </span>
                                </div>
                                <div className="text-[11px] text-muted-foreground break-all">
                                    {t('settings.mcpEndpoint')}: {mcpStatus?.endpoint || '-'}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                    {mcpStatus?.authEnabled ? t('settings.mcpAuthEnabled') : t('settings.mcpAuthDisabled')}
                                </div>
                                <div className="flex gap-2 pt-1">
                                    <button
                                        onClick={toggleMcpRuntime}
                                        disabled={mcpActionPending || mcpLoading || !mcpStatus?.allowStart}
                                        className="flex-1 py-1.5 text-xs rounded-md border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors disabled:opacity-50"
                                    >
                                        {mcpStatus?.running ? t('settings.mcpStopNow') : t('settings.mcpStartNow')}
                                    </button>
                                    <button
                                        onClick={refreshMcpStatus}
                                        disabled={mcpLoading}
                                        className="px-3 py-1.5 text-xs rounded-md border border-border bg-secondary/30 hover:bg-secondary/50 transition-colors disabled:opacity-50"
                                    >
                                        {t('settings.mcpRefreshStatus')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 min-h-0">
                            <IgnoredSecretsManager />
                        </div>
                    </div>
                )}
                    </motion.div>
            </AnimatePresence>
            </div>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({ active, onClick, icon, label }: any) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 p-4 rounded-lg border-2 transition-all duration-200",
        active
          ? "border-primary bg-primary/5 text-primary shadow-[0_0_15px_rgba(0,122,255,0.1)]"
          : "border-border bg-secondary/20 text-muted-foreground hover:bg-secondary/40 hover:border-border/80"
      )}
    >
      {/* 选中时的小勾选图标带个缩放动画 */}
      <AnimatePresence>
        {active && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute top-2 right-2 text-primary"
          >
            <Check size={14} strokeWidth={4} />
          </motion.div>
        )}
      </AnimatePresence>

      {icon}
      <span className="font-medium text-xs tracking-tight">{label}</span>
    </motion.button>
  );
}

function LangItem({ active, onClick, label, subLabel }: any) {
  return (
    <button onClick={onClick} className={cn("w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all duration-200", active ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-foreground hover:bg-secondary/40")}>
      <div className="flex flex-col items-start"><span className="font-medium text-sm">{label}</span><span className="text-xs text-muted-foreground opacity-70">{subLabel}</span></div>
      {active && <Check size={18} strokeWidth={2.5} />}
    </button>
  );
}

function NavBtn({ active, onClick, icon, label }: any) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-md transition-colors outline-none",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      {/* 核心：选中态的滑动背景 */}
      {active && (
        <motion.div
          layoutId="settings-nav-pill"
          className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-md"
          transition={MAC_SPRING}
        />
      )}

      <div className={cn(
        "relative z-10 shrink-0 transition-transform duration-200",
        active ? "scale-110" : "group-hover:scale-105"
      )}>
        {icon}
      </div>

      <span className="relative z-10 font-medium">{label}</span>
    </button>
  );
}

function SettingsIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>;
}
