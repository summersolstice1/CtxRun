import { useState, useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { fetchFromMirrors, REPOSITORY_MIRROR_BASES } from '@/lib/network';
import { useTranslation } from 'react-i18next';

const memoryCache: Record<string, string> = {};

export function useUsageGuide() {
  const { t } = useTranslation();
  const { language } = useAppStore();
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const filename = language === 'zh' ? 'USAGE.md' : 'USAGE_EN.md';

    if (memoryCache[filename]) {
      setContent(memoryCache[filename]);
      return;
    }

    const fetchDoc = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchFromMirrors<string>(REPOSITORY_MIRROR_BASES, {
          path: filename,
          responseType: 'text',
          cacheBust: false
        });

        const text = result.data;
        memoryCache[filename] = text;
        setContent(text);
      } catch (err) {
        console.error("Failed to load usage guide:", err);
        setError(t('settings.usageLoadFailed'));
      } finally {
        setIsLoading(false);
      }
    };

    fetchDoc();
  }, [language]);

  return { content, isLoading, error };
}
