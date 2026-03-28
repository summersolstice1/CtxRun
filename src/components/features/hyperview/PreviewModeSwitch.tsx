import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/utils';
import type { PreviewMode } from '@/types/hyperview';

const MODE_LABELS: Record<PreviewMode, string> = {
  default: 'peek.modeDefault',
  source: 'peek.modeSource',
  rendered: 'peek.modeRendered',
  formatted: 'peek.modeFormatted',
  table: 'peek.modeTable',
};

interface PreviewModeSwitchProps {
  modes: PreviewMode[];
  value: PreviewMode;
  onChange: (mode: PreviewMode) => void;
  className?: string;
}

export function PreviewModeSwitch({ modes, value, onChange, className }: PreviewModeSwitchProps) {
  const { t } = useTranslation();
  const indicatorId = useId();
  const reduceMotion = useReducedMotion();

  if (modes.length <= 1) {
    return null;
  }

  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border border-border/70 bg-secondary/30 p-1',
        className
      )}
    >
      {modes.map((mode) => (
        <button
          key={mode}
          type="button"
          className={cn(
            'relative rounded-full px-3 py-1 text-xs transition-colors',
            value === mode ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => onChange(mode)}
        >
          {value === mode && (
            <motion.span
              layoutId={`preview-mode-switch-${indicatorId}`}
              className="absolute inset-0 rounded-full bg-background shadow-sm"
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 380, damping: 30, mass: 0.7 }
              }
            />
          )}
          <span className="relative z-10">{t(MODE_LABELS[mode])}</span>
        </button>
      ))}
    </div>
  );
}
