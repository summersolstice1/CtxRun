import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: fetchMock,
}));

async function importFreshLlm() {
  vi.resetModules();
  return import('@/lib/llm');
}

describe('streamChatCompletionWithTools', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('retries without streaming when the provider reports stream is not implemented', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: {
          message: 'stream=true is not implemented for /v1/chat/completions yet',
          type: 'not_implemented',
        },
      }), {
        status: 501,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'fallback ok',
              reasoning_content: 'reasoned',
              tool_calls: [
                {
                  id: 'call_1',
                  function: {
                    name: 'shell_command',
                    arguments: '{"command":"dir"}',
                  },
                },
              ],
            },
          },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    const { streamChatCompletionWithTools } = await importFreshLlm();
    const onContentDelta = vi.fn();
    const onReasoningDelta = vi.fn();

    const result = await streamChatCompletionWithTools(
      [{ role: 'user', content: 'hello' }],
      {
        providerId: 'openai',
        apiKey: 'sk-local',
        baseUrl: 'http://127.0.0.1:8787/v1',
        modelId: 'gpt-5-3',
        temperature: 0.7,
      },
      {},
      {
        onContentDelta,
        onReasoningDelta,
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string).stream).toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body as string).stream).toBe(false);
    expect(result.content).toBe('fallback ok');
    expect(result.reasoning).toBe('reasoned');
    expect(result.toolCalls).toEqual([
      {
        id: 'call_1',
        name: 'shell_command',
        arguments: '{"command":"dir"}',
      },
    ]);
    expect(onContentDelta).toHaveBeenCalledWith('fallback ok');
    expect(onReasoningDelta).toHaveBeenCalledWith('reasoned');
  });

  it('does not retry when the error is unrelated to streaming', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      error: {
        message: 'invalid api key',
        type: 'authentication_error',
      },
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    }));

    const { streamChatCompletionWithTools } = await importFreshLlm();

    await expect(streamChatCompletionWithTools(
      [{ role: 'user', content: 'hello' }],
      {
        providerId: 'openai',
        apiKey: 'bad-key',
        baseUrl: 'http://127.0.0.1:8787/v1',
        modelId: 'gpt-5-3',
        temperature: 0.7,
      }
    )).rejects.toThrow('API Error 401');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
