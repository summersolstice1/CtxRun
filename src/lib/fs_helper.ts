import { invoke } from '@tauri-apps/api/core';
import { IgnoreConfig, ScanProjectResult } from '@/types/context';

const CONTEXT_PLUGIN_PREFIX = 'plugin:ctxrun-plugin-context|';

interface ScanProjectOptions {
  syncIgnoreFiles?: boolean;
  maxDepth?: number;
  maxEntries?: number;
}

export async function scanProject(
  path: string,
  config: IgnoreConfig,
  options: ScanProjectOptions = {}
): Promise<ScanProjectResult> {
  return invoke<ScanProjectResult>(`${CONTEXT_PLUGIN_PREFIX}scan_project_tree`, {
    projectRoot: path,
    ignore: config,
    syncIgnoreFiles: options.syncIgnoreFiles ?? false,
    maxDepth: options.maxDepth ?? 24,
    maxEntries: options.maxEntries ?? 100000
  });
}
