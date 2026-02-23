import { streamChatCompletion } from '../chat';

jest.mock('@/lib/apiClient', () => ({
  apiClient: { get: jest.fn(), put: jest.fn() },
  getApiBaseUrl: () => 'http://localhost:8000/api/v1',
}));

describe('Chat streaming extra coverage', () => {
  afterEach(() => jest.restoreAllMocks());

  it('calls chat completions endpoint with stream true', async () => {
    const fetchMock = ((global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) },
    } as Response));

    await streamChatCompletion({ messages: [{ role: 'user', content: 'hi' }], stream: false }, jest.fn(), jest.fn(), jest.fn());

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/chat/completions',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.stream).toBe(true);
  });

  it('handles successful stream response shape', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) },
    } as Response);

    await streamChatCompletion({ messages: [{ role: 'user', content: 'x' }] }, jest.fn(), jest.fn(), jest.fn());
    expect((global as any).fetch).toHaveBeenCalled();
  });

  it('uses HTTP status when response text is empty', async () => {
    const onError = jest.fn();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => '' } as Response);

    await streamChatCompletion({ messages: [{ role: 'user', content: 'x' }] }, jest.fn(), jest.fn(), onError);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'HTTP 500' }));
  });

  it('forwards response text on failure', async () => {
    const onError = jest.fn();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad request' } as Response);

    await streamChatCompletion({ messages: [{ role: 'user', content: 'x' }] }, jest.fn(), jest.fn(), onError);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'bad request' }));
  });

  it('forwards unknown thrown values as Error', async () => {
    const onError = jest.fn();
    (global as any).fetch = jest.fn().mockRejectedValue('network-down');

    await streamChatCompletion({ messages: [{ role: 'user', content: 'x' }] }, jest.fn(), jest.fn(), onError);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('treats AbortError as done', async () => {
    const onDone = jest.fn();
    const onError = jest.fn();
    (global as any).fetch = jest.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));

    await streamChatCompletion({ messages: [{ role: 'user', content: 'x' }] }, jest.fn(), onDone, onError);
    expect(onDone).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
