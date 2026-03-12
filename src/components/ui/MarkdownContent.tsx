import type { HTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { cn } from '@/lib/utils';

const DEFAULT_LINK_CLASSNAME =
  'font-medium underline decoration-dotted underline-offset-4 text-primary hover:text-primary/80 transition-colors';

export interface MarkdownContentProps extends HTMLAttributes<HTMLDivElement> {
  content: string;
  linkClassName?: string;
  inlineCodeClassName?: string;
  onOpenLink?: (href: string) => void;
  showExternalIndicator?: boolean;
}

export function MarkdownContent({
  content,
  className,
  linkClassName,
  inlineCodeClassName,
  onOpenLink,
  showExternalIndicator = false,
  ...props
}: MarkdownContentProps) {
  return (
    <div
      className={cn('min-w-0 break-words text-foreground', className)}
      {...props}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          p({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <p className={cn('mb-3 last:mb-0', elementClassName)} {...elementProps}>
                {children}
              </p>
            );
          },
          h1({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <h1
                className={cn(
                  'mt-6 mb-3 border-b border-border/60 pb-2 text-xl font-semibold tracking-tight first:mt-0',
                  elementClassName
                )}
                {...elementProps}
              >
                {children}
              </h1>
            );
          },
          h2({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <h2
                className={cn(
                  'mt-5 mb-3 border-b border-border/50 pb-1.5 text-lg font-semibold tracking-tight first:mt-0',
                  elementClassName
                )}
                {...elementProps}
              >
                {children}
              </h2>
            );
          },
          h3({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <h3
                className={cn('mt-4 mb-2 text-base font-semibold first:mt-0', elementClassName)}
                {...elementProps}
              >
                {children}
              </h3>
            );
          },
          h4({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <h4
                className={cn('mt-4 mb-2 text-sm font-semibold first:mt-0', elementClassName)}
                {...elementProps}
              >
                {children}
              </h4>
            );
          },
          h5({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <h5
                className={cn('mt-3 mb-2 text-sm font-semibold first:mt-0', elementClassName)}
                {...elementProps}
              >
                {children}
              </h5>
            );
          },
          h6({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <h6
                className={cn(
                  'mt-3 mb-2 text-xs font-semibold uppercase tracking-wide first:mt-0',
                  elementClassName
                )}
                {...elementProps}
              >
                {children}
              </h6>
            );
          },
          ul({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <ul className={cn('my-3 list-disc space-y-1 pl-6', elementClassName)} {...elementProps}>
                {children}
              </ul>
            );
          },
          ol({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <ol className={cn('my-3 list-decimal space-y-1 pl-6', elementClassName)} {...elementProps}>
                {children}
              </ol>
            );
          },
          li({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <li className={cn('pl-1', elementClassName)} {...elementProps}>
                {children}
              </li>
            );
          },
          blockquote({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <blockquote
                className={cn(
                  'my-4 rounded-r-lg border-l-4 border-primary/50 bg-secondary/30 px-4 py-2 text-muted-foreground',
                  elementClassName
                )}
                {...elementProps}
              >
                {children}
              </blockquote>
            );
          },
          hr({ className: elementClassName, ...elementProps }: any) {
            return <hr className={cn('my-6 border-border/60', elementClassName)} {...elementProps} />;
          },
          table({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <div className="my-4 w-full overflow-x-auto rounded-lg border border-border/50">
                <table
                  className={cn('w-full min-w-[24rem] border-collapse text-left text-sm', elementClassName)}
                  {...elementProps}
                >
                  {children}
                </table>
              </div>
            );
          },
          thead({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <thead className={cn('bg-secondary/60', elementClassName)} {...elementProps}>
                {children}
              </thead>
            );
          },
          tbody({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <tbody className={cn('divide-y divide-border/40', elementClassName)} {...elementProps}>
                {children}
              </tbody>
            );
          },
          tr({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <tr className={cn('align-top', elementClassName)} {...elementProps}>
                {children}
              </tr>
            );
          },
          th({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <th
                className={cn('border-b border-border/50 px-3 py-2 font-semibold whitespace-nowrap', elementClassName)}
                {...elementProps}
              >
                {children}
              </th>
            );
          },
          td({ className: elementClassName, children, ...elementProps }: any) {
            return (
              <td className={cn('px-3 py-2 align-top', elementClassName)} {...elementProps}>
                {children}
              </td>
            );
          },
          img({ className: elementClassName, alt, ...elementProps }: any) {
            return (
              <img
                alt={alt ?? ''}
                className={cn('my-4 h-auto max-w-full rounded-lg border border-border/50', elementClassName)}
                {...elementProps}
              />
            );
          },
          code({ inline, className: elementClassName, children, ...elementProps }: any) {
            const match = /language-([\w-]+)/.exec(elementClassName || '');
            if (!inline && match) {
              return (
                <CodeBlock language={match[1]} className="text-sm">
                  {String(children).replace(/\n$/, '')}
                </CodeBlock>
              );
            }

            if (!inline) {
              return (
                <pre className="my-3 overflow-x-auto rounded-lg border border-border/40 bg-black/20 p-4">
                  <code className={cn('font-mono text-sm', elementClassName)} {...elementProps}>
                    {children}
                  </code>
                </pre>
              );
            }

            return (
              <code
                className={cn(
                  'rounded bg-secondary/70 px-1.5 py-0.5 font-mono text-[0.85em] text-foreground',
                  inlineCodeClassName,
                  elementClassName
                )}
                {...elementProps}
              >
                {children}
              </code>
            );
          },
          a({ className: elementClassName, children, href, ...elementProps }: any) {
            const resolvedHref = typeof href === 'string' ? href : '';
            const classes = cn(DEFAULT_LINK_CLASSNAME, linkClassName, elementClassName);

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
                  {showExternalIndicator && (
                    <span className="ml-1 align-super text-[10px] opacity-70">↗</span>
                  )}
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
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
