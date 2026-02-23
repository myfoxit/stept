import * as processingApi from '../processing';

jest.mock('@/lib/apiClient', () => {
  const mockRequest = jest.fn();
  return {
    request: mockRequest,
    getApiBaseUrl: () => 'http://localhost:8000/api/v1',
    apiClient: { request: jest.fn() },
  };
});

import { request } from '@/lib/apiClient';
const mockRequest = request as jest.MockedFunction<typeof request>;

describe('Processing API', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it.each([
    ['processRecording', () => processingApi.processRecording('rec-1'), { method: 'POST', url: '/process-recording/workflow/rec-1/process' }],
    ['generateGuide', () => processingApi.generateGuide('rec-1'), { method: 'POST', url: '/process-recording/workflow/rec-1/generate-guide' }],
    ['getGuide', () => processingApi.getGuide('rec-1'), { method: 'GET', url: '/process-recording/workflow/rec-1/guide' }],
    ['getAISummary', () => processingApi.getAISummary('rec-1'), { method: 'GET', url: '/process-recording/workflow/rec-1/ai-summary' }],
    ['annotateStep', () => processingApi.annotateStep('step-1'), { method: 'POST', url: '/process-recording/steps/step-1/annotate' }],
    ['improveStep', () => processingApi.improveStep('step-1'), { method: 'POST', url: '/process-recording/steps/step-1/improve' }],
  ] as const)('%s sends expected request', async (_name, fn, expected) => {
    mockRequest.mockResolvedValueOnce({} as any);
    await fn();
    expect(mockRequest).toHaveBeenCalledWith(expected);
  });

  it('smartSearch sends query/project/limit params', async () => {
    mockRequest.mockResolvedValueOnce({ total_results: 0, results: [] } as any);
    await processingApi.smartSearch('deploy', 'project-1', 10);
    expect(mockRequest).toHaveBeenCalledWith({ method: 'GET', url: '/search/search', params: { q: 'deploy', project_id: 'project-1', limit: 10 } });
  });

  it('smartSearch uses default limit=20', async () => {
    mockRequest.mockResolvedValueOnce({ total_results: 0, results: [] } as any);
    await processingApi.smartSearch('ai chat', 'project-2');
    expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({ params: expect.objectContaining({ limit: 20 }) }));
  });

  it('streamGuide calls streaming endpoint', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: { getReader: () => ({ read: async () => ({ done: true, value: undefined }) }) },
    } as Response);

    await processingApi.streamGuide('rec-77', jest.fn(), jest.fn(), jest.fn());

    expect((global as any).fetch).toHaveBeenCalledWith(
      'http://localhost:8000/api/v1/process-recording/workflow/rec-77/generate-guide/stream',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
  });

  it('streamGuide returns error with response text for non-ok responses', async () => {
    const onError = jest.fn();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' } as Response);
    await processingApi.streamGuide('rec-90', jest.fn(), jest.fn(), onError);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'unauthorized' }));
  });

  it('streamGuide handles missing response body', async () => {
    const onError = jest.fn();
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true, body: null } as Response);
    await processingApi.streamGuide('rec-91', jest.fn(), jest.fn(), onError);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'No response body' }));
  });

  it('streamGuide treats AbortError as done', async () => {
    const onDone = jest.fn();
    const onError = jest.fn();
    (global as any).fetch = jest.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
    await processingApi.streamGuide('rec-92', jest.fn(), onDone, onError);
    expect(onDone).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it.each([
    ['processRecording', async () => processingApi.processRecording('r-a')],
    ['generateGuide', async () => processingApi.generateGuide('r-b')],
    ['getGuide', async () => processingApi.getGuide('r-c')],
    ['getAISummary', async () => processingApi.getAISummary('r-d')],
    ['annotateStep', async () => processingApi.annotateStep('s-e')],
    ['improveStep', async () => processingApi.improveStep('s-f')],
  ] as const)('%s forwards request errors', async (_name, fn) => {
    mockRequest.mockRejectedValueOnce(new Error('boom'));
    await expect(fn()).rejects.toThrow('boom');
  });
});
