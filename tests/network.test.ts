import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: fetchMock,
}));

type NetworkModule = typeof import('@/lib/network');

async function importFreshNetwork(): Promise<NetworkModule> {
  vi.resetModules();
  return import('@/lib/network');
}

describe('fetchFromMirrors', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns first successful mirror result when others fail', async () => {
    const { fetchFromMirrors } = await importFreshNetwork();

    fetchMock
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ value: 42 }),
      });

    const result = await fetchFromMirrors<{ value: number }>(
      ['https://a.example/', 'https://b.example/'],
      { path: 'data.json' }
    );

    expect(result).toEqual({
      data: { value: 42 },
      sourceUrl: 'https://b.example/',
    });
  });

  it('supports text response mode and cache bust query parameter', async () => {
    const { fetchFromMirrors } = await importFreshNetwork();
    vi.spyOn(Date, 'now').mockReturnValue(123456);

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => 'hello',
    });

    const result = await fetchFromMirrors<string>(['https://mirror.example/base'], {
      path: '/path/file.txt',
      responseType: 'text',
      cacheBust: true,
    });

    expect(result.data).toBe('hello');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://mirror.example/base/path/file.txt?t=123456'),
      expect.objectContaining({ method: 'GET', connectTimeout: 8000 })
    );
  });

  it('skips invalid mirror content via validate callback and falls back', async () => {
    const { fetchFromMirrors } = await importFreshNetwork();

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      });

    const result = await fetchFromMirrors<{ ok: boolean }>(
      ['https://a.example', 'https://b.example'],
      {
        path: 'x.json',
        validate: (x) => x.ok,
      }
    );

    expect(result.data).toEqual({ ok: true });
    expect(result.sourceUrl).toBe('https://b.example/');
  });

  it('throws generic error when all mirrors fail', async () => {
    const { fetchFromMirrors } = await importFreshNetwork();

    fetchMock
      .mockRejectedValueOnce(new Error('bad 1'))
      .mockRejectedValueOnce(new Error('bad 2'));

    await expect(
      fetchFromMirrors(['https://a.example', 'https://b.example'], { path: 'x.json' })
    ).rejects.toThrow('Failed to fetch resource from any available mirror.');
  });
});
