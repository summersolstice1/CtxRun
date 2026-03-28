import { FileMeta } from '@/types/hyperview';
import { buildPreviewUrl } from '@/lib/previewUrl';

export function PdfRenderer({ meta }: { meta: FileMeta }) {
  const src = buildPreviewUrl(meta.path);

  return (
    <iframe
      src={src}
      title={meta.name}
      className="h-full w-full border-0 bg-white"
    />
  );
}
