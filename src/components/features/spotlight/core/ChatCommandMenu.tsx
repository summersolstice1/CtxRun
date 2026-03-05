import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Prompt } from '@/types/prompt';
import { Command } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatCommandMenuProps {
  prompts: Prompt[];
  keyword: string;
  selectedIndex: number;
  onSelect: (prompt: Prompt) => void;
  className?: string;
}

function buildPromptPreview(prompt: Prompt): string {
  const source = (prompt.description?.trim() || prompt.content || '').replace(/\s+/g, ' ').trim();
  if (!source) return '';
  if (source.length <= 110) return source;
  return `${source.slice(0, 109)}…`;
}

function normalizeGroupLabel(prompt: Prompt): string {
  const group = prompt.group?.trim();
  return group && group.length > 0 ? group : 'General';
}

function highlightMatch(text: string, keyword: string): React.ReactNode {
  const normalizedKeyword = keyword.trim();
  if (!normalizedKeyword) return text;

  const lowerText = text.toLowerCase();
  const lowerKeyword = normalizedKeyword.toLowerCase();
  const start = lowerText.indexOf(lowerKeyword);
  if (start < 0) return text;

  const end = start + normalizedKeyword.length;
  return (
    <>
      {text.slice(0, start)}
      <span className="text-primary">{text.slice(start, end)}</span>
      {text.slice(end)}
    </>
  );
}

export function ChatCommandMenu({
  prompts,
  keyword,
  selectedIndex,
  onSelect,
  className,
}: ChatCommandMenuProps) {
  const { t } = useTranslation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (menuRef.current && prompts.length > 0) {
      const activeEl = menuRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [prompts, selectedIndex]);

  return (
    <div className={cn(
      "absolute z-50 animate-in fade-in slide-in-from-top-1 duration-150",
      className ?? "top-[calc(100%+8px)] left-2 right-2"
    )}>
      <div className="rounded-2xl border border-border/70 bg-popover/95 backdrop-blur-xl shadow-2xl ring-1 ring-black/25 overflow-hidden">
        <div className="px-4 py-2 border-b border-border/50 flex items-center justify-between text-[11px] text-muted-foreground/80">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Command size={12} />
            <span>{t('common.chatSlashCommand')}</span>
          </span>
          <span className="font-mono">{prompts.length}</span>
        </div>

        {prompts.length === 0 ? (
          <div className="px-4 py-3 text-sm text-muted-foreground/80">{t('spotlight.noCommands')}</div>
        ) : (
          <div ref={menuRef} className="max-h-[320px] overflow-y-auto custom-scrollbar py-1">
            {prompts.map((item, idx) => {
              const isActive = idx === selectedIndex;
              const groupLabel = normalizeGroupLabel(item);
              const prevGroupLabel = idx > 0 ? normalizeGroupLabel(prompts[idx - 1]) : null;
              const showGroupLabel = idx === 0 || groupLabel !== prevGroupLabel;
              const preview = buildPromptPreview(item);

              return (
                <div key={item.id}>
                  {showGroupLabel && (
                    <div className="px-4 pt-2 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground/60">
                      {groupLabel}
                    </div>
                  )}
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => onSelect(item)}
                    className={cn(
                      'mx-2 w-[calc(100%-1rem)] rounded-lg px-3 py-2 text-left transition-colors',
                      isActive
                        ? 'bg-primary/25 text-foreground'
                        : 'text-foreground/90 hover:bg-secondary/50'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-[15px] leading-5">
                        /{highlightMatch(item.title, keyword)}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground/75">
                        {idx + 1}/{prompts.length}
                      </span>
                    </div>
                    {preview && (
                      <div className={cn(
                        'mt-1 text-xs truncate',
                        isActive ? 'text-foreground/80' : 'text-muted-foreground/75'
                      )}>
                        {preview}
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="px-4 py-2 border-t border-border/50 text-[10px] text-muted-foreground/70 flex items-center justify-between">
          <span>{t('common.navHint')}</span>
          <span className="font-mono">Enter · Select</span>
        </div>
      </div>
    </div>
  );
}
