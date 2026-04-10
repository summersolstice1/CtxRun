import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  OcrPrepareProgress,
  OcrRecognitionResponse,
  OcrStatus,
} from '@/types/ocr';

export const OCR_PLUGIN_PREFIX = 'plugin:ctxrun-plugin-ocr|';
export const OCR_PREPARE_EVENT = 'ocr:prepare-progress';
export const OCR_MODELS_NOT_PREPARED_MESSAGE = 'OCR models are not prepared yet';

export function getOcrStatus() {
  return invoke<OcrStatus>(`${OCR_PLUGIN_PREFIX}ocr_get_status`);
}

export function prepareOcr() {
  return invoke<OcrStatus>(`${OCR_PLUGIN_PREFIX}ocr_prepare`);
}

export function releaseOcr() {
  return invoke<boolean>(`${OCR_PLUGIN_PREFIX}ocr_release`);
}

export function recognizeOcrFile(path: string) {
  return invoke<OcrRecognitionResponse>(`${OCR_PLUGIN_PREFIX}ocr_recognize_file`, {
    request: { path },
  });
}

export function normalizeOcrError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isOcrModelsNotPreparedError(error: unknown) {
  return normalizeOcrError(error).includes(OCR_MODELS_NOT_PREPARED_MESSAGE);
}

export function listenToOcrPrepareProgress(
  handler: (progress: OcrPrepareProgress) => void,
): Promise<UnlistenFn> {
  return listen<OcrPrepareProgress>(OCR_PREPARE_EVENT, (event) => {
    handler(event.payload);
  });
}
