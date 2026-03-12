import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: fetchMock,
}));

type LlmModule = typeof import('@/lib/llm');

async function importFreshLlm(): Promise<LlmModule> {
  vi.resetModules();
  return import('@/lib/llm');
}

const TEST_CONFIG = {
  providerId: 'test',
  apiKey: 'key',
  baseUrl: 'https://example.com/v1',
  modelId: 'test-model',
  temperature: 0,
};

describe('llm normalization', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('preserves text part boundaries without injecting extra blank lines', async () => {
    const { createChatCompletion } = await importFreshLlm();

    fetchMock.mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  { text: '| A | B |\n' },
                  { text: '| --- | --- |\n' },
                  { text: '| 1 | 2 |' },
                ],
              },
            },
          ],
        }),
    });

    const result = await createChatCompletion([], TEST_CONFIG);

    expect(result.content).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |');
  });
});
