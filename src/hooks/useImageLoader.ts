import { useState, useEffect, useRef } from 'react';
import { readFile } from '@tauri-apps/plugin-fs';

export function useImageLoader(imagePath: string | null | undefined) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setImageUrl(null);
    setError(null);

    if (!imagePath) {
      return;
    }

    setIsLoading(true);

    readFile(imagePath)
      .then((bytes) => {
        let mimeType = 'image/png';
        const ext = imagePath.split('.').pop()?.toLowerCase();
        if (ext === 'jpg' || ext === 'jpeg') {
          mimeType = 'image/jpeg';
        } else if (ext === 'gif') {
          mimeType = 'image/gif';
        } else if (ext === 'webp') {
          mimeType = 'image/webp';
        } else if (ext === 'svg') {
          mimeType = 'image/svg+xml';
        } else if (ext === 'bmp') {
          mimeType = 'image/bmp';
        } else if (ext === 'ico') {
          mimeType = 'image/x-icon';
        }

        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setImageUrl(url);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load image:', err);
        setError(err instanceof Error ? err.message : 'Failed to load image');
        setIsLoading(false);
      });

    return () => {
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [imagePath]);

  return { imageUrl, isLoading, error };
}
