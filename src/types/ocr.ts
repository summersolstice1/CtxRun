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

export interface OcrPoint {
  x: number;
  y: number;
}

export interface OcrBoundingBox {
  left: number;
  top: number;
  width: number;
  height: number;
  score: number;
  points: OcrPoint[] | null;
}

export interface OcrLine {
  text: string;
  confidence: number;
  bbox: OcrBoundingBox;
}

export interface OcrRecognitionResponse {
  modelProfile: string;
  fullText: string;
  lines: OcrLine[];
  lineCount: number;
  elapsedMs: number;
  imageWidth: number;
  imageHeight: number;
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
