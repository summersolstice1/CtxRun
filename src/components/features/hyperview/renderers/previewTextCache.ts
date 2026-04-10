const DEFAULT_MAX_ENTRIES = 50;
const DEFAULT_MAX_CHARS = 2_000_000;

export interface StringLruCache {
  get: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  clear: () => void;
}

export function createStringLruCache(
  maxEntries = DEFAULT_MAX_ENTRIES,
  maxChars = DEFAULT_MAX_CHARS,
): StringLruCache {
  const entries = new Map<string, string>();
  let totalChars = 0;

  const trim = () => {
    while (entries.size > maxEntries || totalChars > maxChars) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }

      const oldestValue = entries.get(oldestKey);
      entries.delete(oldestKey);
      if (oldestValue !== undefined) {
        totalChars -= oldestValue.length;
      }
    }
  };

  return {
    get(key) {
      const value = entries.get(key);
      if (value === undefined) {
        return undefined;
      }

      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key, value) {
      const existing = entries.get(key);
      if (existing !== undefined) {
        totalChars -= existing.length;
        entries.delete(key);
      }

      entries.set(key, value);
      totalChars += value.length;
      trim();
    },
    clear() {
      entries.clear();
      totalChars = 0;
    },
  };
}
