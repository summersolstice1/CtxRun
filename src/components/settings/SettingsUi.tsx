import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_BUTTON_SPRING = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 32,
  mass: 1,
};

interface SelectableCardProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}

export function SelectableCard({ active, onClick, icon, label }: SelectableCardProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={cn(
        'relative flex flex-col items-center justify-center gap-3 p-4 rounded-lg border-2 transition-all duration-200',
        active
          ? 'border-primary bg-primary/5 text-primary shadow-[0_0_15px_rgba(0,122,255,0.1)]'
          : 'border-border bg-secondary/20 text-muted-foreground hover:bg-secondary/40 hover:border-border/80',
      )}
    >
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

interface LanguageOptionProps {
  active: boolean;
  onClick: () => void;
  label: string;
  subLabel: string;
}

export function LanguageOption({ active, onClick, label, subLabel }: LanguageOptionProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all duration-200',
        active
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-border bg-background text-foreground hover:bg-secondary/40',
      )}
    >
      <div className="flex flex-col items-start">
        <span className="font-medium text-sm">{label}</span>
        <span className="text-xs text-muted-foreground opacity-70">{subLabel}</span>
      </div>
      {active && <Check size={18} strokeWidth={2.5} />}
    </button>
  );
}

interface SettingsNavButtonProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  testId: string;
}

export function SettingsNavButton({
  active,
  onClick,
  icon,
  label,
  testId,
}: SettingsNavButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-md transition-colors outline-none',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
      data-testid={testId}
    >
      {active && (
        <motion.div
          layoutId="settings-nav-pill"
          className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-md"
          transition={NAV_BUTTON_SPRING}
        />
      )}

      <div
        className={cn(
          'relative z-10 shrink-0 transition-transform duration-200',
          active ? 'scale-110' : 'group-hover:scale-105',
        )}
      >
        {icon}
      </div>

      <span className="relative z-10 font-medium">{label}</span>
    </button>
  );
}

export function SettingsIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-5 h-5"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
