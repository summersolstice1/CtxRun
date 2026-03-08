import { describe, expect, it } from 'vitest';

import { getLanguageInfo, getLanguageMap, getMonacoLanguage } from '@/lib/langs';

describe('langs utils', () => {
  it('getLanguageInfo resolves known extension case-insensitively', () => {
    const info = getLanguageInfo('src/main.TS');
    expect(info).toEqual({
      name: 'TypeScript',
      color: 'bg-blue-500',
      monacoLanguage: 'typescript',
    });
  });

  it('getLanguageInfo returns unknown fallback for unsupported extension', () => {
    const info = getLanguageInfo('README.unknownext');
    expect(info).toEqual({
      name: 'Unknown',
      color: 'bg-gray-300',
      monacoLanguage: 'plaintext',
    });
  });

  it('getMonacoLanguage returns mapped and fallback values', () => {
    expect(getMonacoLanguage('a/b/c.rs')).toBe('rust');
    expect(getMonacoLanguage('a/b/c.nope')).toBe('plaintext');
  });

  it('getLanguageMap returns a copy to protect internal map', () => {
    const mapA = getLanguageMap();
    const mapB = getLanguageMap();

    mapA.ts = { name: 'Mutated', color: 'x', monacoLanguage: 'y' };
    expect(mapB.ts.name).toBe('TypeScript');
  });
});
