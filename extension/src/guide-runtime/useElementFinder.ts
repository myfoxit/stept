import { useState, useEffect } from 'react';
import { ElementFinder } from './element-finder';
import type { GuideStep, FindResult } from './types';

const POLL_INTERVAL = 150;

export function useElementFinder(step: GuideStep | null, stepIndex: number): FindResult | null {
  const [result, setResult] = useState<FindResult | null>(null);

  useEffect(() => {
    if (!step) {
      setResult(null);
      return;
    }

    const poll = () => {
      const found = ElementFinder.find(step);
      setResult(found?.element ? found : null);
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [stepIndex]);

  return result;
}
