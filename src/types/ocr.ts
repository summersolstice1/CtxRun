export interface OcrStatus {
  activeModel: string;
  activeRelease: string | null;
  modelDir: string;
  installed: boolean;
  loaded: boolean;
  preparing: boolean;
  missingFiles: string[];
  idleTtlSecs: number;
  idleExpiresInMs: number | null;
}

export interface OcrPrepareProgress {
  stage: string;
  releaseTag: string | null;
  currentFile: string | null;
  completedFiles: number;
  totalFiles: number;
  downloadedBytes: number;
  totalBytes: number;
  message: string | null;
}
