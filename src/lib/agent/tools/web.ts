import { invoke } from '@tauri-apps/api/core';
import { AgentToolRegistry } from '../registry';
import { AgentToolExecutionResult } from '../types';
import {
  SinglePageExtractRequest,
  SinglePageExtractResult,
  WebSearchRequest,
  WebSearchResult,
} from '@/types/miner';

const PLUGIN_PREFIX = 'plugin:ctxrun-plugin-miner|';
const MAX_MARKDOWN_RETURN_CHARS = 12_000;
const MIN_RELIABLE_MARKDOWN_CHARS = 260;
const DEFAULT_SEARCH_LIMIT = 8;
const MIN_SEARCH_LIMIT = 1;
const MAX_SEARCH_LIMIT = 20;
const MAX_SEARCH_START = 200;
const MIN_SEARCH_TIMEOUT_MS = 3_000;
const MAX_SEARCH_TIMEOUT_MS = 120_000;

interface ExtractPageArgs {
  url: string;
  timeoutMs?: number;
  includeLinks?: boolean;
  saveToDisk?: boolean;
  outputDir?: string;
}

interface SearchWebArgs {
  query: string;
  limit?: number;
  start?: number;
  language?: string;
  country?: string;
  safeSearch?: boolean;
  timeoutMs?: number;
  antiBotMode?: boolean;
  debug?: boolean;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function compactSingleLine(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1))}…`;
}

function normalizeExtractArgs(input: unknown): ExtractPageArgs {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid arguments, object expected.');
  }

  const raw = input as Record<string, unknown>;
  const url = typeof raw.url === 'string' ? raw.url.trim() : '';
  if (!url) {
    throw new Error('url is required.');
  }

  const timeoutMs = typeof raw.timeoutMs === 'number' && Number.isFinite(raw.timeoutMs)
    ? Math.max(1_000, Math.floor(raw.timeoutMs))
    : undefined;
  const includeLinks = typeof raw.includeLinks === 'boolean' ? raw.includeLinks : undefined;
  const saveToDisk = typeof raw.saveToDisk === 'boolean' ? raw.saveToDisk : undefined;
  const outputDir = typeof raw.outputDir === 'string' ? raw.outputDir.trim() : undefined;

  return {
    url,
    timeoutMs,
    includeLinks,
    saveToDisk,
    outputDir: outputDir && outputDir.length > 0 ? outputDir : undefined,
  };
}

function normalizeSearchArgs(input: unknown): SearchWebArgs {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid arguments, object expected.');
  }

  const raw = input as Record<string, unknown>;
  const query = typeof raw.query === 'string' ? raw.query.trim() : '';
  if (!query) {
    throw new Error('query is required.');
  }

  const limit = typeof raw.limit === 'number' && Number.isFinite(raw.limit)
    ? clampNumber(Math.floor(raw.limit), MIN_SEARCH_LIMIT, MAX_SEARCH_LIMIT)
    : DEFAULT_SEARCH_LIMIT;
  const start = typeof raw.start === 'number' && Number.isFinite(raw.start)
    ? clampNumber(Math.floor(raw.start), 0, MAX_SEARCH_START)
    : 0;
  const language = typeof raw.language === 'string' ? raw.language.trim() : '';
  const country = typeof raw.country === 'string' ? raw.country.trim() : '';
  const safeSearch = typeof raw.safeSearch === 'boolean' ? raw.safeSearch : false;
  const timeoutMs = typeof raw.timeoutMs === 'number' && Number.isFinite(raw.timeoutMs)
    ? clampNumber(Math.floor(raw.timeoutMs), MIN_SEARCH_TIMEOUT_MS, MAX_SEARCH_TIMEOUT_MS)
    : undefined;
  const antiBotMode = typeof raw.antiBotMode === 'boolean' ? raw.antiBotMode : true;
  const debug = typeof raw.debug === 'boolean' ? raw.debug : false;

  return {
    query,
    limit,
    start,
    language: language || undefined,
    country: country || undefined,
    safeSearch,
    timeoutMs,
    antiBotMode,
    debug,
  };
}

function buildToolOutput(result: SinglePageExtractResult): AgentToolExecutionResult {
  const originalMarkdown = result.markdown ?? '';
  const normalizedMarkdown = originalMarkdown.replace(/\s+/g, ' ').trim();
  const markdownLength = normalizedMarkdown.length;
  const markdownTruncated = originalMarkdown.length > MAX_MARKDOWN_RETURN_CHARS;
  const markdown = markdownTruncated
    ? `${originalMarkdown.slice(0, MAX_MARKDOWN_RETURN_CHARS)}\n\n[truncated]`
    : originalMarkdown;

  const structured = {
    ...result,
    markdown,
    markdownOriginalLength: originalMarkdown.length,
    markdownTruncated,
  };

  if (markdownLength < MIN_RELIABLE_MARKDOWN_CHARS) {
    return {
      ok: false,
      error:
        `Extracted content from ${result.url} is too short (${markdownLength} chars) to be reliable. ` +
        'The page may require dynamic rendering, block crawlers, or not contain the target data.',
      structured,
      warnings: [
        ...(result.warnings ?? []),
        'extracted markdown too short for reliable analysis',
      ],
    };
  }

  return {
    ok: true,
    text: `Fetched ${result.url} (${markdownLength} chars).`,
    structured,
    warnings: markdownTruncated ? ['markdown truncated for context safety'] : undefined,
  };
}

function buildSearchDebugLines(result: WebSearchResult): string[] {
  const debug = result.debug;
  if (!debug?.enabled) return [];

  const lines: string[] = [];
  lines.push(
    `[debug] engines=${(debug.attemptedEngines ?? []).join(' -> ') || result.engine}, fallback=${debug.fallbackReason ?? 'none'}`
  );
  lines.push(
    `[debug] raw=${debug.rawItemsCount}, filtered=${debug.filteredItemsCount}, headings=${debug.resultHeadingCount ?? 'n/a'}, anchors=${debug.anchorCount ?? 'n/a'}, blockedHint=${debug.blockedHint ?? result.blocked}`
  );
  if (debug.pageUrl) {
    lines.push(`[debug] page=${compactSingleLine(debug.pageUrl, 180)}`);
  }
  if (debug.bodyTextSample) {
    lines.push(`[debug] body=${compactSingleLine(debug.bodyTextSample, 180)}`);
  }
  if (debug.rawItemsPreview?.length) {
    for (const item of debug.rawItemsPreview.slice(0, 3)) {
      lines.push(
        `[debug.raw] ${compactSingleLine(item.title || '(no title)', 90)} | ${compactSingleLine(item.url || '', 130)}`
      );
    }
  }
  if (debug.notes?.length) {
    for (const note of debug.notes.slice(0, 3)) {
      lines.push(`[debug.note] ${compactSingleLine(note, 180)}`);
    }
  }
  return lines;
}

function buildSearchOutput(result: WebSearchResult): AgentToolExecutionResult {
  const warnings = (result.warnings ?? []).filter((warning) => warning.trim().length > 0);
  const debugLines = buildSearchDebugLines(result);

  const header = result.blocked
    ? `${result.engine} search was blocked by consent/captcha verification. Please provide a direct URL, or retry later.`
    : (!result.items || result.items.length === 0)
      ? `No web results found for query "${result.query}".`
      : `${result.engine} search found ${result.returnedCount} results for "${result.query}".`;

  const previewLines = (result.items ?? [])
    .slice(0, 5)
    .map((item) => `${item.rank}. ${item.title} - ${item.url}${item.snippet ? ` | ${compactSingleLine(item.snippet, 160)}` : ''}`);

  const mergedWarnings = [...warnings];
  if (result.blocked) {
    mergedWarnings.push(`${result.engine} search blocked by consent/captcha`);
  } else if (!result.items || result.items.length === 0) {
    if (mergedWarnings.length === 0) {
      mergedWarnings.push('no results returned from search engine');
    }
  }

  return {
    ok: true,
    text: [header, ...previewLines, ...debugLines].join('\n'),
    structured: result as unknown as Record<string, unknown>,
    warnings: mergedWarnings.length > 0 ? mergedWarnings : undefined,
  };
}

export function registerWebTools(registry: AgentToolRegistry): void {
  registry.register({
    definition: {
      name: 'web.search',
      description:
        'Search the web in a local browser (Google primary, fallback engine when blocked) and return ranked results.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query keywords.' },
          limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Maximum results to return.' },
          start: { type: 'integer', minimum: 0, maximum: 200, description: 'Result offset (0, 10, 20...).' },
          language: { type: 'string', description: 'Interface language hint, e.g. en or zh-CN.' },
          country: { type: 'string', description: 'Country hint, e.g. US or CN.' },
          safeSearch: { type: 'boolean', description: 'Enable Google safe search.' },
          timeoutMs: { type: 'integer', minimum: 3000, maximum: 120000 },
          antiBotMode: { type: 'boolean', description: 'Enable anti-bot mode (external debug browser + persistent profile).' },
          debug: { type: 'boolean', description: 'Include diagnostics for parser tuning.' },
        },
        required: ['query'],
      },
      riskLevel: 'low',
      timeoutMs: 120_000,
    },
    handler: async (input) => {
      try {
        const args = normalizeSearchArgs(input);
        const request: WebSearchRequest = {
          query: args.query,
          limit: args.limit,
          start: args.start,
          language: args.language,
          country: args.country,
          safeSearch: args.safeSearch,
          timeoutMs: args.timeoutMs,
          antiBotMode: args.antiBotMode,
          debug: args.debug,
        };
        const result = await invoke<WebSearchResult>(`${PLUGIN_PREFIX}search_web`, { request });
        return buildSearchOutput(result);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  registry.register({
    definition: {
      name: 'web.extract_page',
      description: 'Extract readable markdown from one HTTP/HTTPS page.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Target URL.' },
          timeoutMs: { type: 'integer', minimum: 1000, maximum: 120000 },
          includeLinks: { type: 'boolean' },
          saveToDisk: { type: 'boolean' },
          outputDir: { type: 'string' },
        },
        required: ['url'],
      },
      riskLevel: 'low',
      timeoutMs: 120_000,
    },
    handler: async (input) => {
      try {
        const args = normalizeExtractArgs(input);
        const request: SinglePageExtractRequest = {
          url: args.url,
          timeoutMs: args.timeoutMs,
          includeLinks: args.includeLinks ?? false,
          saveToDisk: args.saveToDisk ?? false,
          outputDir: args.outputDir,
        };

        const result = await invoke<SinglePageExtractResult>(`${PLUGIN_PREFIX}extract_single_page`, { request });
        return buildToolOutput(result);
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}
