import { describe, expect, it } from 'vitest';
import {
  APP_NAVIGATION_ITEMS,
  getAdjacentPrimaryView,
  getPrimaryViewByHotkey,
  isEditableTarget,
} from '@/lib/app-navigation';

describe('app navigation helpers', () => {
  it('cycles primary views in both directions', () => {
    expect(getAdjacentPrimaryView('prompts', -1)).toBe('miner');
    expect(getAdjacentPrimaryView('miner', 1)).toBe('prompts');
    expect(getAdjacentPrimaryView('patch', 2)).toBe('automator');
  });

  it('maps configured hotkeys to views', () => {
    for (const item of APP_NAVIGATION_ITEMS) {
      expect(getPrimaryViewByHotkey(item.hotkey)).toBe(item.id);
    }

    expect(getPrimaryViewByHotkey(9)).toBeNull();
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
