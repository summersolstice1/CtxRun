import { invoke } from '@tauri-apps/api/core';
import { AgentToolRegistry } from '../registry';
import { AgentToolExecutionResult } from '../types';
import { getWorkspaceRoot } from './workspaceRoot';

const TOOL_RUNTIME_PLUGIN_PREFIX = 'plugin:ctxrun-plugin-tool-runtime|';

type SearchMode = 'contains' | 'glob' | 'auto';

interface ListDirectoryArgs {
  path?: string;
  maxEntries?: number;
  maxDepth?: number;
  includeHidden?: boolean;
}

interface ReadFileArgs {
  path: string;
  startLine?: number;
  endLine?: number;
  maxBytes?: number;
}

interface SearchFilesArgs {
  query: string;
  path?: string;
  searchMode?: SearchMode;
  maxEntries?: number;
  maxDepth?: number;
  includeHidden?: boolean;
  filesOnly?: boolean;
}

interface AgentListLocalFilesRequest {
  rootDir: string;
  relativeDir?: string;
  maxEntries?: number;
  maxDepth?: number;
  includeHidden?: boolean;
}

interface AgentListEntry {
  path: string;
  isDir: boolean;
  size?: number | null;
}

interface AgentListLocalFilesResponse {
  dir: string;
  maxEntries: number;
  maxDepth: number;
  truncated: boolean;
  entries: AgentListEntry[];
}

interface AgentReadLocalFileRequest {
  rootDir: string;
  relativePath: string;
  startLine?: number;
  endLine?: number;
  maxBytes?: number;
}

interface AgentSearchLocalFilesRequest {
  rootDir: string;
  relativeDir?: string;
  query: string;
  searchMode?: SearchMode;
  maxEntries?: number;
  maxDepth?: number;
  includeHidden?: boolean;
  filesOnly?: boolean;
}

interface AgentReadLocalFileResponse {
  path: string;
  content: string;
  truncated: boolean;
  totalBytes: number;
  bytesRead: number;
  startLine: number;
  endLine?: number | null;
}

interface AgentSearchLocalFilesResponse {
  dir: string;
  query: string;
  searchMode: SearchMode;
  maxEntries: number;
  maxDepth: number;
  truncated: boolean;
  entries: AgentListEntry[];
}

function normalizeListArgs(input: unknown): ListDirectoryArgs {
  if (!input || typeof input !== 'object') {
    return {};
  }
  const raw = input as Record<string, unknown>;
  const path = typeof raw.path === 'string' ? raw.path.trim() : undefined;
  const maxEntries =
    typeof raw.maxEntries === 'number' && Number.isFinite(raw.maxEntries)
      ? Math.floor(raw.maxEntries)
      : undefined;
  const maxDepth =
    typeof raw.maxDepth === 'number' && Number.isFinite(raw.maxDepth)
      ? Math.floor(raw.maxDepth)
      : undefined;
  const includeHidden =
    typeof raw.includeHidden === 'boolean' ? raw.includeHidden : undefined;

  return {
    path: path && path.length > 0 ? path : undefined,
    maxEntries,
    maxDepth,
    includeHidden,
  };
}

function normalizeReadArgs(input: unknown): ReadFileArgs {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid arguments, object expected.');
  }

  const raw = input as Record<string, unknown>;
  const path = typeof raw.path === 'string' ? raw.path.trim() : '';
  if (!path) {
    throw new Error('path is required.');
  }

  const startLine =
    typeof raw.startLine === 'number' && Number.isFinite(raw.startLine)
      ? Math.max(1, Math.floor(raw.startLine))
      : undefined;
  const endLine =
    typeof raw.endLine === 'number' && Number.isFinite(raw.endLine)
      ? Math.max(1, Math.floor(raw.endLine))
      : undefined;
  const maxBytes =
    typeof raw.maxBytes === 'number' && Number.isFinite(raw.maxBytes)
      ? Math.max(1024, Math.floor(raw.maxBytes))
      : undefined;

  return {
    path,
    startLine,
    endLine,
    maxBytes,
  };
}

function parseSearchMode(value: unknown): SearchMode | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  if (normalized === 'contains' || normalized === 'glob' || normalized === 'auto') {
    return normalized;
  }

  throw new Error('searchMode must be one of contains|glob|auto.');
}

function normalizeSearchArgs(input: unknown): SearchFilesArgs {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid arguments, object expected.');
  }

  const raw = input as Record<string, unknown>;
  const query = typeof raw.query === 'string' ? raw.query.trim() : '';
  if (!query) {
    throw new Error('query is required.');
  }

  const path = typeof raw.path === 'string' ? raw.path.trim() : undefined;
  const maxEntries =
    typeof raw.maxEntries === 'number' && Number.isFinite(raw.maxEntries)
      ? Math.floor(raw.maxEntries)
      : undefined;
  const maxDepth =
    typeof raw.maxDepth === 'number' && Number.isFinite(raw.maxDepth)
      ? Math.floor(raw.maxDepth)
      : undefined;
  const includeHidden =
    typeof raw.includeHidden === 'boolean' ? raw.includeHidden : undefined;
  const filesOnly =
    typeof raw.filesOnly === 'boolean' ? raw.filesOnly : undefined;

  return {
    query,
    path: path && path.length > 0 ? path : undefined,
    searchMode: parseSearchMode(raw.searchMode),
    maxEntries,
    maxDepth,
    includeHidden,
    filesOnly,
  };
}

