import { useEffect, useRef } from 'react';
import type { FindResult } from '../types';
import { getAdjustedRect } from '../element-finder';

interface HighlightProps {
  result: FindResult;
}

export function Highlight({ result }: HighlightProps) {
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    // Scroll element into view on first render
    try {
      (result.element as HTMLElement)?.scrollIntoView?.({
        block: 'center',
        inline: 'nearest',
        behavior: 'smooth',
      });
    } catch {}

    const update = () => {
      if (!result.element?.isConnected || !ref.current) return;
      const rect = getAdjustedRect(result);
      const pad = 4;
      const el = ref.current;
      el.style.left = `${rect.left - pad}px`;
      el.style.top = `${rect.top - pad}px`;
      el.style.width = `${rect.width + pad * 2}px`;
      el.style.height = `${rect.height + pad * 2}px`;
      el.style.display = 'block';
      frameRef.current = requestAnimationFrame(update);
    };

    frameRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameRef.current);
  }, [result]);

  return <div ref={ref} className="guide-highlight" />;
}
