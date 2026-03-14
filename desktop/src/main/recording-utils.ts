/**
 * recording-utils.ts — Pure functions extracted from recording.ts for testability.
 * No Electron, no native binary, no I/O — just math and mappings.
 */

// =====================================================================
// Coordinate normalization
// =====================================================================

export type CoordSpace = 'logical' | 'physical';

/**
 * Convert raw event coordinates to logical pixels.
 * macOS CGEventTap reports logical coords (coordSpace="logical") → passthrough.
 * Windows hooks report physical pixels (coordSpace="physical") → divide by scale.
 */
export function toLogical(
  x: number,
  y: number,
  coordSpace: CoordSpace,
  scale: number
): { x: number; y: number } {
  if (coordSpace === 'physical' && scale > 1) {
    return {
      x: Math.round(x / scale),
      y: Math.round(y / scale),
    };
  }
  return { x, y };
}

/**
 * Compute the annotation pixel position in the output screenshot image.
 * clickLogical: the click in logical screen coords
 * captureRegion: the logical screen region being captured
 * scale: the DPI scale factor (image pixels = logical × scale)
 * Returns the pixel coordinate in the output image where the annotation should be drawn.
 */
export function computeAnnotationPixel(
  clickLogical: { x: number; y: number },
  captureRegion: { x: number; y: number; width: number; height: number },
  scale: number
): { x: number; y: number; inBounds: boolean } {
  const relX = clickLogical.x - captureRegion.x;
  const relY = clickLogical.y - captureRegion.y;

  const pixelX = Math.round(relX * scale);
  const pixelY = Math.round(relY * scale);

  const imgW = Math.round(captureRegion.width * scale);
  const imgH = Math.round(captureRegion.height * scale);

  return {
    x: pixelX,
    y: pixelY,
    inBounds: pixelX >= 0 && pixelX < imgW && pixelY >= 0 && pixelY < imgH,
  };
}

/**
 * Compute screenshot-relative position (logical, clamped to capture region).
 */
export function screenshotRelativePosition(
  clickLogical: { x: number; y: number },
  captureRegion: { x: number; y: number; width: number; height: number }
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(clickLogical.x - captureRegion.x, captureRegion.width - 1)),
    y: Math.max(0, Math.min(clickLogical.y - captureRegion.y, captureRegion.height - 1)),
  };
}

/**
 * Full coordinate pipeline: raw event → logical → screenshot-relative → annotation pixel.
 * This is the exact chain used in recording.ts processClick.
 */
export function fullCoordPipeline(
  rawX: number,
  rawY: number,
  coordSpace: CoordSpace,
  captureRegion: { x: number; y: number; width: number; height: number },
  effectiveScale: number
): {
  logical: { x: number; y: number };
  screenshotRelative: { x: number; y: number };
  annotationPixel: { x: number; y: number; inBounds: boolean };
  imageSize: { width: number; height: number };
} {
  const logical = toLogical(rawX, rawY, coordSpace, effectiveScale);
  const rel = screenshotRelativePosition(logical, captureRegion);
  const annot = computeAnnotationPixel(logical, captureRegion, effectiveScale);
  return {
    logical,
    screenshotRelative: rel,
    annotationPixel: annot,
    imageSize: {
      width: Math.round(captureRegion.width * effectiveScale),
      height: Math.round(captureRegion.height * effectiveScale),
    },
  };
}

// =====================================================================
// Keycode → character maps
// =====================================================================

// macOS CGKeyCode maps (from CGEventTap)
export const MAC_KEYCODE_MAP: Record<number, string> = {
  0: 'a', 1: 's', 2: 'd', 3: 'f', 4: 'h', 5: 'g', 6: 'z', 7: 'x',
  8: 'c', 9: 'v', 11: 'b', 12: 'q', 13: 'w', 14: 'e', 15: 'r',
  16: 'y', 17: 't', 18: '1', 19: '2', 20: '3', 21: '4', 22: '6',
  23: '5', 24: '=', 25: '9', 26: '7', 27: '-', 28: '8', 29: '0',
  30: ']', 31: 'o', 32: 'u', 33: '[', 34: 'i', 35: 'p', 37: 'l',
  38: 'j', 39: "'", 40: 'k', 41: ';', 42: '\\', 43: ',', 44: '/',
  45: 'n', 46: 'm', 47: '.', 49: ' ', 50: '`',
};

