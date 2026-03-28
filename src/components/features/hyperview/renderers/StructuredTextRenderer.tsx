import { useMemo } from 'react';
import Papa from 'papaparse';
import xmlFormat from 'xml-formatter';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { FileMeta, PreviewMode } from '@/types/hyperview';

import { CodeRenderer } from './CodeRenderer';
import { useTextPreviewContent } from './useTextPreviewContent';

const TEXT_PREVIEW_LIMIT = 1024 * 1024 * 5;
const TABLE_ROW_LIMIT = 200;
const LARGE_FILE_FALLBACK =
  '// File too large for structured preview.\n// A larger streaming/source mode can be added later.';

function getExtension(name: string) {
  const lastDotIndex = name.lastIndexOf('.');
  return lastDotIndex >= 0 ? name.slice(lastDotIndex + 1).toLowerCase() : '';
}

function formatStructuredContent(ext: string, content: string) {
  if (ext === 'json') {
    return JSON.stringify(JSON.parse(content), null, 2);
  }

  if (ext === 'xml') {
    return xmlFormat(content, {
      indentation: '  ',
      collapseContent: true,
      lineSeparator: '\n',
    });
  }

  return content;
}

function buildTableRows(ext: string, content: string) {
  const delimiter = ext === 'tsv' ? '\t' : '';
  const parsed = Papa.parse<string[]>(content, {
    delimiter,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message || 'Failed to parse table');
  }

  const rows: string[][] = parsed.data
    .filter((row: string[]) => Array.isArray(row) && row.some((cell) => String(cell ?? '').length > 0))
    .slice(0, TABLE_ROW_LIMIT);

  const columnCount = rows.reduce((max: number, row: string[]) => Math.max(max, row.length), 0);
  return {
    rows,
    columns: Array.from({ length: columnCount }, (_, index) => `Col ${index + 1}`),
  };
}

function TableRenderer({ meta, content }: { meta: FileMeta; content: string }) {
  const { t } = useTranslation();
  const ext = getExtension(meta.name);

  const { rows, columns } = useMemo(() => buildTableRows(ext, content), [content, ext]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {rows.length >= TABLE_ROW_LIMIT && (
        <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
          {t('peek.tableRowsLimited', { count: TABLE_ROW_LIMIT })}
        </div>
      )}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <tr className="border-b border-border">
              <th className="w-14 px-3 py-2 text-left font-medium text-muted-foreground">#</th>
              {columns.map((column) => (
                <th key={column} className="px-3 py-2 text-left font-medium text-muted-foreground">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row: string[], rowIndex: number) => (
              <tr key={`${rowIndex}-${row.join('|')}`} className="border-b border-border/60 align-top">
                <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{rowIndex + 1}</td>
                {columns.map((_, cellIndex) => (
                  <td key={`${rowIndex}-${cellIndex}`} className="px-3 py-2 whitespace-pre-wrap break-all">
                    {row[cellIndex] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function StructuredTextRenderer({
  meta,
  mode,
}: {
  meta: FileMeta;
  mode: PreviewMode;
}) {
  const { t } = useTranslation();
  const { content, loading } = useTextPreviewContent(meta, {
    maxBytes: TEXT_PREVIEW_LIMIT,
    fallbackContent: LARGE_FILE_FALLBACK,
  });
  const ext = getExtension(meta.name);
  const codeLanguage = ext === 'csv' || ext === 'tsv' ? 'plaintext' : ext || 'plaintext';

  const formattedResult = useMemo(() => {
    if (mode !== 'formatted' || loading) {
      return null;
    }

    try {
      return {
        content: formatStructuredContent(ext, content),
        failed: false,
      };
    } catch {
      return {
        content,
        failed: true,
      };
    }
  }, [content, ext, loading, mode]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (mode === 'table') {
    try {
      return <TableRenderer meta={meta} content={content} />;
    } catch (error) {
      return (
        <div className="flex h-full flex-col overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-amber-500">
            <AlertCircle size={14} />
            <span>{String(error)}</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <CodeRenderer meta={meta} content={content} language={codeLanguage} />
          </div>
        </div>
      );
    }
  }

  if (mode === 'formatted' && formattedResult) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        {formattedResult.failed && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-amber-500">
            <AlertCircle size={14} />
            <span>{t('peek.formatFallback')}</span>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          <CodeRenderer meta={meta} content={formattedResult.content} language={codeLanguage} />
        </div>
      </div>
    );
  }

  return <CodeRenderer meta={meta} content={content} language={codeLanguage} />;
}
