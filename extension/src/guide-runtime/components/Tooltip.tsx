import { useEffect, useRef } from 'react';
import type { GuideStep, FindResult } from '../types';
import { getAdjustedRect } from '../element-finder';

interface TooltipProps {
  step: GuideStep;
  result: FindResult;
  onDone: () => void;
}

export function Tooltip({ step, result, onDone }: TooltipProps) {
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const position = () => {
      if (!result.element?.isConnected || !ref.current) return;
      const rect = getAdjustedRect(result);
      const bounds = ref.current.getBoundingClientRect();
      const gap = 12;
      let top = rect.bottom + gap;
      if (top + bounds.height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - bounds.height - gap);
      }
      let left = Math.min(Math.max(8, rect.left), window.innerWidth - bounds.width - 8);
      if (left < 8) left = 8;
      ref.current.style.top = `${top}px`;
      ref.current.style.left = `${left}px`;
      ref.current.style.display = 'flex';
      frameRef.current = requestAnimationFrame(position);
    };

    frameRef.current = requestAnimationFrame(position);
    return () => cancelAnimationFrame(frameRef.current);
  }, [result]);

  const title = step.title || `Step ${step.step_number || ''}`.trim() || 'Step';
  const description = step.description || step.title || 'Follow this step';

  return (
    <div ref={ref} className="guide-tooltip">
      <span className="guide-dot" />
      <div className="guide-text">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <button
        className="guide-done"
        type="button"
        onClick={(e) => { e.stopPropagation(); onDone(); }}
      >
        &#x2713;
      </button>
    </div>
  );
}
