import { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import { getText } from '@/lib/i18n';

interface CodeBlockProps {
  language: string;
  children: string;
  className?: string;
}

export function CodeBlock({ language, children, className }: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false);
  const { language: appLang } = useAppStore();

  const handleCopy = async () => {
    try {
      await writeText(children);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  const displayLang = language === 'typescript' || language === 'ts' ? 'TS'
    : language === 'javascript' || language === 'js' ? 'JS'
    : language === 'bash' || language === 'sh' ? 'Terminal'
    : language;

  return (
    <div className={cn(
        "relative group rounded-lg overflow-hidden my-3 border border-border/40 bg-card shadow-sm",
        className
    )}>
      <style>{`
        .code-block-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
        .code-block-scroll::-webkit-scrollbar-track { background: transparent; }
        .code-block-scroll::-webkit-scrollbar-thumb { background-color: rgba(128, 128, 128, 0.2); border-radius: 3px; }
        .code-block-scroll::-webkit-scrollbar-thumb:hover { background-color: rgba(128, 128, 128, 0.4); }
        .code-block-scroll::-webkit-scrollbar-corner { background: transparent; }
      `}</style>

      <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/5 select-none">

        <div className="flex items-center gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
            {(language === 'bash' || language === 'sh' || language === 'shell') && (
                <Terminal size={12} />
            )}
            <span className="text-[11px] font-mono font-medium uppercase tracking-wider text-muted-foreground/80">
                {displayLang}
            </span>
        </div>

        <button
            onClick={handleCopy}
            className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded transition-all duration-200",
                "text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/10",
                isCopied && "text-green-500 hover:text-green-500"
            )}
        >
            {isCopied ? (
                <>
                    <Check size={12} />
                    <span>{getText('common', 'copied', appLang)}</span>
                </>
            ) : (
                <>
                    <Copy size={12} />
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity">{getText('common', 'copy', appLang)}</span>
                </>
            )}
        </button>
      </div>

      <div className="relative">
        <SyntaxHighlighter
            style={vscDarkPlus}
            language={language}
            PreTag="div"
            className="code-block-scroll"
            customStyle={{
                margin: 0,
                padding: '1rem', 
                fontSize: '0.875rem',
                lineHeight: '1.6',
                background: 'transparent',
            }}
            codeTagProps={{
                style: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }
            }}
        >
            {children}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}