// src/types/miner.ts

export interface MinerConfig {
  url: string;
  matchPrefix: string;
  maxDepth: number;
  maxPages: number;
  concurrency: number;
}

export interface MinerProgressEvent {
  current: number;
  totalDiscovered: number;
  currentUrl: string;
  status: string; // "Fetching" | "Saved"
}

export interface MinerFinishedEvent {
  totalPages: number;
  outputDir: string;
}

export interface MinerErrorEvent {
  url: string;
  message: string;
}

export interface MinerLog {
  id: string;
  timestamp: number;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
  url?: string;
}

export interface SinglePageExtractRequest {
  url: string;
  timeoutMs?: number;
  includeLinks?: boolean;
  saveToDisk?: boolean;
  outputDir?: string;
}

export interface SinglePageExtractResult {
  url: string;
  title: string;
  markdown: string;
  links: string[];
  crawledAt: string;
  savedPath?: string | null;
  warnings: string[];
}

export interface WebSearchRequest {
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

export interface WebSearchItem {
  rank: number;
  title: string;
  url: string;
  snippet: string;
  host: string;
}

interface WebSearchDebugItem {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchDebugInfo {
  enabled: boolean;
  attemptedEngines: string[];
  fallbackReason?: string | null;
  pageUrl?: string | null;
  readyState?: string | null;
  resultHeadingCount?: number | null;
  anchorCount?: number | null;
  blockedHint?: boolean | null;
  rawItemsCount: number;
  filteredItemsCount: number;
  rawItemsPreview: WebSearchDebugItem[];
  bodyTextSample?: string | null;
  searchRootHtmlSample?: string | null;
  notes: string[];
}

export interface WebSearchResult {
  engine: string;
  query: string;
  searchUrl: string;
  start: number;
  limit: number;
  totalFound: number;
  returnedCount: number;
  blocked: boolean;
  pageTitle: string;
  items: WebSearchItem[];
  searchedAt: string;
  warnings: string[];
  requiresHumanVerification?: boolean;
  verificationEngine?: string;
  verificationUrl?: string;
  debug?: WebSearchDebugInfo;
}
