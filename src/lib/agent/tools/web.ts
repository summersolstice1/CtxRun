import { invoke } from '@tauri-apps/api/core';
import { AgentToolRegistry } from '../registry';
import { AgentToolExecutionResult } from '../types';
import { SinglePageExtractRequest, SinglePageExtractResult } from '@/types/miner';

const PLUGIN_PREFIX = 'plugin:ctxrun-plugin-miner|';
const MAX_MARKDOWN_RETURN_CHARS = 12_000;
const MIN_RELIABLE_MARKDOWN_CHARS = 260;

interface ExtractPageArgs {
  url: string;
  timeoutMs?: number;
  includeLinks?: boolean;
  saveToDisk?: boolean;
  outputDir?: string;
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

export function registerWebTools(registry: AgentToolRegistry): void {
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