export const MAC_NAMED_KEY_MAP: Record<number, string> = {
  36: 'Enter', 48: 'Tab', 51: 'Backspace', 53: 'Escape',
  117: 'Delete', 115: 'Home', 119: 'End',
  116: 'PageUp', 121: 'PageDown',
  123: 'Left', 124: 'Right', 125: 'Down', 126: 'Up',
  122: 'F1', 120: 'F2', 99: 'F3', 118: 'F4', 96: 'F5', 97: 'F6',
  98: 'F7', 100: 'F8', 101: 'F9', 109: 'F10', 103: 'F11', 111: 'F12',
};

export const MAC_F9 = 101;
export const MAC_FLUSH_KEYS = [36, 48, 53]; // Enter, Tab, Escape
export const MAC_MODIFIER_KEYCODES = [54, 55, 56, 57, 58, 59, 60, 61, 62, 63];

// Windows Virtual Key maps (from SetWindowsHookEx)
export const WIN_VK_MAP: Record<number, string> = {
  0x41: 'a', 0x42: 'b', 0x43: 'c', 0x44: 'd', 0x45: 'e', 0x46: 'f',
  0x47: 'g', 0x48: 'h', 0x49: 'i', 0x4A: 'j', 0x4B: 'k', 0x4C: 'l',
  0x4D: 'm', 0x4E: 'n', 0x4F: 'o', 0x50: 'p', 0x51: 'q', 0x52: 'r',
  0x53: 's', 0x54: 't', 0x55: 'u', 0x56: 'v', 0x57: 'w', 0x58: 'x',
  0x59: 'y', 0x5A: 'z',
  0x30: '0', 0x31: '1', 0x32: '2', 0x33: '3', 0x34: '4',
  0x35: '5', 0x36: '6', 0x37: '7', 0x38: '8', 0x39: '9',
  0xBA: ';', 0xBB: '=', 0xBC: ',', 0xBD: '-', 0xBE: '.', 0xBF: '/',
  0xC0: '`', 0xDB: '[', 0xDC: '\\', 0xDD: ']', 0xDE: "'",
  0x20: ' ',
};

export const WIN_NAMED_KEY_MAP: Record<number, string> = {
  0x08: 'Backspace', 0x09: 'Tab', 0x0D: 'Enter', 0x1B: 'Escape',
  0x2E: 'Delete', 0x2D: 'Insert', 0x24: 'Home', 0x23: 'End',
  0x21: 'PageUp', 0x22: 'PageDown',
  0x25: 'Left', 0x26: 'Up', 0x27: 'Right', 0x28: 'Down',
  0x2C: 'PrintScreen', 0x13: 'Pause',
  0x70: 'F1', 0x71: 'F2', 0x72: 'F3', 0x73: 'F4', 0x74: 'F5', 0x75: 'F6',
  0x76: 'F7', 0x77: 'F8', 0x78: 'F9', 0x79: 'F10', 0x7A: 'F11', 0x7B: 'F12',
};

export const WIN_F9 = 0x78;
export const WIN_FLUSH_KEYS = [0x0D, 0x09, 0x1B]; // Enter, Tab, Escape
export const WIN_MODIFIER_VKS = [0x10, 0x11, 0x12, 0x5B, 0x5C, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0x14];

// =====================================================================
// Keycode resolution helpers
// =====================================================================

export type Platform = 'darwin' | 'win32';

export function getCharForKeycode(keycode: number, platform: Platform): string {
  const map = platform === 'darwin' ? MAC_KEYCODE_MAP : WIN_VK_MAP;
  return map[keycode] || '';
}

