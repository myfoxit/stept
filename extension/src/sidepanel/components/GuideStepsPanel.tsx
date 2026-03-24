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
  const handleZoom = useCallback((dataUrl: string) => {
    sendToBackground({ type: 'GUIDE_SHOW_IMAGE', dataUrl } as any);
  }, []);

  // Scroll active into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector(
      '.guide-step.active, .guide-step.roadblock',
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
    <div className="guide-panel">
      <div className="guide-panel-header">
        <button className="guide-back-btn" onClick={onStop}>
          &larr; Exit
        </button>
      </div>

      <div className="guide-panel-title">
        {guide.title || 'Interactive Guide'}
      </div>

      <div className="guide-panel-steps" ref={listRef}>
        {guide.steps.map((step, i) => (
          <GuideStepItem
            key={i}
            step={step}
            index={i}
            state={getDesiredState(i)}
            totalSteps={guide.steps.length}
            imageCacheRef={imageCacheRef}
            onZoom={handleZoom}
          />
        ))}
      </div>

      <div className="guide-panel-footer">
        <button className="guide-pause-btn" onClick={onStop}>
          &#9208; Pause
        </button>
      </div>

    </div>
  );
}

interface GuideStepItemProps {
  step: GuideStep;
  index: number;
  state: 'completed' | 'active' | 'roadblock' | 'future';
  totalSteps: number;
  imageCacheRef: React.MutableRefObject<Record<string, string>>;
  onZoom: (url: string) => void;
}

function GuideStepItem({
  step,
  index,
  state,
  totalSteps,
  imageCacheRef,
  onZoom,
}: GuideStepItemProps) {
  const desc =
    step.title || step.description || step.action_type || `Step ${index + 1}`;

  const circleContent =
    state === 'completed' ? '\u2713' : `${index + 1}`;

  return (
    <div
      className={`guide-step ${state}`}
      data-step-index={index}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return;
        sendToBackground({ type: 'GUIDE_GO_TO_STEP', stepIndex: index });
      }}
    >
      <div className="guide-step-indicator">
        <div className={`guide-step-circle ${state}`}>{circleContent}</div>
        {index < totalSteps - 1 && <div className="guide-step-connector" />}
      </div>
      <div className="guide-step-body">
        <div className="guide-step-text">{desc}</div>

        {(state === 'active' || state === 'roadblock') && (
          <div className="guide-step-active-detail">
            {state === 'roadblock' ? (
              <p className="guide-step-prompt">
                We hit a roadblock. Try taking action on the screen to move forward.
              </p>
            ) : (
              <p className="guide-step-prompt">
                It's your move! Complete the action to keep moving forward.
              </p>
            )}

            {step.screenshot_url && (
              <GuideStepImage
                step={step}
                index={index}
                imageCacheRef={imageCacheRef}
                onZoom={onZoom}
              />
            )}

            <button
              className="guide-mark-complete-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (index + 1 >= totalSteps) {
                  sendToBackground({ type: 'STOP_GUIDE' });
                } else {
                  sendToBackground({
                    type: 'GUIDE_GO_TO_STEP',
                    stepIndex: index + 1,
                  });
                }
              }}
            >
              {index + 1 >= totalSteps ? '\u2713 Finish guide' : '\u2713 Mark as complete'}
            </button>
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
  onZoom: (url: string) => void;
}

function GuideStepImage({ step, index, imageCacheRef, onZoom }: GuideStepImageProps) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!step.screenshot_url) {
      setLoading(false);
      setError('No screenshot');
      return;
    }

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

  // Compute crop/zoom transform to center on click point
  const containerHeight = 190;
  let imgStyle: React.CSSProperties = { width: '100%', display: 'block' };
  if (hasClickMarker) {
    const imgW = step.screenshot_size!.width;
    const imgH = step.screenshot_size!.height;
    const clickX = step.screenshot_relative_position!.x;
    const clickY = step.screenshot_relative_position!.y;
    // Scale to zoom ~2x into a region around the click point
    const scale = 2;
    const originX = (clickX / imgW) * 100;
    const originY = (clickY / imgH) * 100;
    imgStyle = {
      width: '100%',
      display: 'block',
      transform: `scale(${scale})`,
      transformOrigin: `${originX}% ${originY}%`,
    };
  }

  return (
    <div
      className="guide-step-screenshot"
      style={hasClickMarker ? { height: containerHeight, overflow: 'hidden' } : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (dataUrl) onZoom(dataUrl);
      }}
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
          <img src={dataUrl} alt={`Step ${index + 1}`} style={imgStyle} />
        </>
      )}
    </div>
  );
}
