import { useCallback, useEffect, useRef, useState } from "react";
import { FileQuestion, Loader2, RotateCcw } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import { buildPreviewUrl } from "@/lib/previewUrl";
import { cn } from "@/lib/utils";
import { FileMeta } from "@/types/hyperview";
import type { OcrRecognitionResponse } from "@/types/ocr";

const MIN_SCALE = 1;
const MAX_SCALE = 8;

interface ImageFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ImageRendererProps {
  meta: FileMeta;
  ocrResult?: OcrRecognitionResponse | null;
  selectedOcrLineIndex?: number | null;
  onSelectOcrLine?: (index: number) => void;
}

function ImageOcrOverlay({
  frame,
  result,
  selectedLineIndex,
  onSelectLine,
}: {
  frame: ImageFrame;
  result: OcrRecognitionResponse;
  selectedLineIndex: number | null;
  onSelectLine?: (index: number) => void;
}) {
  if (result.imageWidth <= 0 || result.imageHeight <= 0 || result.lines.length === 0) {
    return null;
  }

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: frame.left,
        top: frame.top,
        width: frame.width,
        height: frame.height,
      }}
    >
      {result.lines.map((line, index) => {
        const insetX = Math.min(2, line.bbox.width * 0.04);
        const insetY = Math.min(2, line.bbox.height * 0.08);
        const left = ((line.bbox.left + insetX) / result.imageWidth) * 100;
        const top = ((line.bbox.top + insetY) / result.imageHeight) * 100;
        const width = ((line.bbox.width - insetX * 2) / result.imageWidth) * 100;
        const height = ((line.bbox.height - insetY * 2) / result.imageHeight) * 100;

        if (width <= 0 || height <= 0) {
          return null;
        }

        return (
          <button
            key={`${index}-${line.text}`}
            type="button"
            className={cn(
              "pointer-events-auto absolute rounded-[3px] border transition-colors",
              selectedLineIndex === index
                ? "border-primary bg-primary/10 shadow-[0_0_0_1px_rgba(59,130,246,0.22)]"
                : "border-primary/70 bg-transparent hover:border-primary"
            )}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${width}%`,
              height: `${height}%`,
            }}
            aria-label={line.text || `OCR line ${index + 1}`}
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSelectLine?.(index);
            }}
          />
        );
      })}
    </div>
  );
}

export function ImageRenderer({
  meta,
  ocrResult,
  selectedOcrLineIndex = null,
  onSelectOcrLine,
}: ImageRendererProps) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [imageFrame, setImageFrame] = useState<ImageFrame | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const src = buildPreviewUrl(meta.path);

  const updateImageFrame = useCallback(() => {
    const stage = stageRef.current;
    const image = imageRef.current;

    if (!stage || !image || image.clientWidth === 0 || image.clientHeight === 0) {
      setImageFrame(null);
      return;
    }

    setImageFrame({
      left: image.offsetLeft,
      top: image.offsetTop,
      width: image.clientWidth,
      height: image.clientHeight,
    });
  }, []);

  useEffect(() => {
    updateImageFrame();

    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      updateImageFrame();
    });

    observer.observe(stage);
    observer.observe(image);

    return () => {
      observer.disconnect();
    };
  }, [src, updateImageFrame]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-transparent">
      {loading && !loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="animate-spin text-muted-foreground" />
        </div>
      )}

      {loadError ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
          <FileQuestion size={24} />
          <div>
            <p className="text-sm font-semibold text-foreground">Image preview failed</p>
            <p className="mt-1 text-sm">{loadError}</p>
          </div>
        </div>
      ) : (
        <TransformWrapper
          key={meta.path}
          initialScale={1}
          minScale={MIN_SCALE}
          maxScale={MAX_SCALE}
          centerOnInit
          centerZoomedOut
          disablePadding
          limitToBounds={false}
          smooth={false}
          wheel={{
            step: 0.14,
            touchPadDisabled: false,
          }}
          pinch={{
            disabled: false,
          }}
          doubleClick={{
            mode: "toggle",
            step: 2,
            animationTime: 120,
          }}
          panning={{
            disabled: false,
            velocityDisabled: true,
            allowLeftClickPan: true,
            wheelPanning: false,
            lockAxisX: false,
            lockAxisY: false,
          }}
          alignmentAnimation={{
            disabled: true,
          }}
          velocityAnimation={{
            disabled: true,
          }}
          onTransformed={(_, state) => {
            setZoomPercent(Math.round(state.scale * 100));
          }}
        >
          {({ resetTransform }) => (
            <>
              <TransformComponent
                wrapperClass="!h-full !w-full"
                contentClass="!h-full !w-full !flex !items-center !justify-center"
              >
                <div ref={stageRef} className="relative flex h-full w-full items-center justify-center">
                  <img
                    ref={imageRef}
                    src={src}
                    alt={meta.name}
                    draggable={false}
                    className="block max-h-full max-w-full select-none object-contain"
                    onLoad={() => {
                      setLoading(false);
                      setLoadError(null);
                      setZoomPercent(100);
                      resetTransform(0);
                      updateImageFrame();
                    }}
                    onError={() => {
                      setLoading(false);
                      setLoadError(meta.mime || meta.name);
                      setImageFrame(null);
                    }}
                  />
                  {ocrResult && imageFrame && (
                    <ImageOcrOverlay
                      frame={imageFrame}
                      result={ocrResult}
                      selectedLineIndex={selectedOcrLineIndex}
                      onSelectLine={onSelectOcrLine}
                    />
                  )}
                </div>
              </TransformComponent>

              <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2">
                <button
                  type="button"
                  className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition hover:text-foreground"
                  onClick={() => resetTransform(120)}
                  aria-label="Reset zoom"
                >
                  <RotateCcw size={14} />
                </button>
                <div className="rounded-full bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-sm">
                  {zoomPercent}%
                </div>
              </div>
            </>
          )}
        </TransformWrapper>
      )}
    </div>
  );
}
