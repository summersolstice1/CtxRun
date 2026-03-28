import { FileMeta } from "@/types/hyperview";
import { FileQuestion } from "lucide-react";

export function BinaryRenderer({ meta }: { meta: FileMeta }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <FileQuestion size={48} className="opacity-50" />
      <div className="text-center">
        <h3 className="font-medium text-foreground">{meta.name}</h3>
        <p className="text-xs mt-1 font-mono">{meta.mime || 'application/octet-stream'}</p>
        <p className="text-xs mt-1">{formatSize(meta.size)}</p>
        <p className="mt-4 text-sm">Binary preview not supported yet.</p>
      </div>
    </div>
  );
}

function formatSize(bytes: number) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
