import type { KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { Check, Edit3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { AIProviderConfig, AIProviderSetting } from '@/types/model';

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
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus();
    }
  }, [isRenaming]);

  const handleRenameSubmit = () => {
    const nextName = renameValue.trim();
    if (nextName) {
      renameAIProvider(aiConfig.providerId, nextName);
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter') {
      handleRenameSubmit();
    }
    if (event.key === 'Escape') {
      setIsRenaming(false);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-200">
      <div>
        <h3 className="text-sm font-medium text-foreground">{t('settings.aiTitle')}</h3>
        <p className="text-xs text-muted-foreground mt-1">{t('settings.aiDesc')}</p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('settings.provider')}
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {Object.keys(savedProviderSettings).map((providerName) => {
              const isActive = aiConfig.providerId === providerName;

              if (isActive && isRenaming) {
                return (
                  <div key={providerName} className="relative">
                    <input
                      ref={renameInputRef}
                      className="w-full py-2 px-3 rounded-md text-sm border border-primary bg-background outline-none font-medium shadow-sm"
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
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
                  key={providerName}
                  onClick={() => setAIConfig({ providerId: providerName })}
                  className={cn(
                    'group relative py-2 px-3 rounded-md text-sm border transition-all capitalize flex items-center justify-center gap-2',
                    isActive
                      ? 'bg-primary/10 border-primary text-primary font-medium shadow-sm'
                      : 'bg-secondary/30 border-border text-muted-foreground hover:bg-secondary/50',
                  )}
                  onDoubleClick={() => {
                    if (isActive) {
                      setRenameValue(providerName);
                      setIsRenaming(true);
                    }
                  }}
                >
                  <span className="truncate">{providerName}</span>

                  {isActive && (
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        setRenameValue(providerName);
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
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('settings.apiKey')}
          </label>
          <input
            type="password"
            className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all placeholder:text-muted-foreground/30 font-mono"
            placeholder="sk-..."
            value={aiConfig.apiKey}
            onChange={(event) => setAIConfig({ apiKey: event.target.value })}
          />
          <p className="text-[10px] text-muted-foreground/60">{t('settings.apiKeyTip')}</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {t('settings.temp')}
            </label>
            <span className="font-mono text-sm text-foreground">
              {aiConfig.temperature.toFixed(1)}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            value={aiConfig.temperature}
            onChange={(event) =>
              setAIConfig({ temperature: Number.parseFloat(event.target.value) })
            }
          />
          <p className="text-[10px] text-muted-foreground/60">{t('settings.tempTip')}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {t('settings.baseUrl')}
            </label>
            <input
              type="text"
              className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all placeholder:text-muted-foreground/30"
              placeholder={t('settings.baseUrlPlaceholder')}
              value={aiConfig.baseUrl || ''}
              onChange={(event) => setAIConfig({ baseUrl: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {t('settings.modelId')}
            </label>
            <input
              type="text"
              className="w-full bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all placeholder:text-muted-foreground/30"
              placeholder={aiConfig.providerId === 'deepseek' ? 'deepseek-chat' : 'gpt-4o'}
              value={aiConfig.modelId}
              onChange={(event) => setAIConfig({ modelId: event.target.value })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
