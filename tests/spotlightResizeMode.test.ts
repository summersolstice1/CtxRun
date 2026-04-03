import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPOTLIGHT_APPEARANCE,
  SPOTLIGHT_RESIZE_FAST_STEP,
  SPOTLIGHT_RESIZE_STEP,
  applyResizeDelta,
  getSpotlightWindowHeight,
  normalizeSpotlightAppearance,
} from '@/windows/spotlight/resizeMode';

describe('spotlight resize helpers', () => {
  it('normalizes spotlight appearance within supported limits', () => {
    expect(
      normalizeSpotlightAppearance({
        width: 1200,
        defaultHeight: 860,
        maxChatHeight: 200,
      }),
    ).toEqual({
      width: 1000,
      defaultHeight: 800,
      maxChatHeight: 800,
    });
  });

  it('uses default height outside chat with messages', () => {
    const appearance = {
      width: 640,
      defaultHeight: 420,
      maxChatHeight: 700,
    };

    expect(getSpotlightWindowHeight(appearance, 'search', true)).toBe(420);
    expect(getSpotlightWindowHeight(appearance, 'clipboard', true)).toBe(420);
    expect(getSpotlightWindowHeight(appearance, 'chat', false)).toBe(420);
    expect(getSpotlightWindowHeight(appearance, 'chat', true)).toBe(700);
  });

  it('adjusts the active axis and target height for resize mode', () => {
    expect(
      applyResizeDelta(
        DEFAULT_SPOTLIGHT_APPEARANCE,
        'right',
        'search',
        false,
        SPOTLIGHT_RESIZE_STEP,
      ),
    ).toEqual({
      width: 660,
      defaultHeight: 400,
      maxChatHeight: 600,
    });

    expect(
      applyResizeDelta(
        DEFAULT_SPOTLIGHT_APPEARANCE,
        'down',
        'chat',
        true,
        SPOTLIGHT_RESIZE_FAST_STEP,
      ),
    ).toEqual({
      width: 640,
      defaultHeight: 400,
      maxChatHeight: 660,
    });
  });
});
