import { useEffect, useRef, useState } from 'react';
import { FileQuestion, Loader2 } from 'lucide-react';
import { renderAsync } from 'docx-preview';

import { buildPreviewUrl } from '@/lib/previewUrl';
import type { FileMeta } from '@/types/hyperview';

const DOCX_RENDER_OPTIONS = {
  className: 'ctxrun-docx',
  inWrapper: true,
  breakPages: true,
  ignoreLastRenderedPageBreak: false,
  experimental: true,
  renderHeaders: true,
  renderFooters: true,
  renderFootnotes: true,
  renderEndnotes: true,
  renderComments: false,
  renderAltChunks: true,
} as const;

function DocxRendererStyles() {
  return (
    <style>{`
      .ctxrun-docx-host {
        min-height: 100%;
      }

      .ctxrun-docx-wrapper {
        background: transparent;
        padding: 24px;
        padding-bottom: 24px;
      }

      .ctxrun-docx-wrapper > section.ctxrun-docx {
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.28);
      }
    `}</style>
  );
}

export function DocxRenderer({ meta }: { meta: FileMeta }) {
  const bodyContainerRef = useRef<HTMLDivElement | null>(null);
  const styleContainerRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const bodyContainer = bodyContainerRef.current;
    const styleContainer = styleContainerRef.current;

    if (!bodyContainer || !styleContainer) {
      return;
    }

    const abortController = new AbortController();
    let disposed = false;

    setLoading(true);
    setLoadError(null);
    bodyContainer.innerHTML = '';
    styleContainer.innerHTML = '';

    const load = async () => {
      try {
        const response = await fetch(buildPreviewUrl(meta.path), {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to load DOCX file (${response.status})`);
        }

        const buffer = await response.arrayBuffer();
        if (disposed) {
          return;
        }

        await renderAsync(buffer, bodyContainer, styleContainer, DOCX_RENDER_OPTIONS);
        if (disposed) {
          return;
        }

        setLoading(false);
      } catch (error) {
        if (
          disposed ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return;
        }

        setLoading(false);
        setLoadError(error instanceof Error ? error.message : String(error));
      }
    };

    void load();

    return () => {
      disposed = true;
      abortController.abort();
      bodyContainer.innerHTML = '';
      styleContainer.innerHTML = '';
    };
  }, [meta.path]);

  return (
    <div className="relative h-full w-full overflow-auto bg-card">
      <DocxRendererStyles />
      <div ref={styleContainerRef} aria-hidden="true" />

      {loading && !loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {loadError ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
          <FileQuestion size={24} />
          <div>
            <p className="text-sm font-semibold text-foreground">DOCX preview failed</p>
            <p className="mt-1 text-sm">{loadError}</p>
          </div>
        </div>
      ) : (
        <div ref={bodyContainerRef} className="ctxrun-docx-host min-h-full" />
      )}
    </div>
  );
}
