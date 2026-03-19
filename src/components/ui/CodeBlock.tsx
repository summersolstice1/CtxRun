import { useEffect, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import {
  getCachedHighlightTree,
  highlightCodeTree,
  renderHighlightTree,
} from '@/lib/markdown/starryNight';

type CodeBlockVariant = 'github' | 'chat';

interface CodeBlockProps {
  language: string;
  children: string;
  className?: string;
  wrapLongLines?: boolean;
  variant?: CodeBlockVariant;
  showCopyButton?: boolean;
}

export function CodeBlock({
  language,
  children,
  className,
  wrapLongLines = false,
  variant = 'github',
  showCopyButton = true,
}: CodeBlockProps) {
  const { t } = useTranslation();
  const [isCopied, setIsCopied] = useState(false);
  const [highlightTree, setHighlightTree] = useState(() => getCachedHighlightTree(language, children));

  const codeClassName = language ? `language-${language}` : undefined;
  const highlightedContent = useMemo(
    () => (highlightTree ? renderHighlightTree(highlightTree) : null),
    [highlightTree]
  );

  useEffect(() => {
    const cached = getCachedHighlightTree(language, children);
    if (cached !== undefined) {
      setHighlightTree(cached);
      return;
    }

    let cancelled = false;
    setHighlightTree(undefined);

    void highlightCodeTree(language, children)
      .then((tree) => {
        if (!cancelled) {
          setHighlightTree(tree);
        }
      })
      .catch((error) => {
        console.error('Failed to highlight code block:', error);
        if (!cancelled) {
          setHighlightTree(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [children, language]);

  const handleCopy = async () => {
    try {
      await writeText(children);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div
      className={cn(
        'ctx-code-block group relative my-4 overflow-hidden rounded-md border',
        variant === 'github'
          ? 'border-[hsl(var(--markdown-pre-border))] bg-[hsl(var(--markdown-pre-bg))]'
          : 'border-border/50 bg-secondary/25',
        className
      )}
    >
      {showCopyButton && (
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            'absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition',
            'border-[hsl(var(--markdown-pre-border))] bg-[hsl(var(--markdown-pre-bg))]/95 text-[hsl(var(--markdown-muted))]',
            'opacity-0 shadow-sm group-hover:opacity-100 hover:text-[hsl(var(--markdown-fg))]',
            isCopied && 'opacity-100 text-emerald-400'
          )}
          aria-label={t('common.copy')}
        >
          {isCopied ? <Check size={12} /> : <Copy size={12} />}
          <span>{isCopied ? t('common.copied') : t('common.copy')}</span>
        </button>
      )}

      <pre
        className={cn(
          'ctx-code-block-scroll m-0 overflow-x-auto bg-transparent p-4 text-[13px] leading-[1.45]',
          wrapLongLines ? 'whitespace-pre-wrap break-words' : 'whitespace-pre'
        )}
      >
        <code className={cn('font-mono', codeClassName)}>
          {highlightedContent ?? children}
        </code>
      </pre>
    </div>
  );
}
