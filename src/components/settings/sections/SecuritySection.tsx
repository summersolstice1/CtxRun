import { useTranslation } from 'react-i18next';
import { IgnoredSecretsManager } from '@/components/settings/IgnoredSecretsManager';
import { SETTINGS_LAYOUT, SettingsSurface } from '@/components/settings/SettingsUi';
import type { GuardSettings } from '@/store/useAppStore';
import { cn } from '@/lib/utils';

interface SecuritySectionProps {
  guardSettings: GuardSettings;
  setGuardSettings: (config: Partial<GuardSettings>) => void;
  formatDuration: (seconds: number) => string;
}

interface GuardToggleButtonProps {
  active: boolean;
  disabled?: boolean;
  title: string;
  description: string;
  onClick: () => void;
}

function GuardToggleButton({
  active,
  disabled = false,
  title,
  description,
  onClick,
}: GuardToggleButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-2xl border p-4 text-left transition-colors',
        active
          ? 'border-primary/40 bg-primary/8'
          : 'border-border bg-secondary/10 hover:bg-secondary/20',
        disabled && 'cursor-not-allowed opacity-50 hover:bg-secondary/10',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="text-xs leading-5 text-muted-foreground">{description}</div>
        </div>
        <span
          className={cn(
            'mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full',
            active ? 'bg-primary shadow-[0_0_0_4px_rgba(59,130,246,0.12)]' : 'bg-muted-foreground/30',
          )}
        />
      </div>
    </button>
  );
}

export function SecuritySection({
  guardSettings,
  setGuardSettings,
  formatDuration,
}: SecuritySectionProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-200">
      <SettingsSurface className="space-y-5">
        <div className="space-y-1">
          <h3 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            {t('settings.guardTitle')}
          </h3>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {t('settings.guardDesc')}
          </p>
        </div>

        <div className={SETTINGS_LAYOUT.optionGrid}>
          <GuardToggleButton
            active={guardSettings.enabled}
            title={t('settings.guardEnabled')}
            description={t('settings.guardEnabledDesc')}
            onClick={() => setGuardSettings({ enabled: !guardSettings.enabled })}
          />
          <GuardToggleButton
            active={guardSettings.preventSleep}
            title={t('settings.guardPreventSleep')}
            description={t('settings.guardPreventSleepDesc')}
            onClick={() => setGuardSettings({ preventSleep: !guardSettings.preventSleep })}
          />
          <GuardToggleButton
            active={guardSettings.preventSleep && guardSettings.keepDisplayOn}
            disabled={!guardSettings.preventSleep}
            title={t('settings.guardKeepDisplayOn')}
            description={t('settings.guardKeepDisplayOnDesc')}
            onClick={() => setGuardSettings({ keepDisplayOn: !guardSettings.keepDisplayOn })}
          />
        </div>

        <div className="space-y-3 rounded-2xl border border-border bg-secondary/10 p-4">
          <div className="flex items-center justify-between gap-4 text-xs">
            <span className="text-foreground">{t('settings.guardIdleTimeout')}</span>
            <span className="font-mono text-muted-foreground">
              {formatDuration(guardSettings.idleTimeoutSecs)}
            </span>
          </div>
          <input
            type="range"
            min="60"
            max="1800"
            step="30"
            className="w-full cursor-pointer appearance-none rounded-lg bg-secondary accent-primary"
            value={guardSettings.idleTimeoutSecs}
            onChange={(event) =>
              setGuardSettings({ idleTimeoutSecs: Number.parseInt(event.target.value, 10) })
            }
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>1 {t('settings.minutes')}</span>
            <span>30 {t('settings.minutes')}</span>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {t('settings.guardVisibilityNote')}
          </p>
        </div>
      </SettingsSurface>

      <div className="min-h-[420px]">
        <IgnoredSecretsManager />
      </div>
    </div>
  );
}
