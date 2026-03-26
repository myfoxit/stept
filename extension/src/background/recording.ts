import { MAX_STEPS } from '@/shared/constants';
import * as screenshotDB from '@/shared/storage';
import {
  state, debugLog, persistRecordingState, persistSteps,
  clearPersistedSteps, resetStreamingState, markUserAction,
  pendingPreCapture, preCapturePromise, PRE_CAPTURE_MAX_AGE_MS,
  setPendingPreCapture, setPreCapturePromise,
} from './state';
import { beginStreamingSession, enqueueStreamingUpload, enqueueDomSnapshotUpload, streamingSessionId } from './upload';

export async function ensureContentScript(tabId: number): Promise<boolean> {
  try {
    const response = await chrome.tabs
      .sendMessage(tabId, { type: 'PING' })
      .catch(() => null);
    if (response && (response as any).alive) return true;
  } catch (e) {
    // No content script, need to inject
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['vendor/rrweb-snapshot.min.js', 'redaction.js', 'content.js'],
    });
    await new Promise((r) => setTimeout(r, 50));
    return true;
  } catch (e) {
    debugLog('Failed to inject content script into tab', tabId, e);
    return false;
  }
}

export function startRecording(projectId: string): void {
  state.isRecording = true;
  state.isPaused = false;
  state.selectedProjectId = projectId;
  state.steps = [];
  state.stepCounter = 0;
  state.recordingStartTime = Date.now();

  chrome.storage.local.set({ selectedProjectId: projectId });
  persistRecordingState();
  clearPersistedSteps();
  resetStreamingState();

  beginStreamingSession();

  chrome.tabs.query({}, async (tabs) => {
    for (const tab of tabs) {
      if (
        tab.id &&
        tab.url &&
        (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
      ) {
        const injected = await ensureContentScript(tab.id);
        if (injected) {
          chrome.tabs
            .sendMessage(tab.id, { type: 'START_RECORDING' })
            .catch(() => {});
        }
      }
    }
  });

  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#3ab08a' });

  chrome.storage.local.get(['displayMode'], (result) => {
    const mode = result.displayMode || 'sidepanel';
    if (mode === 'sidepanel') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.sidePanel.open({ tabId: tabs[0].id }).catch(() => {});
        }
      });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]?.id) {
          await ensureContentScript(tabs[0].id);
          chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_DOCK' }).catch(() => {});
        }
      });
    }
  });
}

export function stopRecording(): void {
  state.isRecording = false;
  state.isPaused = false;
  persistRecordingState();

  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (
        tab.id &&
        tab.url &&
        (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
      ) {
        chrome.tabs.sendMessage(tab.id, { type: 'STOP_RECORDING' }).catch(() => {});
        chrome.tabs.sendMessage(tab.id, { type: 'HIDE_DOCK' }).catch(() => {});
        chrome.tabs.sendMessage(tab.id, { type: 'CLOSE_SMART_BLUR' }).catch(() => {});
        chrome.tabs.sendMessage(tab.id, { type: 'REMOVE_REDACTION' }).catch(() => {});
      }
    });
  });

  chrome.action.setBadgeText({ text: '' });
}

export function pauseRecording(): void {
  state.isPaused = true;
  persistRecordingState();
  chrome.action.setBadgeText({ text: 'II' });
  chrome.action.setBadgeBackgroundColor({ color: '#F59E0B' });

  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        chrome.tabs.sendMessage(tab.id, { type: 'PAUSE_RECORDING' }).catch(() => {});
      }
    });
  });
}

export function resumeRecording(): void {
  state.isPaused = false;
  chrome.action.setBadgeText({ text: 'REC' });
  chrome.action.setBadgeBackgroundColor({ color: '#3ab08a' });

  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (
        tab.id &&
        tab.url &&
        (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
      ) {
        chrome.tabs.sendMessage(tab.id, { type: 'RESUME_RECORDING' }).catch(() => {});
      }
    });
  });
}

export async function captureScreenshotRaw(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.tabs.captureVisibleTab(
      null as unknown as number,
      { format: 'jpeg', quality: 70 },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          debugLog('Screenshot capture failed:', chrome.runtime.lastError.message);
          resolve(null);
          return;
        }
        resolve(dataUrl);
      },
    );
  });
}

export async function captureScreenshot(): Promise<string | null> {
  const activeTab: any = await new Promise((r) =>
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => r(tabs[0])),
  );
  if (activeTab?.id) {
    await chrome.tabs.sendMessage(activeTab.id, { type: 'HIDE_DOCK_TEMP' }).catch(() => {});
    await new Promise((r) => setTimeout(r, 50));
  }

  const screenshot = await captureScreenshotRaw();

  if (activeTab?.id) {
    await chrome.tabs.sendMessage(activeTab.id, { type: 'SHOW_DOCK_TEMP' }).catch(() => {});
  }

  return screenshot;
}

