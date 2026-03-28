import { useState } from 'react';
import { FileQuestion, Loader2 } from 'lucide-react';

import { buildPreviewUrl } from '@/lib/previewUrl';
import type { FileMeta } from '@/types/hyperview';

export function HtmlRenderer({ meta }: { meta: FileMeta }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  return (
    <div className="relative h-full w-full bg-white">
      {loading && !loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}

      {loadError ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
          <FileQuestion size={24} />
          <div>
            <p className="text-sm font-semibold text-foreground">HTML preview failed</p>
            <p className="mt-1 text-sm">{loadError}</p>
          </div>
        </div>
      ) : (
        <iframe
          title={meta.name}
          src={buildPreviewUrl(meta.path)}
          className="h-full w-full border-0"
          sandbox="allow-same-origin"
          referrerPolicy="no-referrer"
          onLoad={() => {
            setLoading(false);
            setLoadError(null);
          }}
          onError={() => {
            setLoading(false);
            setLoadError(meta.mime || meta.name);
          }}
        />
      )}
    </div>
  );
}
