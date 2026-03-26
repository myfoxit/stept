import { useEffect, useCallback, useSyncExternalStore } from 'react';
import { getState, subscribe, getCurrentStep } from './store';
import { useElementFinder } from './useElementFinder';
import { Highlight } from './components/Highlight';
import { Tooltip } from './components/Tooltip';

export function App() {
  const state = useSyncExternalStore(subscribe, getState);
  const step = getCurrentStep();
  // Tango's approach: element finding is gated by DOMAIN match, not URL path match.
  // The "paused" flag is for automation (auto-clicking), not for element finding.
  // Check if the current domain matches the step's expected domain.
  const domainMatches = !step?.expected_url || sameDomain(step.expected_url, location.href);
  const result = useElementFinder(
    state.status === 'active' && domainMatches ? step : null,
    state.currentIndex,
  );

  // Send health telemetry when element is found
  useEffect(() => {
    if (result?.element) {
      sendHealth(true, result.method, result.confidence);
    }
  }, [result?.element != null, state.currentIndex]);

  // Click detection: advance step when user clicks the target element
  useEffect(() => {
    if (!result?.element || state.status !== 'active') return;

    const currentStep = getCurrentStep();
    const action = String(currentStep?.action_type || '').toLowerCase();
    if (!action.includes('click') && !action.includes('select')) return;

    let done = false;
    const complete = () => {
      if (done) return;
      done = true;
      sendHealth(true, result.method, result.confidence);
      chrome.runtime.sendMessage({
        type: 'GUIDE_STEP_COMPLETED',
        sessionId: state.sessionId,
      }).catch(() => {});
    };

    const el = result.element;
    el.addEventListener('pointerdown', complete, { capture: true, once: true });
    el.addEventListener('click', complete, { capture: true, once: true });

    return () => {
      el.removeEventListener('pointerdown', complete, { capture: true } as EventListenerOptions);
      el.removeEventListener('click', complete, { capture: true } as EventListenerOptions);
    };
  }, [result?.element, state.status, state.currentIndex]);

  const handleDone = useCallback(() => {
    sendHealth(true, result?.method || 'manual-complete', result?.confidence || 0);
    chrome.runtime.sendMessage({
      type: 'GUIDE_STEP_COMPLETED',
      sessionId: getState().sessionId,
    }).catch(() => {});
  }, [result]);

  if (state.status !== 'active' || state.paused || !step || !result?.element) {
    return null;
  }

  return (
    <>
      <Highlight result={result} />
      <Tooltip step={step} result={result} onDone={handleDone} />
    </>
  );
}

function sameDomain(expectedUrl: string, currentUrl: string): boolean {
  try {
    const expected = new URL(expectedUrl);
    const current = new URL(currentUrl);
    // Extract registrable domain (e.g., "openai.com" from "platform.openai.com")
    const getDomain = (hostname: string) => {
      const parts = hostname.split('.');
      return parts.length >= 2 ? parts.slice(-2).join('.') : hostname;
    };
    return getDomain(expected.hostname) === getDomain(current.hostname);
  } catch {
    return true; // If URL parsing fails, don't block
  }
}

function sendHealth(elementFound: boolean, finderMethod: string, finderConfidence: number): void {
  const state = getState();
  const step = getCurrentStep();
  chrome.runtime.sendMessage({
    type: 'GUIDE_STEP_HEALTH',
    workflowId: state.guide?.workflow_id || state.guide?.workflowId || state.guide?.id,
    stepNumber: state.currentIndex + 1,
    elementFound,
    finderMethod,
    finderConfidence,
    expectedUrl: step?.expected_url,
    actualUrl: location.href,
    urlMatched: true,
    timestamp: Date.now(),
    sessionId: state.sessionId,
  }).catch(() => {});
}
