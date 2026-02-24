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
