import { useState, useEffect, useRef } from 'react';
import { Keyboard, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

interface ShortcutInputProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  tip?: string;
}

export function ShortcutInput({ value, onChange, label, tip }: ShortcutInputProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [currentKeys, setCurrentKeys] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  useEffect(() => {
    if (!isRecording) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();

      const keys = new Set<string>();
      if (e.ctrlKey) keys.add('Ctrl');
      if (e.metaKey) keys.add('Command');
      if (e.altKey) keys.add('Alt');
      if (e.shiftKey) keys.add('Shift');

      let key = e.key;
      if (key === ' ') key = 'Space';
      if (key.length === 1) key = key.toUpperCase();

      if (!['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        keys.add(key);
        if (keys.size > 0) {
            const shortcutString = Array.from(keys).join('+');
            onChange(shortcutString);
            setIsRecording(false);
        }
      }

      setCurrentKeys(keys);
    };

    const handleKeyUp = () => {
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // 点击外部取消录制
    const handleClickOutside = (e: MouseEvent) => {
        if (inputRef.current && !inputRef.current.contains(e.target as Node)) {
            setIsRecording(false);
        }
    };
    window.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isRecording, onChange]);

  return (
    <div className="space-y-2">
        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {label || t('settings.shortcutLabel')}
        </label>
        <div className="flex gap-2">
            <div
                ref={inputRef}
                onClick={() => { setIsRecording(true); setCurrentKeys(new Set()); }}
                className={cn(
                    "flex-1 h-9 rounded-lg border flex items-center px-3 text-sm cursor-pointer transition-all select-none",
                    isRecording 
                        ? "border-primary bg-primary/10 ring-2 ring-primary/20" 
                        : "border-border bg-secondary/30 hover:border-primary/50"
                )}
            >
                {isRecording ? (
                    <span className="text-primary font-medium animate-pulse">
                        {currentKeys.size > 0 
                            ? Array.from(currentKeys).join(' + ') 
                            : t('settings.shortcutPressKeys')}
                    </span>
                ) : (
                    <div className="flex items-center gap-2 w-full">
                        <Keyboard size={14} className="text-muted-foreground" />
                        <span className={cn("font-mono font-medium", !value && "text-muted-foreground italic")}>
                            {value || t('settings.shortcutNotSet')}
                        </span>
                    </div>
                )}
            </div>
            
            {value && !isRecording && (
                <button 
                    onClick={() => onChange('')}
                    className="h-9 w-9 flex items-center justify-center rounded-lg border border-border bg-secondary/30 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-colors"
                    title={t('settings.shortcutClear')}
                >
                    <X size={14} />
                </button>
            )}
        </div>
        {tip !== undefined && (
            <p className="text-[10px] text-muted-foreground/60">
                {tip}
            </p>
        )}
    </div>
  );
}