export function getNamedKey(keycode: number, platform: Platform): string {
  const map = platform === 'darwin' ? MAC_NAMED_KEY_MAP : WIN_NAMED_KEY_MAP;
  return map[keycode] || '';
}

export function isModifierKey(keycode: number, platform: Platform): boolean {
  const mods = platform === 'darwin' ? MAC_MODIFIER_KEYCODES : WIN_MODIFIER_VKS;
  return mods.includes(keycode);
}

export function isFlushKey(keycode: number, platform: Platform): boolean {
  const keys = platform === 'darwin' ? MAC_FLUSH_KEYS : WIN_FLUSH_KEYS;
  return keys.includes(keycode);
}

export function isF9(keycode: number, platform: Platform): boolean {
  return keycode === (platform === 'darwin' ? MAC_F9 : WIN_F9);
}

// =====================================================================
// Click description builder
// =====================================================================

export interface ElementInfo {
  role: string;
  title: string;
  value: string;
  description: string;
  subrole?: string;
}

/**
 * Format a human-readable element name from accessibility info.
 */
export function formatElementName(element: ElementInfo | null | undefined): string {
  if (!element) return '';
  if (element.title) return element.title;
  if (element.description) return element.description;
  if (element.value && element.value.length < 50) return element.value;
  if (element.role) return element.role.replace(/^AX/, '');
  return '';
}

/**
 * Build a human-readable click description.
 */
export function buildClickDescription(
  button: number,
  clickCount: number,
  windowTitle: string,
  element: ElementInfo | null | undefined
): { actionType: string; description: string } {
  const buttonTypes: Record<number, string> = { 1: 'Left', 2: 'Right', 3: 'Middle' };
  const buttonType = buttonTypes[button] || 'Left';
  const clickLabel =
    clickCount >= 3 ? 'Triple Click' : clickCount === 2 ? 'Double Click' : `${buttonType} Click`;

  const elementName = formatElementName(element);
  const cleanRole = element?.role ? element.role.replace(/^AX/, '') : '';
  const shortTitle = windowTitle.length > 40 ? windowTitle.substring(0, 40) + '…' : windowTitle;

  const genericRoles = ['Group', 'ScrollArea', 'Window', 'Unknown', 'WebArea', 'Splitter', 'Client', 'Pane'];

  let description = clickLabel;
  if (elementName && elementName !== cleanRole) {
    description += ` on "${elementName}"`;
  } else if (cleanRole && !genericRoles.includes(cleanRole)) {
    description += ` on ${cleanRole}`;
  }
  description += ` in ${shortTitle}`;

  return { actionType: clickLabel, description };
}

/**
 * Build a keyboard shortcut combo string.
 */
export function buildShortcutCombo(
  keycode: number,
  modifiers: string[],
  platform: Platform
): string | null {
  const char = getCharForKeycode(keycode, platform);
  const named = getNamedKey(keycode, platform);
  const keyLabel = char ? char.toUpperCase() : named;
  if (!keyLabel) return null;

  const mods: string[] = [];
  if (modifiers.includes('ctrl')) mods.push('Ctrl');
  if (modifiers.includes('meta')) mods.push(platform === 'darwin' ? 'Cmd' : 'Win');
  if (modifiers.includes('alt')) mods.push(platform === 'darwin' ? 'Option' : 'Alt');
  if (modifiers.includes('shift')) mods.push('Shift');

  return [...mods, keyLabel].join('+');
}

// =====================================================================
// System app filtering
// =====================================================================

const SYSTEM_APPS = [
  'Dock', 'WindowManager', 'Spotlight', 'NotificationCenter',
  'SystemUIServer', 'Control Center', 'Mission Control',
  'loginwindow', 'ScreenSaverEngine', 'AirPlayUIAgent',
  'Window Server',
];

const SELF_APPS = ['Electron', 'Ondoki Desktop'];

/**
 * Should this click be filtered out?
 */
