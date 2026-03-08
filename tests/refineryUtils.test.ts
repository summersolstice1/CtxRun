import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatTimeAgo, parseMetadata } from '@/lib/refinery_utils';

describe('refinery utils', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-08T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('parseMetadata returns parsed object for valid json', () => {
    expect(parseMetadata('{"a":1,"b":"x"}')).toEqual({ a: 1, b: 'x' });
  });

  it('parseMetadata returns empty object for invalid json', () => {
    expect(parseMetadata('{bad')).toEqual({});
  });

  it('formatTimeAgo handles invalid and empty input', () => {
    expect(formatTimeAgo(null as unknown as number)).toBe('-');
    expect(formatTimeAgo('')).toBe('-');
    expect(formatTimeAgo('abc')).toBe('-');
    expect(formatTimeAgo(0)).toBe('-');
  });

  it('formatTimeAgo returns localized relative text for zh and en', () => {
    const now = Date.now();
    expect(formatTimeAgo(now - 30_000, 'zh')).toBe('刚刚');
    expect(formatTimeAgo(now - 2 * 60_000, 'en')).toBe('2m ago');
    expect(formatTimeAgo(now - 3 * 60 * 60_000, 'en')).toBe('3h ago');
  });

  it('formatTimeAgo treats second-based timestamp correctly', () => {
    const nowSec = Math.floor(Date.now() / 1000);
    expect(formatTimeAgo(nowSec - 120, 'zh')).toBe('2分钟前');
  });
});