function buildListSummary(result: AgentListLocalFilesResponse): string {
  const count = result.entries.length;
  const suffix = result.truncated ? ' (truncated)' : '';
  return `Listed ${count} entries under ${result.dir}${suffix}.`;
}

function buildSearchSummary(result: AgentSearchLocalFilesResponse): string {
  const count = result.entries.length;
  const suffix = result.truncated ? ' (truncated)' : '';
  return `Found ${count} matches for "${result.query}" under ${result.dir} by ${result.searchMode}${suffix}.`;
}

function buildReadSummary(result: AgentReadLocalFileResponse): string {
  const head = `Read ${result.path} (${result.bytesRead}/${result.totalBytes} bytes).`;
  if (!result.content) {
    return `${head}\n\n[Empty file content]`;
  }
  if (result.truncated) {
    return `${head}\n\n${result.content}\n\n[truncated]`;
  }
  return `${head}\n\n${result.content}`;
}

function toToolError(error: unknown): AgentToolExecutionResult {
  return {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  };
}

export function registerFsTools(registry: AgentToolRegistry): void {
  registry.register({
    definition: {
      name: 'fs.list_directory',
      description:
        'List files/directories under workspace root. Input path must be workspace-relative.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Directory path relative to workspace root. Default "."',
          },
          maxEntries: { type: 'integer', minimum: 10, maximum: 1000 },
          maxDepth: { type: 'integer', minimum: 1, maximum: 8 },
          includeHidden: { type: 'boolean' },
        },
      },
      riskLevel: 'low',
      timeoutMs: 30_000,
    },
    handler: async (input) => {
      try {
        const rootDir = getWorkspaceRoot();
        const args = normalizeListArgs(input);
        const request: AgentListLocalFilesRequest = {
          rootDir,
          relativeDir: args.path,
          maxEntries: args.maxEntries,
          maxDepth: args.maxDepth,
          includeHidden: args.includeHidden,
        };
        const result = await invoke<AgentListLocalFilesResponse>(`${TOOL_RUNTIME_PLUGIN_PREFIX}agent_list_local_files`, {
          request,
        });
        return {
          ok: true,
          text: buildListSummary(result),
          structured: result as unknown as Record<string, unknown>,
        };
      } catch (error) {
        return toToolError(error);
      }
    },
  });

  registry.register({
    definition: {
      name: 'fs.search_files',
      description:
        'Search files/directories under workspace root by name/path pattern. Use this to locate targets before reading.',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query. Supports contains mode and glob wildcards (*, ?).',
          },
          path: {
            type: 'string',
            description: 'Base directory path relative to workspace root. Default "."',
          },
          searchMode: {
            type: 'string',
            enum: ['contains', 'glob', 'auto'],
            description: 'Search mode. auto picks glob when query has * or ?.',
          },
          maxEntries: { type: 'integer', minimum: 10, maximum: 1000 },
          maxDepth: { type: 'integer', minimum: 1, maximum: 8 },
          includeHidden: { type: 'boolean' },
          filesOnly: {
            type: 'boolean',
            description: 'Default true. Set false to include directories in matches.',
          },
        },
        required: ['query'],
      },
      riskLevel: 'low',
      timeoutMs: 30_000,
    },
    handler: async (input) => {
      try {
        const rootDir = getWorkspaceRoot();
        const args = normalizeSearchArgs(input);
        const request: AgentSearchLocalFilesRequest = {
          rootDir,
          relativeDir: args.path,
          query: args.query,
          searchMode: args.searchMode,
          maxEntries: args.maxEntries,
          maxDepth: args.maxDepth,
          includeHidden: args.includeHidden,
          filesOnly: args.filesOnly,
        };
        const result = await invoke<AgentSearchLocalFilesResponse>(`${TOOL_RUNTIME_PLUGIN_PREFIX}agent_search_local_files`, {
          request,
        });
        return {
          ok: true,
          text: buildSearchSummary(result),
          structured: result as unknown as Record<string, unknown>,
          warnings: result.truncated
            ? ['search results truncated by maxEntries guard']
            : undefined,
        };
      } catch (error) {
        return toToolError(error);
      }
    },
  });

  registry.register({
    definition: {
      name: 'fs.read_file',
      description:
        'Read a text file under workspace root. Path must be workspace-relative.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to workspace root.' },
          startLine: { type: 'integer', minimum: 1 },
          endLine: { type: 'integer', minimum: 1 },
          maxBytes: { type: 'integer', minimum: 1024, maximum: 262144 },
        },
        required: ['path'],
      },
      riskLevel: 'low',
      timeoutMs: 30_000,
    },
    handler: async (input) => {
      try {
        const rootDir = getWorkspaceRoot();
        const args = normalizeReadArgs(input);
        const request: AgentReadLocalFileRequest = {
          rootDir,
          relativePath: args.path,
          startLine: args.startLine,
          endLine: args.endLine,
          maxBytes: args.maxBytes,
        };
        const result = await invoke<AgentReadLocalFileResponse>(`${TOOL_RUNTIME_PLUGIN_PREFIX}agent_read_local_file`, {
          request,
        });
        return {
          ok: true,
          text: buildReadSummary(result),
          structured: result as unknown as Record<string, unknown>,
          warnings: result.truncated
            ? ['file content truncated by maxBytes guard']
            : undefined,
        };
      } catch (error) {
        return toToolError(error);
      }
    },
  });
}
