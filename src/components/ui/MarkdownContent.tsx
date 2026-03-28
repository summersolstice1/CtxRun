import type { HTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import 'github-markdown-css/github-markdown.css';

type MarkdownVariant = 'github' | 'chat';

interface MarkdownContentProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
  linkClassName?: string;
  inlineCodeClassName?: string;
  onOpenLink?: (href: string) => void;
  showExternalIndicator?: boolean;
  variant?: MarkdownVariant;
}

export function MarkdownContent({
  content,
  className,
  linkClassName,
  inlineCodeClassName,
  onOpenLink,
  showExternalIndicator = false,
  variant = 'github',
  ...props
}: MarkdownContentProps) {
  const theme = useAppStore((state) => state.theme);
  const markdownTheme = theme === 'light' ? 'light' : 'dark';

  return (
    <div
      className={cn(
        'markdown-body ctx-markdown',
        variant === 'github' ? 'ctx-markdown--github' : 'ctx-markdown--chat',
        className
      )}
      data-theme={markdownTheme}
      {...props}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[
          rehypeSlug,
          [
            rehypeAutolinkHeadings,
            {
              behavior: 'append',
              properties: {
                className: ['ctx-markdown-heading-anchor'],
                ariaLabel: 'Link to section',
              },
              content: {
                type: 'text',
                value: '#',
              },
            },
          ],
        ]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          table({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <div className="ctx-markdown-table-wrap">
                <table className={elementClassName} {...elementProps}>
                  {children}
                </table>
              </div>
            );
          },
          code({ inline, className: elementClassName, children, ...elementProps }: any) {
            const languageMatch = /language-([\w-]+)/.exec(elementClassName || '');
            const text = String(children).replace(/\n$/, '');
            const isBlockCode = !inline && (Boolean(languageMatch) || text.includes('\n'));

            if (isBlockCode) {
              return (
                <CodeBlock
                  language={languageMatch?.[1] || 'text'}
                  variant={variant}
                  showCopyButton={variant === 'chat'}
                  className="text-sm"
                >
                  {text}
                </CodeBlock>
              );
            }

            return (
              <code
                className={cn('ctx-markdown-inline-code', inlineCodeClassName, elementClassName)}
                {...elementProps}
              >
                {children}
              </code>
            );
          },
          a({ className: elementClassName, children, href, ...elementProps }: any) {
            const resolvedHref = typeof href === 'string' ? href : '';
            const classes = cn('ctx-markdown-link', linkClassName, elementClassName);

            if (onOpenLink && resolvedHref) {
              return (
                <a
                  href={resolvedHref}
                  className={classes}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onOpenLink(resolvedHref);
                  }}
                  onAuxClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  {...elementProps}
                >
                  {children}
                  {showExternalIndicator && <span className="ctx-markdown-link-indicator">↗</span>}
                </a>
              );
            }

            return (
              <a
                href={resolvedHref || undefined}
                className={classes}
                rel="noreferrer noopener"
                target="_blank"
                {...elementProps}
              >
                {children}
                {showExternalIndicator && <span className="ctx-markdown-link-indicator">↗</span>}
              </a>
            );
          },
          img({ className: elementClassName, alt, src, ...elementProps }: any) {
            const resolvedSrc = typeof src === 'string' ? src.trim() : '';
            if (!resolvedSrc) {
              return null;
            }

            return (
              <img
                src={resolvedSrc}
                alt={alt ?? ''}
                className={cn('ctx-markdown-image', elementClassName)}
                loading="lazy"
                {...elementProps}
              />
            );
          },
          input({ className: elementClassName, ...elementProps }: any) {
            return <input className={cn('ctx-markdown-task-checkbox', elementClassName)} {...elementProps} />;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
