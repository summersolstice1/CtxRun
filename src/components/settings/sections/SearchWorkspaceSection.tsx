import { AppWindow, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { SearchEngineIcon } from '@/components/ui/SearchEngineIcon';
import { FilterManager } from '@/components/features/context/FilterManager';
import { SelectableCard } from '@/components/settings/SettingsUi';
import { cn } from '@/lib/utils';
import type { IgnoreConfig } from '@/types/context';
import type { SearchEngineType } from '@/store/useAppStore';

interface SearchWorkspaceSectionProps {
  searchSettings: {
    defaultEngine: SearchEngineType;
    customUrl: string;
  };
  setSearchSettings: (
    config: Partial<{
      defaultEngine: SearchEngineType;
      customUrl: string;
    }>,
  ) => void;
  globalIgnore: IgnoreConfig;
  updateGlobalIgnore: (
    type: keyof IgnoreConfig,
    action: 'add' | 'remove',
    value: string,
  ) => void;
}

export function SearchWorkspaceSection({
  searchSettings,
  setSearchSettings,
  globalIgnore,
  updateGlobalIgnore,
}: SearchWorkspaceSectionProps) {
  const { t } = useTranslation();
  const [isScanningApps, setIsScanningApps] = useState(false);
  const [scanStatus, setScanStatus] = useState('');

  const handleRefreshApps = async () => {
    setIsScanningApps(true);
    setScanStatus(t('common.loading'));
    try {
      const message = await invoke<string>('refresh_apps');
      setScanStatus(message);
    } catch (error) {
      setScanStatus(`Scan failed: ${error}`);
    } finally {
      setIsScanningApps(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
      <div>
        <h3 className="text-sm font-medium text-foreground">{t('settings.searchTitle')}</h3>
        <p className="text-xs text-muted-foreground mt-1">{t('settings.searchDesc')}</p>
      </div>

      <div className="space-y-3">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {t('settings.defaultEngine')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <SelectableCard
            active={searchSettings.defaultEngine === 'google'}
            onClick={() => setSearchSettings({ defaultEngine: 'google' })}
            icon={<SearchEngineIcon engine="google" size={24} />}
            label={t('settings.engineGoogle')}
          />
          <SelectableCard
            active={searchSettings.defaultEngine === 'bing'}
            onClick={() => setSearchSettings({ defaultEngine: 'bing' })}
            icon={<SearchEngineIcon engine="bing" size={24} />}
            label={t('settings.engineBing')}
          />
          <SelectableCard
            active={searchSettings.defaultEngine === 'baidu'}
            onClick={() => setSearchSettings({ defaultEngine: 'baidu' })}
            icon={<SearchEngineIcon engine="baidu" size={24} />}
            label={t('settings.engineBaidu')}
          />
          <SelectableCard
            active={searchSettings.defaultEngine === 'custom'}
            onClick={() => setSearchSettings({ defaultEngine: 'custom' })}
            icon={<SearchEngineIcon engine="custom" size={24} />}
            label={t('settings.engineCustom')}
          />
        </div>
      </div>

      <div className="space-y-2 pt-4 border-t border-border/50">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
          {t('settings.customUrlLabel')}
        </label>
        <input
          type="text"
          className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
          placeholder="https://..."
          value={searchSettings.customUrl}
          onChange={(event) => setSearchSettings({ customUrl: event.target.value })}
        />
        <p className="text-[10px] text-muted-foreground leading-relaxed italic">
          {t('settings.customUrlTip')}
        </p>
      </div>

      <div className="flex flex-col border-t border-border/50 pt-6">
        <div className="mb-4">
          <h3 className="text-sm font-medium text-foreground">{t('settings.filtersTitle')}</h3>
          <p className="text-xs text-muted-foreground mt-1">{t('settings.filtersDesc')}</p>
        </div>
        <div className="flex-1 border border-border rounded-lg p-4 bg-secondary/5 overflow-hidden flex flex-col min-h-[200px]">
          <FilterManager localConfig={globalIgnore} onUpdate={updateGlobalIgnore} />
        </div>
      </div>

      <div className="w-full h-px bg-border/50 my-2" />

      <div>
        <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
          <AppWindow size={18} className="text-cyan-600" />
          {t('spotlight.appIndex')}
        </h3>
        <p className="text-xs text-muted-foreground mt-1">{t('spotlight.rebuildAppIndex')}</p>
      </div>

      <div className="bg-secondary/20 border border-border rounded-lg p-4 flex items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground flex-1 min-w-0 break-words">
          {scanStatus || t('spotlight.appIndexStored')}
        </div>
        <button
          onClick={handleRefreshApps}
          disabled={isScanningApps}
          className="flex items-center gap-2 px-3 py-1.5 bg-background border border-border hover:border-primary/50 hover:text-primary rounded-md text-xs font-medium transition-all shadow-sm disabled:opacity-50 shrink-0"
        >
          <RefreshCw size={14} className={cn(isScanningApps && 'animate-spin')} />
          {t('spotlight.refreshIndexNow')}
        </button>
      </div>
    </div>
  );
}
