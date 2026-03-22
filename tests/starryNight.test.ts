import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createStarryNightMock, highlightMock, flagToScopeMock, toJsxRuntimeMock } = vi.hoisted(() => ({
  createStarryNightMock: vi.fn(),
  highlightMock: vi.fn(),
  flagToScopeMock: vi.fn(),
  toJsxRuntimeMock: vi.fn(() => 'jsx-tree'),
}));

vi.mock('@wooorm/starry-night', () => ({
  common: { mocked: true },
  createStarryNight: createStarryNightMock,
}));

vi.mock('hast-util-to-jsx-runtime', () => ({
  toJsxRuntime: toJsxRuntimeMock,
}));

type StarryNightModule = typeof import('@/lib/markdown/starryNight');

async function importFreshStarryNight(): Promise<StarryNightModule> {
  vi.resetModules();
  const mod = await import('@/lib/markdown/starryNight');
  return mod;
}

describe('starryNight helpers', () => {
  beforeEach(() => {
    createStarryNightMock.mockReset();
    highlightMock.mockReset();
    flagToScopeMock.mockReset();
    toJsxRuntimeMock.mockImplementation(() => 'jsx-tree');
  });

  it('caches highlighted trees and resolves language aliases', async () => {
    createStarryNightMock.mockResolvedValue({
      flagToScope: flagToScopeMock.mockImplementation((flag: string) =>
        flag === 'text' ? 'scope:text' : undefined
      ),
      highlight: highlightMock.mockReturnValue({ type: 'root' }),
    });

    const starryNight = await importFreshStarryNight();

    expect(starryNight.getCachedHighlightTree('plaintext', 'hello')).toBeUndefined();

    const first = await starryNight.highlightCodeTree('plaintext', 'hello');
    const second = await starryNight.highlightCodeTree('plaintext', 'hello');

    expect(first).toEqual({ type: 'root' });
    expect(second).toEqual({ type: 'root' });
    expect(createStarryNightMock).toHaveBeenCalledTimes(1);
    expect(highlightMock).toHaveBeenCalledWith('hello', 'scope:text');
    expect(starryNight.getCachedHighlightTree('plaintext', 'hello')).toEqual({ type: 'root' });
  });

  it('stores null when no scope can be resolved and renders trees to jsx', async () => {
    createStarryNightMock.mockResolvedValue({
      flagToScope: flagToScopeMock.mockReturnValue(undefined),
      highlight: highlightMock.mockReturnValue({ type: 'root' }),
    });

    const starryNight = await importFreshStarryNight();
    const result = await starryNight.highlightCodeTree('unknown', 'hello');

    expect(result).toBeNull();
    expect(highlightMock).not.toHaveBeenCalled();
    expect(starryNight.getCachedHighlightTree('unknown', 'hello')).toBeNull();
    expect(starryNight.renderHighlightTree({ type: 'root' } as any)).toBe('jsx-tree');
    expect(toJsxRuntimeMock).toHaveBeenCalled();
  });
});
