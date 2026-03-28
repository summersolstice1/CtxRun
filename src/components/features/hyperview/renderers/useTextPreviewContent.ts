import { useEffect, useState } from 'react';
import { readTextFile } from '@tauri-apps/plugin-fs';

import type { FileMeta } from '@/types/hyperview';

const textPreviewCache = new Map<string, string>();

interface UseTextPreviewContentOptions {
  enabled?: boolean;
  maxBytes: number;
  fallbackContent: string;
}

export function useTextPreviewContent(meta: FileMeta, options: UseTextPreviewContentOptions) {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (options.enabled === false) {
      setContent('');
      setLoading(false);
      return;
    }

    const cacheKey = `${meta.path}:${meta.size}`;
    const cached = textPreviewCache.get(cacheKey);
    if (cached !== undefined) {
      setContent(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const load = async () => {
      try {
        const text =
          meta.size > options.maxBytes ? options.fallbackContent : await readTextFile(meta.path);
        textPreviewCache.set(cacheKey, text);
        if (!cancelled) {
          setContent(text);
        }
      } catch (error) {
        if (!cancelled) {
          setContent(String(error));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [meta.path, meta.size, options.enabled, options.fallbackContent, options.maxBytes]);

  return { content, loading };
}
