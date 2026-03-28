import { Loader2 } from 'lucide-react';

import type { FileMeta, PreviewMode } from '@/types/hyperview';

import { CodeRenderer } from './CodeRenderer';
import { HtmlRenderer } from './HtmlRenderer';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useTextPreviewContent } from './useTextPreviewContent';

const MARKDOWN_LARGE_FILE_CONTENT =
  '# File too large\n\nPreviewing large markdown files is disabled for performance.';

const HTML_LARGE_FILE_CONTENT =
  '<!-- File too large for source preview. A larger streaming/source mode can be added later. -->';

export function MarkupRenderer({
  meta,
  mode,
}: {
  meta: FileMeta;
  mode: PreviewMode;
}) {
  const needsTextContent = meta.previewType === 'markdown' || mode === 'source';
  const { content, loading } = useTextPreviewContent(meta, {
    enabled: needsTextContent,
    maxBytes: meta.previewType === 'markdown' ? 1024 * 1024 * 2 : 1024 * 1024 * 5,
    fallbackContent: meta.previewType === 'markdown' ? MARKDOWN_LARGE_FILE_CONTENT : HTML_LARGE_FILE_CONTENT,
  });

  if (needsTextContent && loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (meta.previewType === 'markdown') {
    if (mode === 'source') {
      return <CodeRenderer meta={meta} content={content} language="markdown" />;
    }

    return <MarkdownRenderer meta={meta} content={content} />;
  }

  if (mode === 'source') {
    return <CodeRenderer meta={meta} content={content} language="html" />;
  }

  return <HtmlRenderer meta={meta} />;
}
