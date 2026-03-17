import type { BuildConfig } from './types';

export const BUILD_CONFIG: BuildConfig = {
  mode: (import.meta.env.BUILD_MODE as 'self-hosted' | 'cloud') || 'self-hosted',
  cloudApiUrl: 'https://app.stept.ai/api/v1',
  defaultApiUrl: 'http://localhost:8000/api/v1',
};

export const DEFAULT_API_BASE_URL =
  BUILD_CONFIG.mode === 'cloud'
    ? BUILD_CONFIG.cloudApiUrl
    : BUILD_CONFIG.defaultApiUrl;

export const MAX_STEPS = 100;
export const DEBUG = false;
export const DOUBLE_CLICK_MS = 400;
export const TYPING_DELAY = 1500;
export const STREAMING_CONCURRENCY = 2;
export const NAVIGATION_SUPPRESS_WINDOW = 5000;
