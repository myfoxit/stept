import { streamInlineAI } from '../inlineAI';

jest.mock('@/lib/apiClient', () => ({
  getApiBaseUrl: () => 'http://localhost:8000/api/v1',
}));

describe('Inline AI API', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls /chat/inline with POST and include credentials', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) },
    } as Response);

    await streamInlineAI({ command: 'write', prompt: 'hello' }, jest.fn(), jest.fn(), jest.fn());

    expect((global as any).fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/chat/inline',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('handles successful stream response shape', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) },
    } as Response);

    await streamInlineAI({ command: 'expand', context: 'Hi' }, jest.fn(), jest.fn(), jest.fn());
    expect((global as any).fetch).toHaveBeenCalled();
  });

  it('handles non-ok response with server text', async () => {
    const onError = jest.fn();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: async () => 'service unavailable' } as Response);

    await streamInlineAI({ command: 'summarize' }, jest.fn(), jest.fn(), onError);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'service unavailable' }));
  });

  it('handles missing response body', async () => {
    const onError = jest.fn();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, body: null } as Response);

    await streamInlineAI({ command: 'translate', language: 'de' }, jest.fn(), jest.fn(), onError);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'No response body' }));
  });

  it('treats AbortError as graceful completion', async () => {
    const onDone = jest.fn();
    const onError = jest.fn();
    (global as any).fetch = jest.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await streamInlineAI({ command: 'write' }, jest.fn(), onDone, onError);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it.each(['write', 'summarize', 'improve', 'expand', 'simplify', 'translate', 'explain'] as const)(
    'serializes command=%s request payload',
    async (command) => {
      const fetchMock = ((global as any).fetch = jest.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) },
      } as Response));

      await streamInlineAI({ command }, jest.fn(), jest.fn(), jest.fn());
      const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
      expect(body.command).toBe(command);
    },
  );
});
