import { Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NumberInputProps {
  value: number;
  onChange: (val: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  className?: string;
}

export function NumberInput({ value, onChange, min = 0, max, step = 1, label, className }: NumberInputProps) {
  const handleDecrement = () => {
    const newVal = value - step;
    if (min !== undefined && newVal < min) return;
    onChange(newVal);
  };

  const handleIncrement = () => {
    const newVal = value + step;
    if (max !== undefined && newVal > max) return;
    onChange(newVal);
  };

  return (
    <div className={cn("space-y-1", className)}>
      {label && <label className="text-[10px] text-muted-foreground uppercase font-bold ml-1">{label}</label>}
      <div className="relative flex items-center group">
        <button
          onClick={handleDecrement}
          className="absolute left-1 p-1 rounded-sm hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors z-10"
          type="button"
        >
          <Minus size={12} />
        </button>

        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value) || 0)}
          className={cn(
            "w-full bg-secondary/30 border border-border/50 rounded-md px-8 py-1.5",
            "text-center font-mono text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50",
            "transition-all group-hover:border-border"
          )}
        />

        <button
          onClick={handleIncrement}
          className="absolute right-1 p-1 rounded-sm hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors z-10"
          type="button"
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  );
}
