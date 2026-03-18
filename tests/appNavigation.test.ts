import { describe, expect, it } from 'vitest';
import {
  APP_NAVIGATION_ITEMS,
  isEditableTarget,
} from '@/lib/app-navigation';

describe('app navigation helpers', () => {
  it('keeps the radial module order stable', () => {
    expect(APP_NAVIGATION_ITEMS.map((item) => item.id)).toEqual([
      'prompts',
      'context',
      'patch',
      'refinery',
      'automator',
      'miner',
    ]);
  });

  it('skips editable targets when deciding whether to handle shortcuts', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const plain = document.createElement('div');

    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(plain)).toBe(false);
  });
});
