import { describe, expect, it, beforeEach } from 'vitest';

import { applyThemeToDocument } from '@/lib/theme';

describe('applyThemeToDocument', () => {
  beforeEach(() => {
    document.documentElement.className = 'light dark black extra-class';
  });

  it('applies black theme as dark + black classes', () => {
    applyThemeToDocument('black');
    const classList = document.documentElement.classList;

    expect(classList.contains('dark')).toBe(true);
    expect(classList.contains('black')).toBe(true);
    expect(classList.contains('light')).toBe(false);
    expect(classList.contains('extra-class')).toBe(true);
  });

  it('applies light theme and clears dark/black classes', () => {
    applyThemeToDocument('light');
    const classList = document.documentElement.classList;

    expect(classList.contains('light')).toBe(true);
    expect(classList.contains('dark')).toBe(false);
    expect(classList.contains('black')).toBe(false);
  });
});
