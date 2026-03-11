import { Bell, Circle, Moon, Sun, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ShortcutInput } from '@/components/ui/ShortcutInput';
import { cn } from '@/lib/utils';
import type {
  AppLang,
  AppTheme,
  RestReminderConfig,
  SpotlightAppearance,
} from '@/store/useAppStore';
import { LanguageOption, SelectableCard } from '@/components/settings/SettingsUi';

interface GeneralSectionProps {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  language: AppLang;
  setLanguage: (lang: AppLang) => void;
  spotlightShortcut: string;
  setSpotlightShortcut: (shortcut: string) => void;
  automatorShortcut: string;
  setAutomatorShortcut: (shortcut: string) => void;
  spotlightAppearance: SpotlightAppearance;
  setSpotlightAppearance: (config: Partial<SpotlightAppearance>) => void;
  restReminder: RestReminderConfig;
  setRestReminder: (config: Partial<RestReminderConfig>) => void;
  windowDestroyDelay: number;
  setWindowDestroyDelay: (seconds: number) => void;
  formatDuration: (seconds: number) => string;
}

export function GeneralSection({
  theme,
  setTheme,
  language,
  setLanguage,
  spotlightShortcut,
  setSpotlightShortcut,
  automatorShortcut,
  setAutomatorShortcut,
  spotlightAppearance,
  setSpotlightAppearance,
  restReminder,
  setRestReminder,
  windowDestroyDelay,
  setWindowDestroyDelay,
  formatDuration,
}: GeneralSectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
        {t('settings.appearance')}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SelectableCard
          active={theme === 'dark'}
          onClick={() => setTheme('dark')}
          icon={<Moon size={24} />}
          label={t('settings.themeDark')}
        />
        <SelectableCard
          active={theme === 'light'}
          onClick={() => setTheme('light')}
          icon={<Sun size={24} />}
          label={t('settings.themeLight')}
        />
        <SelectableCard
          active={theme === 'black'}
          onClick={() => setTheme('black')}
          icon={<Circle size={24} fill="currentColor" />}
          label={t('settings.themeBlack')}
        />
      </div>

      <div className="w-full h-px bg-border/50 my-4" />

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
            <span className="font-mono text-muted-foreground">
              {spotlightAppearance.width}px
            </span>
          </div>
          <input
            type="range"
            min="500"
            max="1000"
            step="20"
            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            value={spotlightAppearance.width}
            onChange={(e) =>
              setSpotlightAppearance({ width: Number.parseInt(e.target.value, 10) })
            }
          />
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-xs">
            <span>{t('settings.defaultHeight')}</span>
            <span className="font-mono text-muted-foreground">
              {spotlightAppearance.defaultHeight}px
            </span>
          </div>
          <input
            type="range"
            min="150"
            max="800"
            step="10"
            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            value={spotlightAppearance.defaultHeight}
            onChange={(e) =>
              setSpotlightAppearance({
                defaultHeight: Number.parseInt(e.target.value, 10),
              })
            }
          />
        </div>

        <div className="space-y-3">
          <div className="flex justify-between text-xs">
            <span>{t('settings.chatHeight')}</span>
            <span className="font-mono text-muted-foreground">
              {spotlightAppearance.maxChatHeight}px
            </span>
          </div>
          <input
            type="range"
            min="400"
            max="900"
            step="50"
            className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            value={spotlightAppearance.maxChatHeight}
            onChange={(e) =>
              setSpotlightAppearance({
                maxChatHeight: Number.parseInt(e.target.value, 10),
              })
            }
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
                'relative w-11 h-6 rounded-full transition-colors',
                restReminder.enabled ? 'bg-primary' : 'bg-secondary',
              )}
            >
              <div
                className={cn(
                  'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform',
                  restReminder.enabled ? 'translate-x-5' : 'translate-x-0',
                )}
              />
            </button>
          </div>

          {restReminder.enabled && (
            <div className="space-y-3 p-3 rounded-lg bg-secondary/10 border border-border">
              <div className="flex justify-between text-xs">
                <span className="text-foreground">{t('settings.restReminderInterval')}</span>
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
                onChange={(e) =>
                  setRestReminder({ intervalMinutes: Number.parseInt(e.target.value, 10) })
                }
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
              <div className="text-sm font-medium text-foreground">{t('settings.autoDestroy')}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t('settings.autoDestroyDesc')}
              </div>
            </div>
          </div>

          <div className="space-y-3 p-3 rounded-lg bg-secondary/10 border border-border">
            <div className="flex justify-between text-xs">
              <span className="text-foreground">{t('settings.destroyDelay')}</span>
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
              onChange={(e) => setWindowDestroyDelay(Number.parseInt(e.target.value, 10))}
            />
            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{t('settings.never')}</span>
              <span>30 {t('settings.minutes')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full h-px bg-border/50 my-4" />

      <div className="space-y-4">
        <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
          {t('settings.language')}
        </h3>
        <div className="space-y-2">
          <LanguageOption
            active={language === 'zh'}
            onClick={() => setLanguage('zh')}
            label={t('settings.langZh')}
            subLabel={t('settings.langSubLabelZh')}
          />
          <LanguageOption
            active={language === 'en'}
            onClick={() => setLanguage('en')}
            label={t('settings.langEn')}
            subLabel={t('settings.langSubLabelEn')}
          />
        </div>
      </div>
    </div>
  );
}
