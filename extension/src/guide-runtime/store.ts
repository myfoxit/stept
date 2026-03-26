import type { Guide, GuideStep } from './types';

export interface GuideRuntimeState {
  guide: Guide | null;
  currentIndex: number;
  paused: boolean;
  sessionId: string | null;
  status: 'idle' | 'active' | 'stopped';
}

let state: GuideRuntimeState = {
  guide: null,
  currentIndex: 0,
  paused: false,
  sessionId: null,
  status: 'idle',
};

const listeners = new Set<() => void>();

export function getState(): GuideRuntimeState {
  return state;
}

export function setState(update: Partial<GuideRuntimeState>): void {
  state = { ...state, ...update };
  listeners.forEach((fn) => fn());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getCurrentStep(): GuideStep | null {
  if (!state.guide?.steps) return null;
  return state.guide.steps[state.currentIndex] || null;
}
