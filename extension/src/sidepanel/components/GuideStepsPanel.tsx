import React, { useEffect, useRef, useCallback } from 'react';
import { sendToBackground } from '@/shared/messages';
import type { GuideData, GuideStep } from '../App';

interface GuideStepsPanelProps {
  guide: GuideData;
  currentIndex: number;
  stepStatus?: string;
  onStop: () => void;
}

export default function GuideStepsPanel({
  guide,
  currentIndex,
  stepStatus,
  onStop,
}: GuideStepsPanelProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const imageCacheRef = useRef<Record<string, string>>({});

  // Scroll active into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector(
      '.guide-stepper-item.active, .guide-stepper-item.roadblock',
    );
    if (active) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentIndex, stepStatus]);

  const getDesiredState = useCallback(
    (idx: number) => {
      if (idx < currentIndex) return 'completed';
      if (idx === currentIndex) {
        const status = stepStatus || 'active';
        return status === 'roadblock' || status === 'notfound'
          ? 'roadblock'
          : 'active';
      }
      return 'future';
    },
    [currentIndex, stepStatus],
  );

  if (!guide.steps || guide.steps.length === 0) return null;

  return (
    <div className="guide-steps-panel" id="guideStepsPanel">
      <div className="guide-steps-header">
        <button
          className="guide-exit-btn"
          id="guideStepsClose"
          title="Exit guide"
          onClick={onStop}
        >
          &larr; Exit
        </button>
      </div>
      <div className="guide-steps-title" id="guideTitle">
        {guide.title || 'Interactive Guide'}
      </div>
      <div className="guide-steps-list" id="guideStepsList" ref={listRef}>
        {guide.steps.map((step, i) => (
          <GuideStepItem
            key={i}
            step={step}
            index={i}
            state={getDesiredState(i)}
            totalSteps={guide.steps.length}
            imageCacheRef={imageCacheRef}
          />
        ))}
      </div>
      <button
        className="guide-stop-btn"
        id="guideStopBtn"
        onClick={onStop}
      >
        Stop Guide
      </button>
    </div>
  );
}

interface GuideStepItemProps {
  step: GuideStep;
  index: number;
  state: 'completed' | 'active' | 'roadblock' | 'future';
  totalSteps: number;
  imageCacheRef: React.MutableRefObject<Record<string, string>>;
}

function GuideStepItem({
  step,
  index,
  state,
  totalSteps,
  imageCacheRef,
}: GuideStepItemProps) {
  const desc =
    step.title || step.description || step.action_type || `Step ${index + 1}`;
  const containerRef = useRef<HTMLDivElement>(null);

  const circleContent =
    state === 'completed' ? '\u2713' : state === 'roadblock' ? '\u26A0' : `${index + 1}`;

  const showDetail = state === 'active' || state === 'roadblock';

  return (
    <div
      className={`guide-stepper-item ${state}`}
      data-step-index={index}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        sendToBackground({ type: 'GUIDE_GO_TO_STEP', stepIndex: index });
      }}
    >
      <div className="guide-stepper-left">
        <div className={`guide-stepper-circle ${state}`}>{circleContent}</div>
        {index < totalSteps - 1 && <div className="guide-stepper-line" />}
      </div>
      <div className="guide-stepper-content">
        <div className="guide-stepper-instruction">{desc}</div>
        {showDetail && (
          <div className="guide-stepper-detail" style={{ display: '' }}>
            {state === 'roadblock' && (
              <div className="guide-stepper-roadblock-msg">
                We hit a roadblock. Try taking action on the screen to move
                forward.
              </div>
            )}
            {step.screenshot_url && (
              <GuideStepImage
                step={step}
                index={index}
                imageCacheRef={imageCacheRef}
              />
            )}
            {state === 'roadblock' && (
              <button
                className="guide-stepper-mark-complete"
                data-action="mark-complete"
                data-step-index={index}
                onClick={(e) => {
                  e.stopPropagation();
                  sendToBackground({
                    type: 'GUIDE_GO_TO_STEP',
                    stepIndex: index + 1,
                  });
                }}
              >
                &#x2713; Mark as complete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface GuideStepImageProps {
  step: GuideStep;
  index: number;
  imageCacheRef: React.MutableRefObject<Record<string, string>>;
}

function GuideStepImage({ step, index, imageCacheRef }: GuideStepImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!step.screenshot_url) {
      setLoading(false);
      setError('No screenshot');
      return;
    }

    // Check cache
    const cached = imageCacheRef.current[step.screenshot_url];
    if (cached) {
      setDataUrl(cached);
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await sendToBackground<any>({
          type: 'API_FETCH_BLOB',
          url: step.screenshot_url,
        });
        if (cancelled) return;
        if (result && result.dataUrl) {
          imageCacheRef.current[step.screenshot_url!] = result.dataUrl;
          setDataUrl(result.dataUrl);
        } else {
          setError(result?.error || 'no dataUrl in response');
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step.screenshot_url, imageCacheRef]);

  const hasClickMarker =
    step.screenshot_relative_position && step.screenshot_size;
  const clickMarkerStyle = hasClickMarker
    ? {
        left: `${(step.screenshot_relative_position!.x / step.screenshot_size!.width) * 100}%`,
        top: `${(step.screenshot_relative_position!.y / step.screenshot_size!.height) * 100}%`,
      }
    : undefined;

  return (
    <div
      className="guide-stepper-screenshot"
      data-step-index={index}
      ref={containerRef}
    >
      {loading && (
        <div style={{ padding: 8, color: '#9AA0A6', fontSize: 11 }}>
          Loading image...
        </div>
      )}
      {error && (
        <div style={{ padding: 8, color: '#EA4335', fontSize: 11 }}>
          {error}
        </div>
      )}
      {dataUrl && (
        <>
          <img
            className="step-screenshot"
            src={dataUrl}
            alt={`Step ${index + 1}`}
          />
          {hasClickMarker && (
            <div className="click-marker" style={clickMarkerStyle}>
              <div className="click-marker-pulse" />
              <div className="click-marker-ring" />
              <div className="click-marker-dot" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
