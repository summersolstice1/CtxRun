import { describe, expect, it } from 'vitest';

import { bundleItems } from '@/lib/bundler';
import { RefineryItemUI, RefineryKind } from '@/types/refinery';

function makeItem(
  id: string,
  updatedAt: number,
  sourceApp: string,
  kind: RefineryKind = 'text',
  overrides: Partial<RefineryItemUI> = {}
): RefineryItemUI {
  return {
    id,
    kind,
    content: `content-${id}`,
    contentHash: `hash-${id}`,
    preview: `preview-${id}`,
    sourceApp,
    url: null as unknown as string,
    sizeInfo: '1 KB',
    isPinned: false,
    metaParsed: {},
    createdAt: updatedAt - 10,
    updatedAt,
    title: null,
    tags: null,
    isManual: false,
    isEdited: false,
    ...overrides,
  };
}

describe('bundleItems', () => {
  it('returns empty list for empty input', () => {
    expect(bundleItems([])).toEqual([]);
  });

  it('bundles adjacent items with same source/kind within threshold', () => {
    const items = [
      makeItem('a', 10_000, 'VSCode'),
      makeItem('b', 9_000, 'VSCode'),
      makeItem('c', 8_500, 'VSCode'),
    ];

    const result = bundleItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('bundle');
    if (result[0].type === 'bundle') {
      expect(result[0].items.map((x) => x.id)).toEqual(['a', 'b', 'c']);
      expect(result[0].sourceApp).toBe('VSCode');
      expect(result[0].timestamp).toBe(10_000);
    }
  });

  it('splits bundle when source, kind or time window changes', () => {
    const items = [
      makeItem('a', 20_000, 'VSCode', 'text'),
      makeItem('b', 19_500, 'VSCode', 'image'),
      makeItem('c', 10_000, 'VSCode', 'text'),
      makeItem('d', 9_500, 'Chrome', 'text'),
    ];

    const result = bundleItems(items);
    expect(result.map((x) => x.type)).toEqual(['single', 'single', 'single', 'single']);
  });

  it('keeps pinned/manual items as singles and flushes current bundle', () => {
    const items = [
      makeItem('a', 10_000, 'VSCode'),
      makeItem('b', 9_500, 'VSCode'),
      makeItem('pin', 9_000, 'VSCode', 'text', { isPinned: true }),
      makeItem('m', 8_500, 'VSCode', 'text', { isManual: true }),
    ];

    const result = bundleItems(items);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('bundle');
    expect(result[1].type).toBe('single');
    expect(result[2].type).toBe('single');
    if (result[1].type === 'single') expect(result[1].item.id).toBe('pin');
    if (result[2].type === 'single') expect(result[2].item.id).toBe('m');
  });
});
