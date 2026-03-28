jest.mock('./settings', () => ({
  getApiBaseUrl: jest.fn().mockResolvedValue('https://api.test/api/v1'),
}));

jest.mock('./auth', () => ({
  authedFetch: jest.fn(),
}));

jest.mock('@/shared/storage', () => ({
  getScreenshot: jest.fn(),
}));

import * as screenshotDB from '@/shared/storage';
import { authedFetch } from './auth';
import {
  setStreamingDraining,
  setStreamingQueue,
  setStreamingSessionId,
  setStreamingUploaded,
  state,
} from './state';
import { beginStreamingSession, enqueueStreamingUpload, uploadCapture } from './upload';

describe('background/upload', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).chrome = {
      runtime: { sendMessage: jest.fn().mockResolvedValue(undefined) },
    };
    globalThis.fetch = jest.fn().mockImplementation(async (input: string) => {
      if (typeof input === 'string' && input.startsWith('data:')) {
        return new Response(new Blob(['img'], { type: 'image/jpeg' }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${String(input)}`);
    }) as any;
    state.accessToken = 'access';
    state.currentUser = { id: 'user_1' };
    state.selectedProjectId = 'proj_1';
    state.steps = [
      { stepNumber: 1, screenshotDataUrl: 'data:image/jpeg;base64,aaa', timestamp: 1, actionType: 'click' },
      { stepNumber: 2, screenshotDataUrl: 'idb:step_2', timestamp: 2, actionType: 'click' },
      { stepNumber: 3, screenshotDataUrl: null, timestamp: 3, actionType: 'noop' },
    ] as any;
    setStreamingSessionId(null);
    setStreamingUploaded(new Set());
    setStreamingQueue([]);
    setStreamingDraining(false);
  });

  it('creates a streaming session and stores its session id', async () => {
    jest.mocked(authedFetch).mockResolvedValueOnce(new Response(JSON.stringify({ session_id: 'sess_123' }), { status: 200 }));

    await beginStreamingSession();

    expect(authedFetch).toHaveBeenCalledWith(
      'https://api.test/api/v1/process-recording/session/create',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uploads queued streaming screenshots and reports progress', async () => {
    setStreamingSessionId('sess_stream');
    jest.mocked(authedFetch).mockResolvedValue(new Response('{}', { status: 200 }));

    enqueueStreamingUpload(1, 'data:image/jpeg;base64,aaa');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(authedFetch).toHaveBeenCalledWith(
      'https://api.test/api/v1/process-recording/session/sess_stream/image',
      expect.objectContaining({ method: 'POST' }),
    );
    expect((globalThis as any).chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'UPLOAD_PROGRESS',
      uploaded: 1,
      total: 3,
    });
  });

  it('finalizes upload using existing streamed state and idb-backed screenshots', async () => {
    setStreamingSessionId('sess_done');
    setStreamingUploaded(new Set([1]));
    jest.mocked(screenshotDB.getScreenshot).mockResolvedValue('data:image/jpeg;base64,bbb');
    jest.mocked(authedFetch)
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const result = await uploadCapture();

    expect(result).toEqual({ success: true, sessionId: 'sess_done' });
    expect(screenshotDB.getScreenshot).toHaveBeenCalledWith('step_2');
    expect(authedFetch).toHaveBeenNthCalledWith(1,
      'https://api.test/api/v1/process-recording/session/sess_done/metadata',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(authedFetch).toHaveBeenNthCalledWith(2,
      'https://api.test/api/v1/process-recording/session/sess_done/image',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(authedFetch).toHaveBeenNthCalledWith(3,
      'https://api.test/api/v1/process-recording/session/sess_done/finalize',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns a stable error when upload session creation fails', async () => {
    jest.mocked(authedFetch).mockResolvedValueOnce(new Response('nope', { status: 500 }));

    const result = await uploadCapture();

    expect(result).toEqual({ success: false, error: 'Failed to create upload session' });
  });
});
