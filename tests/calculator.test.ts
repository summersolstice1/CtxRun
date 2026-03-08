import { describe, expect, it } from 'vitest';

import {
  evaluateMath,
  formatRefineryBufferThreshold,
  getCleanupThreshold,
} from '@/lib/calculator';

describe('calculator utils', () => {
  it('evaluateMath handles basic arithmetic', () => {
    expect(evaluateMath('=1 + 2 * 3')).toBe('7');
  });

  it('evaluateMath supports constants and functions', () => {
    expect(evaluateMath('sin(pi / 2)')).toBe('1');
    expect(evaluateMath('sqrt(9) + abs(-2)')).toBe('5');
  });

  it('evaluateMath normalizes tiny floating results to 0', () => {
    expect(evaluateMath('0.1 + 0.2 - 0.3')).toBe('0');
  });

  it('evaluateMath rejects disallowed input', () => {
    expect(evaluateMath('alert(1)')).toBeNull();
    expect(evaluateMath('1 + a$')).toBeNull();
  });

  it('evaluateMath returns null on invalid expressions', () => {
    expect(evaluateMath('1 +')).toBeNull();
  });

  it('getCleanupThreshold applies buffer percent and rounds up', () => {
    expect(getCleanupThreshold(100, 10)).toBe(110);
    expect(getCleanupThreshold(3, 10)).toBe(4);
  });

  it('formatRefineryBufferThreshold uses default 10 percent buffer', () => {
    expect(formatRefineryBufferThreshold(50)).toBe(55);
  });
});
