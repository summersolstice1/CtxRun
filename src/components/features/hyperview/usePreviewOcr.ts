import { useCallback, useEffect, useRef, useState } from 'react';
import { getOcrStatus, isOcrModelsNotPreparedError, normalizeOcrError, recognizeOcrFile } from '@/lib/ocr';
import type { FileMeta } from '@/types/hyperview';
import type { OcrRecognitionResponse, OcrStatus } from '@/types/ocr';

export interface PreviewOcrState {
  isOpen: boolean;
  isBusy: boolean;
  needsSetup: boolean;
  status: OcrStatus | null;
  result: OcrRecognitionResponse | null;
  selectedLineIndex: number | null;
  selectionRequestId: number;
  error: string | null;
}

const INITIAL_PREVIEW_OCR_STATE: PreviewOcrState = {
  isOpen: false,
  isBusy: false,
  needsSetup: false,
  status: null,
  result: null,
  selectedLineIndex: null,
  selectionRequestId: 0,
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
    setState(INITIAL_PREVIEW_OCR_STATE);
  }, [activeFile?.path, isImageFile]);

  useEffect(() => {
    return () => {
      activeRequestIdRef.current += 1;
    };
  }, []);

  const closePanel = useCallback(() => {
    activeRequestIdRef.current += 1;
    setState(INITIAL_PREVIEW_OCR_STATE);
  }, []);

  const runOcr = useCallback(async () => {
    if (!activeFile || activeFile.previewType !== 'image') {
      return;
    }

    const requestId = ++activeRequestIdRef.current;
    onAutoPin();
    setState({
      isOpen: true,
      isBusy: true,
      needsSetup: false,
      status: null,
      result: null,
      selectedLineIndex: null,
      selectionRequestId: 0,
      error: null,
    });

    try {
      const status = await getOcrStatus();
      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      if (status.preparing || !status.installed) {
        setState({
          isOpen: true,
          isBusy: false,
          needsSetup: true,
          status,
          result: null,
          selectedLineIndex: null,
          selectionRequestId: 0,
          error: null,
        });
        return;
      }

      const result = await recognizeOcrFile(activeFile.path);
      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      setState({
        isOpen: true,
        isBusy: false,
        needsSetup: false,
        status,
        result,
        selectedLineIndex: null,
        selectionRequestId: 0,
        error: null,
      });
    } catch (error) {
      if (requestId !== activeRequestIdRef.current) {
        return;
      }

      const needsSetup = isOcrModelsNotPreparedError(error);
      setState((previous) => ({
        isOpen: true,
        isBusy: false,
        needsSetup,
        status: previous.status,
        result: null,
        selectedLineIndex: null,
        selectionRequestId: 0,
        error: needsSetup ? null : normalizeOcrError(error),
      }));
    }
  }, [activeFile, onAutoPin]);

  const highlightLine = useCallback((index: number | null) => {
    setState((previous) => {
      if (!previous.result) {
        return previous;
      }

      if (index === null) {
        if (previous.selectedLineIndex === null) {
          return previous;
        }

        return {
          ...previous,
          selectedLineIndex: null,
        };
      }

      if (index < 0 || index >= previous.result.lines.length || previous.selectedLineIndex === index) {
        return previous;
      }

      return {
        ...previous,
        selectedLineIndex: index,
      };
    });
  }, []);

  const selectLine = useCallback((index: number | null) => {
    setState((previous) => {
      if (!previous.result) {
        return previous;
      }

      if (index === null) {
        if (previous.selectedLineIndex === null) {
          return previous;
        }

        return {
          ...previous,
          selectedLineIndex: null,
          selectionRequestId: previous.selectionRequestId + 1,
        };
      }

      if (index < 0 || index >= previous.result.lines.length) {
        return previous;
      }

      return {
        ...previous,
        selectedLineIndex: index,
        selectionRequestId: previous.selectionRequestId + 1,
      };
    });
  }, []);

  return {
    ...state,
    canUseOcr: Boolean(isImageFile),
    closePanel,
    highlightLine,
    runOcr,
    selectLine,
  };
}
