import { AppWindow, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTranslation } from 'react-i18next';
import { SearchEngineIcon } from '@/components/ui/SearchEngineIcon';
import { FilterManager } from '@/components/features/context/FilterManager';
import {
  SETTINGS_LAYOUT,
  SelectableCard,
  SettingsSurface,
} from '@/components/settings/SettingsUi';
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

      <div className={SETTINGS_LAYOUT.pageGrid}>
        <SettingsSurface className="space-y-4 lg:col-span-7">
          <div className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('settings.defaultEngine')}
            </label>
            <div className={SETTINGS_LAYOUT.optionGrid}>
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
        </SettingsSurface>

        <div className="space-y-4 lg:col-span-5">
          <SettingsSurface className="space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('settings.customUrlLabel')}
            </label>
            <input
              type="text"
              className="w-full rounded-xl border border-border bg-secondary/30 px-3 py-3 text-sm font-mono outline-none transition-all focus:ring-2 focus:ring-primary/20"
              placeholder="https://..."
              value={searchSettings.customUrl}
              onChange={(event) => setSearchSettings({ customUrl: event.target.value })}
            />
            <p className="text-[10px] italic leading-relaxed text-muted-foreground">
              {t('settings.customUrlTip')}
            </p>
          </SettingsSurface>

          <SettingsSurface className="space-y-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
                <AppWindow size={18} className="text-cyan-600" />
                {t('spotlight.appIndex')}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('spotlight.rebuildAppIndex')}
              </p>
            </div>

            <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-border bg-secondary/20 p-4">
              <div className="min-w-0 flex-1 break-words text-xs text-muted-foreground">
                {scanStatus || t('spotlight.appIndexStored')}
              </div>
              <button
                onClick={handleRefreshApps}
                disabled={isScanningApps}
                className="shrink-0 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-all shadow-sm hover:border-primary/50 hover:text-primary disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  <RefreshCw size={14} className={cn(isScanningApps && 'animate-spin')} />
                  {t('spotlight.refreshIndexNow')}
                </span>
              </button>
            </div>
          </SettingsSurface>
        </div>

        <div className="space-y-3 lg:col-span-12">
          <div>
            <h3 className="text-sm font-medium text-foreground">{t('settings.filtersTitle')}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{t('settings.filtersDesc')}</p>
          </div>
          <SettingsSurface className="flex min-h-[320px] flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden rounded-xl border border-border bg-secondary/5 p-4">
              <FilterManager localConfig={globalIgnore} onUpdate={updateGlobalIgnore} />
            </div>
          </SettingsSurface>
        </div>
      </div>
    </div>
  );
}