export async function drawClickMarker(
  screenshotDataUrl: string,
  clickPos: { x: number; y: number },
  viewportSize: { width: number; height: number },
): Promise<string> {
  try {
    const response = await fetch(screenshotDataUrl);
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob);

    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);

    const scaleX = bitmap.width / viewportSize.width;
    const scaleY = bitmap.height / viewportSize.height;
    const x = clickPos.x * scaleX;
    const y = clickPos.y * scaleY;

    const radius = 16 * scaleX;

    // Outer glow
    ctx.beginPath();
    ctx.arc(x, y, radius + 8 * scaleX, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
    ctx.fill();

    // Outer ring
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
    ctx.fill();
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2 * scaleX;
    ctx.stroke();

    // Inner dot
    ctx.beginPath();
    ctx.arc(x, y, 4 * scaleX, 0, Math.PI * 2);
    ctx.fillStyle = '#22c55e';
    ctx.fill();

    const resultBlob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality: 0.7,
    });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(resultBlob);
    });
  } catch (e) {
    debugLog('Failed to draw click marker:', e);
    return screenshotDataUrl;
  }
}

export async function addStep(stepData: any): Promise<void> {
  if (!state.isRecording || state.isPaused) return;

  if (state.steps.length >= MAX_STEPS) {
    debugLog(`Max steps (${MAX_STEPS}) reached, ignoring new step`);
    chrome.runtime.sendMessage({
      type: 'MAX_STEPS_REACHED',
      limit: MAX_STEPS,
    }).catch(() => {});
    return;
  }

  state.stepCounter++;

  let screenshot: string | null = null;
  const isClickAction = stepData.actionType && stepData.actionType.includes('Click');
  const isTypeWithScreenshot = stepData._typeScreenshot;

  // Use pre-captured type screenshot if available
  if (isTypeWithScreenshot) {
    screenshot = stepData._typeScreenshot;
    delete stepData._typeScreenshot;
  } else if (isClickAction) {
    if (preCapturePromise) {
      debugLog('Waiting for in-flight pre-capture to complete...');
      await preCapturePromise;
      setPreCapturePromise(null);
    }

    if (pendingPreCapture && (Date.now() - pendingPreCapture.timestamp) < PRE_CAPTURE_MAX_AGE_MS) {
      screenshot = pendingPreCapture.dataUrl;
      setPendingPreCapture(null);
      debugLog('Using pre-captured screenshot (taken at pointerdown)');
    } else {
      setPendingPreCapture(null);
      debugLog('Pre-capture unavailable, falling back to post-click capture');
      try {
        screenshot = await captureScreenshot();
      } catch (e) {
        debugLog('Screenshot capture threw:', e);
        screenshot = null;
      }
    }
    if (!screenshot) {
      chrome.runtime.sendMessage({
        type: 'SCREENSHOT_FAILED',
        stepNumber: state.stepCounter,
      }).catch(() => {});
    }
  }

  if (screenshot && isClickAction && stepData.clickPosition && stepData.viewportSize) {
    try {
      screenshot = await drawClickMarker(screenshot, stepData.clickPosition, stepData.viewportSize);
    } catch (e) {
      debugLog('Click marker drawing failed:', e);
    }
  }

  const step = {
    stepNumber: state.stepCounter,
    timestamp: new Date().toISOString(),
    actionType: stepData.actionType,
    windowTitle: stepData.pageTitle,
    description: stepData.description,
    screenshotDataUrl: screenshot,
    globalMousePosition: stepData.globalPosition,
    relativeMousePosition: stepData.relativePosition,
    windowSize: stepData.windowSize,
    screenshotRelativeMousePosition: stepData.clickPosition,
    screenshotSize: stepData.viewportSize,
    textTyped: stepData.textTyped,
    url: stepData.url,
    elementInfo: stepData.elementInfo,
  };

  state.steps.push(step);
  debugLog('Step added:', step.stepNumber, step.actionType);

  persistSteps();

  if (screenshot) {
    enqueueStreamingUpload(step.stepNumber, step.screenshotDataUrl || screenshot);
  }

  chrome.runtime.sendMessage({ type: 'STEP_ADDED', step: step }).catch(() => {});

  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        chrome.tabs.sendMessage(tab.id, { type: 'STEP_ADDED', step: step }).catch(() => {});
      }
    });
  });
}

export function deleteStep(stepNumber: number): void {
  screenshotDB.deleteScreenshot(`step_${stepNumber}`).catch(() => {});
  state.steps = state.steps.filter((s: any) => s.stepNumber !== stepNumber);
  state.steps.forEach((step: any, index: number) => {
    step.stepNumber = index + 1;
  });
  state.stepCounter = state.steps.length;
  persistSteps();
}
