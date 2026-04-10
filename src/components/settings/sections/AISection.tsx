import type { KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Check, Edit3, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  SETTINGS_LAYOUT,
  SettingsSurface,
} from '@/components/settings/SettingsUi';
import { cn } from '@/lib/utils';
import type { AIProviderConfig, AIProviderSetting } from '@/types/model';
import { OcrServiceCard } from '@/components/settings/sections/OcrServiceCard';

interface AISectionProps {
  aiConfig: AIProviderConfig;
  setAIConfig: (config: Partial<AIProviderConfig>) => void;
  savedProviderSettings: Record<string, AIProviderSetting>;
  renameAIProvider: (oldName: string, newName: string) => void;
}

export function AISection({
  aiConfig,
  setAIConfig,
  savedProviderSettings,
  renameAIProvider,
}: AISectionProps) {
  const { t } = useTranslation();
  const [renamingProviderId, setRenamingProviderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingProviderId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingProviderId]);

  const handleRenameSubmit = () => {
    const nextName = renameValue.trim();
    if (nextName && renamingProviderId) {
      renameAIProvider(renamingProviderId, nextName);
    }
    setRenamingProviderId(null);
    setRenameValue('');
  };

  const handleRenameCancel = () => {
    setRenamingProviderId(null);
    setRenameValue('');
  };

  const handleRenameKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleRenameSubmit();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      handleRenameCancel();
    }
  };

  const beginRename = (providerName: string) => {
    setRenameValue(providerName);
    setRenamingProviderId(providerName);
  };

  const handleProviderSelect = (providerName: string) => {
    if (renamingProviderId) {
      handleRenameCancel();
    }
    setAIConfig({ providerId: providerName });
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
      <div>
        <h3 className="text-sm font-medium text-foreground">{t('settings.aiTitle')}</h3>
        <p className="text-xs text-muted-foreground mt-1">{t('settings.aiDesc')}</p>
      </div>

      <div className={SETTINGS_LAYOUT.pageGrid}>
        <SettingsSurface className="space-y-4 lg:col-span-12">
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('settings.provider')}
            </label>
            <div className={SETTINGS_LAYOUT.optionGrid}>
              {Object.keys(savedProviderSettings).map((providerName) => {
                const isActive = aiConfig.providerId === providerName;
                const isRenaming = renamingProviderId === providerName;

                if (isRenaming) {
                  return (
                    <div
                      key={providerName}
                      className="flex min-h-[72px] items-center gap-3 rounded-xl border border-primary bg-primary/10 px-4 py-3 shadow-[0_10px_30px_rgba(59,130,246,0.08)]"
                    >
                      <input
                        ref={renameInputRef}
                        className="min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground outline-none placeholder:text-muted-foreground/40"
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        onKeyDown={handleRenameKeyDown}
                        placeholder={providerName}
                      />
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={handleRenameSubmit}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-green-500 transition-colors hover:bg-green-500/10"
                          title="Confirm"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={handleRenameCancel}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
                          title="Cancel"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <button
                    key={providerName}
                    onClick={() => handleProviderSelect(providerName)}
                    className={cn(
                      'group relative flex min-h-[72px] items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm capitalize transition-all',
                      isActive
                        ? 'border-primary bg-primary/10 text-primary shadow-[0_10px_30px_rgba(59,130,246,0.08)]'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:bg-secondary/50',
                    )}
                    onDoubleClick={() => {
                      if (isActive) {
                        beginRename(providerName);
                      }
                    }}
                  >
                    <span className="truncate font-medium">{providerName}</span>

                    {isActive && (
                      <span
                      onClick={(event) => {
                        event.stopPropagation();
                        beginRename(providerName);
                      }}
                      className="cursor-pointer rounded p-0.5 opacity-50 transition-all hover:bg-background/50 hover:opacity-100"
                      title={t('common.rename')}
                      >
                        <Edit3 size={12} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="pt-1 text-[10px] text-muted-foreground/60">{t('common.renameHelp')}</p>
          </div>
        </SettingsSurface>

        <SettingsSurface className="space-y-4 lg:col-span-7">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('settings.apiKey')}
          </label>
          <input
            type="password"
            className="w-full rounded-xl border border-border bg-secondary/30 px-3 py-3 text-sm font-mono outline-none transition-all placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            placeholder="sk-..."
            value={aiConfig.apiKey}
            onChange={(event) => setAIConfig({ apiKey: event.target.value })}
          />
          <p className="text-[10px] text-muted-foreground/60">{t('settings.apiKeyTip')}</p>
        </SettingsSurface>

        <SettingsSurface className="space-y-4 lg:col-span-5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t('settings.temp')}
            </label>
            <span className="text-sm font-mono text-foreground">
              {aiConfig.temperature.toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-secondary accent-primary"
            value={aiConfig.temperature}
            onChange={(event) =>
              setAIConfig({ temperature: Number.parseFloat(event.target.value) })
            }
          />
          <p className="text-[10px] text-muted-foreground/60">{t('settings.tempTip')}</p>
        </SettingsSurface>

        <SettingsSurface className="space-y-4 lg:col-span-7">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('settings.baseUrl')}
          </label>
          <input
            type="text"
            className="w-full rounded-xl border border-border bg-secondary/30 px-3 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            placeholder={t('settings.baseUrlPlaceholder')}
            value={aiConfig.baseUrl || ''}
            onChange={(event) => setAIConfig({ baseUrl: event.target.value })}
          />
        </SettingsSurface>

        <SettingsSurface className="space-y-4 lg:col-span-5">
          <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t('settings.modelId')}
          </label>
          <input
            type="text"
            className="w-full rounded-xl border border-border bg-secondary/30 px-3 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/30 focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            placeholder={aiConfig.providerId === 'deepseek' ? 'deepseek-chat' : 'gpt-4o'}
            value={aiConfig.modelId}
            onChange={(event) => setAIConfig({ modelId: event.target.value })}
          />
        </SettingsSurface>

        <OcrServiceCard />
      </div>
    </div>
  );
}
