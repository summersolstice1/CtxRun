import { useState } from "react";
import { FileQuestion, Loader2, RotateCcw } from "lucide-react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

import { buildPreviewUrl } from "@/lib/previewUrl";
import { FileMeta } from "@/types/hyperview";

const MIN_SCALE = 1;
const MAX_SCALE = 8;

export function ImageRenderer({ meta }: { meta: FileMeta }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);

  const src = buildPreviewUrl(meta.path);

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
                <img
                  src={src}
                  alt={meta.name}
                  draggable={false}
                  className="block max-h-full max-w-full select-none object-contain"
                  onLoad={() => {
                    setLoading(false);
                    setLoadError(null);
                    setZoomPercent(100);
                    resetTransform(0);
                  }}
                  onError={() => {
                    setLoading(false);
                    setLoadError(meta.mime || meta.name);
                  }}
                />
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