export function shouldFilterClick(
  ownerApp: string,
  windowTitle: string,
  windowBoundsWidth: number,
  nativeAvailable: boolean
): { filtered: boolean; reason?: string } {
  // Skip clicks on the recording app itself
  if (SELF_APPS.includes(ownerApp) || windowTitle === 'Ondoki Desktop' || windowTitle.startsWith('Ondoki')) {
    return { filtered: true, reason: 'self' };
  }

  // Skip system UI — only when we have reliable native info (ownerApp populated)
  if (ownerApp && SYSTEM_APPS.includes(ownerApp)) {
    return { filtered: true, reason: 'system' };
  }

  // Skip if no window found and native IS available (Exposé/Mission Control animations)
  if (windowTitle === 'Unknown Window' && !windowBoundsWidth && nativeAvailable) {
    return { filtered: true, reason: 'no-window' };
  }

  return { filtered: false };
}

// =====================================================================
// Capture area helpers
// =====================================================================

export function isPointInCaptureArea(
  x: number,
  y: number,
  captureArea?: { type: string; bounds?: { x: number; y: number; width: number; height: number } }
): boolean {
  if (!captureArea) return true;
  if (captureArea.type === 'all-displays') return true;
  if (!captureArea.bounds) return true;
  const { bounds } = captureArea;
  return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height;
}

// =====================================================================
// Double-click detection
// =====================================================================

export interface ClickState {
  lastTime: number;
  lastX: number;
  lastY: number;
  lastButton: number;
  pendingCount: number;
}

export function detectMultiClick(
  x: number,
  y: number,
  button: number,
  now: number,
  state: ClickState,
  threshold: { distPx: number; timeMs: number }
): { isMulti: boolean; count: number } {
  const dx = Math.abs(x - state.lastX);
  const dy = Math.abs(y - state.lastY);
  const timeDiff = now - state.lastTime;
  const sameSpot = dx < threshold.distPx && dy < threshold.distPx;
  const sameButton = button === state.lastButton;

  if (sameSpot && sameButton && timeDiff < threshold.timeMs && state.pendingCount > 0) {
    return { isMulti: true, count: state.pendingCount + 1 };
  }
  return { isMulti: false, count: 1 };
}

// =====================================================================
// Typed text accumulator
// =====================================================================

export class TypeAccumulator {
  public text = '';

  appendChar(char: string): void {
    this.text += char;
  }

  appendBackspace(): void {
    this.text += '[⌫]';
  }

  flush(): string {
    const result = this.text;
    this.text = '';
    return result;
  }

  get hasText(): boolean {
    return this.text.length > 0;
  }
}

// =====================================================================
// Event classification
// =====================================================================

export interface KeyEvent {
  keycode: number;
  modifiers: string[];
}

export type KeyAction =
  | { type: 'toggle-pause' }
  | { type: 'flush' }
  | { type: 'shortcut'; combo: string }
  | { type: 'char'; char: string }
  | { type: 'backspace' }
  | { type: 'named-key'; name: string }
  | { type: 'ignore' };

/**
 * Classify a key event into an action. Pure function — no side effects.
 */
export function classifyKeyEvent(event: KeyEvent, platform: Platform): KeyAction {
  const { keycode, modifiers } = event;

  if (isF9(keycode, platform)) {
    return { type: 'toggle-pause' };
  }

  if (isModifierKey(keycode, platform)) {
    return { type: 'ignore' };
  }

  if (isFlushKey(keycode, platform)) {
    return { type: 'flush' };
  }

  const hasModifier = modifiers.includes('ctrl') || modifiers.includes('alt') || modifiers.includes('meta');

  if (hasModifier) {
    const combo = buildShortcutCombo(keycode, modifiers, platform);
    if (combo) return { type: 'shortcut', combo };
    return { type: 'ignore' };
  }

  const char = getCharForKeycode(keycode, platform);
  if (char) {
    return { type: 'char', char };
  }

  const named = getNamedKey(keycode, platform);
  if (named) {
    if (named === 'Backspace') return { type: 'backspace' };
    return { type: 'named-key', name: named };
  }

  return { type: 'ignore' };
}
