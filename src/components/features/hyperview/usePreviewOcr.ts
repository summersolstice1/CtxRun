import { startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { getOcrStatus, isOcrModelsNotPreparedError, normalizeOcrError, recognizeOcrFile } from '@/lib/ocr';
import type { FileMeta } from '@/types/hyperview';
import type { OcrRecognitionResponse, OcrStatus } from '@/types/ocr';

export interface PreviewOcrState {
  isOpen: boolean;
  isBusy: boolean;
  needsSetup: boolean;
  status: OcrStatus | null;
  result: OcrRecognitionResponse | null;
  error: string | null;
}

const INITIAL_PREVIEW_OCR_STATE: PreviewOcrState = {
  isOpen: false,
  isBusy: false,
  needsSetup: false,
  status: null,
  result: null,
  error: null,
};

interface UsePreviewOcrOptions {
  activeFile: FileMeta | null;
  onAutoPin: () => void;
}

export function usePreviewOcr({ activeFile, onAutoPin }: UsePreviewOcrOptions) {
  const [state, setState] = useState<PreviewOcrState>(INITIAL_PREVIEW_OCR_STATE);
  const activeRequestIdRef = useRef(0);
  const isImageFile = activeFile?.previewType === 'image';

  useEffect(() => {
    activeRequestIdRef.current += 1;
    startTransition(() => setState(INITIAL_PREVIEW_OCR_STATE));
  }, [activeFile?.path, isImageFile]);

  useEffect(() => {
    return () => {
      activeRequestIdRef.current += 1;
    };
  }, []);

  const closePanel = useCallback(() => {
    activeRequestIdRef.current += 1;
    startTransition(() => setState(INITIAL_PREVIEW_OCR_STATE));
  }, []);

  const runOcr = useCallback(async () => {
    if (!activeFile || activeFile.previewType !== 'image') {
      return;
    }

    const requestId = ++activeRequestIdRef.current;
    onAutoPin();
    startTransition(() => {
      setState({
        isOpen: true,
        isBusy: true,
        needsSetup: false,
        status: null,
        result: null,
        error: null,
      });
    });

    try {
      const status = await getOcrStatus();
      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      if (status.preparing || !status.installed) {
        startTransition(() => {
          setState({
            isOpen: true,
            isBusy: false,
            needsSetup: true,
            status,
            result: null,
            error: null,
          });
        });
        return;
      }

      const result = await recognizeOcrFile(activeFile.path);
      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      startTransition(() => {
        setState({
          isOpen: true,
          isBusy: false,
          needsSetup: false,
          status,
          result,
          error: null,
        });
      });
    } catch (error) {
      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      const needsSetup = isOcrModelsNotPreparedError(error);
      startTransition(() => {
        setState((previous) => ({
          isOpen: true,
          isBusy: false,
          needsSetup,
          status: previous.status,
          result: null,
          error: needsSetup ? null : normalizeOcrError(error),
        }));
      });
    }
  }, [activeFile, onAutoPin]);

  return {
    ...state,
    canUseOcr: Boolean(isImageFile),
    closePanel,
    runOcr,
  };
}
