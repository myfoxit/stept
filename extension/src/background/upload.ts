import { STREAMING_CONCURRENCY } from '@/shared/constants';
import * as screenshotDB from '@/shared/storage';
import {
  state, debugLog, resetStreamingState,
  streamingSessionId, streamingUploaded, streamingQueue, streamingDraining,
  domSnapshotQueue,
  setStreamingSessionId, setStreamingDraining,
} from './state';
import { authedFetch } from './auth';
import { getApiBaseUrl } from './settings';

export { streamingSessionId } from './state';

export async function beginStreamingSession(): Promise<void> {
  if (!state.accessToken || !state.selectedProjectId) return;

  try {
    const API_BASE_URL = await getApiBaseUrl();
    const response = await authedFetch(
      `${API_BASE_URL}/process-recording/session/create`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          client: 'SteptChromeExtension',
          user_id: state.currentUser?.id,
          project_id: state.selectedProjectId,
        }),
      },
    );

    if (response.ok) {
      const data = await response.json();
      setStreamingSessionId(data.session_id || data.sessionId);
      debugLog('Streaming session created:', streamingSessionId);
    }
  } catch (e: any) {
    debugLog('Failed to create streaming session (will batch on upload):', e.message);
    setStreamingSessionId(null);
  }
}

export function enqueueStreamingUpload(stepNumber: number, dataUrl: string): void {
  if (!streamingSessionId || !dataUrl) return;
  streamingQueue.push({ stepNumber, dataUrl });
  drainStreamingQueue();
}

async function drainStreamingQueue(): Promise<void> {
  if (streamingDraining || !streamingSessionId) return;
  setStreamingDraining(true);

  const API_BASE_URL = await getApiBaseUrl();

  while (streamingQueue.length > 0) {
    const batch = streamingQueue.splice(0, STREAMING_CONCURRENCY);
    await Promise.all(batch.map(async ({ stepNumber, dataUrl }) => {
      try {
        let resolvedUrl = dataUrl;
        if (resolvedUrl.startsWith('idb:')) {
          const stepId = resolvedUrl.replace('idb:', '');
          resolvedUrl = await screenshotDB.getScreenshot(stepId).catch(() => null) as string;
          if (!resolvedUrl) return;
        }

        const blob = await dataUrlToBlob(resolvedUrl);
        const formData = new FormData();
        formData.append('file', blob, `step_${stepNumber}.jpg`);
        formData.append('stepNumber', stepNumber.toString());

        const response = await authedFetch(
          `${API_BASE_URL}/process-recording/session/${streamingSessionId}/image`,
          { method: 'POST', body: formData },
        );

        if (response.ok) {
          streamingUploaded.add(stepNumber);
          debugLog(`Streamed step ${stepNumber} (${streamingUploaded.size} done)`);
          chrome.runtime.sendMessage({
            type: 'UPLOAD_PROGRESS',
            uploaded: streamingUploaded.size,
            total: state.steps.length,
          }).catch(() => {});
        }
      } catch (e: any) {
        debugLog(`Stream upload failed for step ${stepNumber}:`, e.message);
      }
    }));
  }

  setStreamingDraining(false);
}

export function enqueueDomSnapshotUpload(stepNumber: number, snapshotJson: string): void {
  domSnapshotQueue.push({ stepNumber, snapshotJson });
  drainDomSnapshotQueue();
}

async function drainDomSnapshotQueue(): Promise<void> {
  if (domSnapshotQueue.length === 0) return;
  const API_BASE_URL = await getApiBaseUrl();

  while (domSnapshotQueue.length > 0) {
    const item = domSnapshotQueue.shift()!;
    const { stepNumber, snapshotJson } = item;
    try {
      const blob = new Blob([snapshotJson], { type: 'application/json' });
      const formData = new FormData();
      formData.append('file', blob, `step_${stepNumber}_dom.json`);
      formData.append('stepNumber', stepNumber.toString());

      await authedFetch(
        `${API_BASE_URL}/process-recording/session/${streamingSessionId}/dom-snapshot`,
        { method: 'POST', body: formData },
      );
      debugLog(`DOM snapshot uploaded for step ${stepNumber}`);
    } catch (e: any) {
      debugLog(`DOM snapshot upload failed for step ${stepNumber}:`, e.message);
    }
  }
}

export async function uploadCapture(): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  if (!state.accessToken || state.steps.length === 0) {
    return { success: false, error: 'No steps to upload or not authenticated' };
  }

  const API_BASE_URL = await getApiBaseUrl();

  try {
    let drainAttempts = 0;
    while (streamingDraining && drainAttempts < 50) {
      await new Promise((r) => setTimeout(r, 100));
      drainAttempts++;
    }

    let sessionId = streamingSessionId;
    if (!sessionId) {
      const sessionResponse = await authedFetch(
        `${API_BASE_URL}/process-recording/session/create`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            timestamp: new Date().toISOString(),
            client: 'SteptChromeExtension',
            user_id: state.currentUser?.id,
            project_id: state.selectedProjectId,
          }),
        },
      );

      if (!sessionResponse.ok) {
        throw new Error('Failed to create upload session');
      }

      const data = await sessionResponse.json();
      sessionId = data.session_id || data.sessionId;
    }

    const metadata = state.steps.map((s: any) => ({
      stepNumber: s.stepNumber,
      timestamp: s.timestamp,
      actionType: s.actionType,
      windowTitle: s.windowTitle,
      description: s.description,
      globalPosition: s.globalMousePosition,
      relativePosition: s.relativeMousePosition,
      windowSize: s.windowSize,
      screenshotRelativePosition: s.screenshotRelativeMousePosition,
      screenshotSize: s.screenshotSize,
      textTyped: s.textTyped,
      url: s.url,
      elementInfo: s.elementInfo,
    }));

    const metadataResponse = await authedFetch(
      `${API_BASE_URL}/process-recording/session/${sessionId}/metadata`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metadata),
      },
    );

    if (!metadataResponse.ok) {
      throw new Error('Failed to upload metadata');
    }

    for (const step of state.steps) {
      if (streamingUploaded.has(step.stepNumber)) continue;
      if (!step.screenshotDataUrl) continue;

      let dataUrl = step.screenshotDataUrl;
      if (dataUrl.startsWith('idb:')) {
        const stepId = dataUrl.replace('idb:', '');
        const fromIdb = await screenshotDB.getScreenshot(stepId).catch(() => null);
        if (!fromIdb) {
          debugLog(`Skipping step ${step.stepNumber}: screenshot not found in IDB`);
          continue;
        }
        dataUrl = fromIdb;
      }

      const blob = await dataUrlToBlob(dataUrl);
      const formData = new FormData();
      formData.append('file', blob, `step_${step.stepNumber}.jpg`);
      formData.append('stepNumber', step.stepNumber.toString());

      const imageResponse = await authedFetch(
        `${API_BASE_URL}/process-recording/session/${sessionId}/image`,
        { method: 'POST', body: formData },
      );

      if (!imageResponse.ok) {
        throw new Error(`Failed to upload image for step ${step.stepNumber}`);
      }
    }

    await authedFetch(
      `${API_BASE_URL}/process-recording/session/${sessionId}/finalize`,
      { method: 'POST' },
    );

    resetStreamingState();
    return { success: true, sessionId: sessionId! };
  } catch (error: any) {
    resetStreamingState();
    return { success: false, error: error.message };
  }
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}
