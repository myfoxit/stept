import * as path from 'path';

export function assertString(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
}

export function assertOptionalString(value: unknown, name: string): asserts value is string | undefined {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new Error(`${name} must be a string`);
  }
}

export function assertBoolean(value: unknown, name: string): asserts value is boolean {
  if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean`);
}

export function assertNumber(value: unknown, name: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number`);
  }
}

export function assertObject(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be a non-null object`);
  }
}

export function assertArray(value: unknown, name: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array`);
}

export function validateCaptureArea(area: unknown): void {
  assertObject(area, 'captureArea');
  const a = area as Record<string, unknown>;
  if (!['all-displays', 'single-display', 'window'].includes(a.type as string)) {
    throw new Error('captureArea.type must be all-displays, single-display, or window');
  }
  if (a.displayId !== undefined) assertString(a.displayId, 'captureArea.displayId');
  if (a.displayName !== undefined) assertString(a.displayName, 'captureArea.displayName');
  if (a.windowHandle !== undefined) assertNumber(a.windowHandle, 'captureArea.windowHandle');
  if (a.windowTitle !== undefined) assertString(a.windowTitle, 'captureArea.windowTitle');
  if (a.bounds !== undefined) validateBounds(a.bounds);
}

export function validateBounds(bounds: unknown): void {
  assertObject(bounds, 'bounds');
  const b = bounds as Record<string, unknown>;
  assertNumber(b.x, 'bounds.x');
  assertNumber(b.y, 'bounds.y');
  assertNumber(b.width, 'bounds.width');
  assertNumber(b.height, 'bounds.height');
  if (b.width <= 0 || b.height <= 0) throw new Error('bounds width/height must be positive');
  if (b.width > 20000 || b.height > 20000) throw new Error('bounds dimensions exceed maximum');
}

export const ALLOWED_SETTINGS_KEYS = new Set([
  'cloudEndpoint', 'chatApiUrl', 'apiKey',
  'llmProvider', 'llmApiKey', 'llmModel', 'llmBaseUrl',
  'autoAnnotateSteps', 'autoGenerateGuide', 'frontendUrl',
  'spotlightShortcut', 'recordingShortcut', 'minimizeOnRecord',
  'audioEnabled', 'preferredAudioDevice',
]);

export function validateSettingsUpdate(settings: unknown): void {
  assertObject(settings, 'settings');
  const s = settings as Record<string, unknown>;
  for (const key of Object.keys(s)) {
    if (!ALLOWED_SETTINGS_KEYS.has(key)) throw new Error(`Unknown settings key: ${key}`);
  }
  if (s.cloudEndpoint !== undefined) assertString(s.cloudEndpoint, 'cloudEndpoint');
  if (s.chatApiUrl !== undefined) assertString(s.chatApiUrl, 'chatApiUrl');
  if (s.apiKey !== undefined) assertString(s.apiKey, 'apiKey');
  if (s.llmProvider !== undefined) assertString(s.llmProvider, 'llmProvider');
  if (s.llmApiKey !== undefined) assertString(s.llmApiKey, 'llmApiKey');
  if (s.llmModel !== undefined) assertString(s.llmModel, 'llmModel');
  if (s.llmBaseUrl !== undefined) assertString(s.llmBaseUrl, 'llmBaseUrl');
  if (s.autoAnnotateSteps !== undefined) assertBoolean(s.autoAnnotateSteps, 'autoAnnotateSteps');
  if (s.autoGenerateGuide !== undefined) assertBoolean(s.autoGenerateGuide, 'autoGenerateGuide');
  if (s.frontendUrl !== undefined) assertString(s.frontendUrl, 'frontendUrl');
  if (s.spotlightShortcut !== undefined) assertString(s.spotlightShortcut, 'spotlightShortcut');
  if (s.recordingShortcut !== undefined) assertString(s.recordingShortcut, 'recordingShortcut');
  if (s.minimizeOnRecord !== undefined) assertBoolean(s.minimizeOnRecord, 'minimizeOnRecord');
  if (s.audioEnabled !== undefined) assertBoolean(s.audioEnabled, 'audioEnabled');
  if (s.preferredAudioDevice !== undefined) assertString(s.preferredAudioDevice, 'preferredAudioDevice');
}

export function validateChatMessages(messages: unknown): void {
  assertArray(messages, 'messages');
  if ((messages as unknown[]).length === 0) throw new Error('messages must not be empty');
  if ((messages as unknown[]).length > 200) throw new Error('messages exceeds maximum length');
  for (const msg of messages as unknown[]) {
    assertObject(msg, 'message');
    const m = msg as Record<string, unknown>;
    if (!['system', 'user', 'assistant'].includes(m.role as string)) {
      throw new Error('message.role must be system, user, or assistant');
    }
    assertString(m.content, 'message.content');
    if ((m.content as string).length > 100_000) {
      throw new Error('message.content exceeds maximum length');
    }
  }
}

export function validateExternalUrl(url: unknown): void {
  assertString(url, 'url');
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Invalid URL');
  }
  const allowed = ['https:', 'mailto:'];
  if (!allowed.includes(parsed.protocol)) {
    throw new Error(`Protocol ${parsed.protocol} is not allowed. Only https: and mailto: are permitted.`);
  }
}

export function validateNoPathTraversal(filePath: unknown, name: string): void {
  assertString(filePath, name);
  const normalized = path.normalize(filePath);
  if (normalized.includes('..')) throw new Error(`${name} must not contain path traversal`);
}

export function validateId(value: unknown, name: string): void {
  assertString(value, name);
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`${name} must be alphanumeric (with hyphens/underscores), max 128 chars`);
  }
}
