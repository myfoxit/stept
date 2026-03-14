import { describe, it, expect } from 'vitest';
import {
  buildClickDescription,
  formatElementName,
  shouldFilterClick,
  isPointInCaptureArea,
  detectMultiClick,
  ClickState,
  ElementInfo,
} from '../src/main/recording-utils';

// =====================================================================
// buildClickDescription
// =====================================================================

describe('buildClickDescription', () => {
  describe('click types', () => {
    it('left click', () => {
      const r = buildClickDescription(1, 1, 'VS Code', null);
      expect(r.actionType).toBe('Left Click');
      expect(r.description).toBe('Left Click in VS Code');
    });

    it('right click', () => {
      const r = buildClickDescription(2, 1, 'Firefox', null);
      expect(r.actionType).toBe('Right Click');
      expect(r.description).toBe('Right Click in Firefox');
    });

    it('middle click', () => {
      const r = buildClickDescription(3, 1, 'Terminal', null);
      expect(r.actionType).toBe('Middle Click');
      expect(r.description).toBe('Middle Click in Terminal');
    });

    it('unknown button defaults to Left', () => {
      const r = buildClickDescription(99, 1, 'App', null);
      expect(r.actionType).toBe('Left Click');
    });

    it('double click', () => {
      const r = buildClickDescription(1, 2, 'VS Code', null);
      expect(r.actionType).toBe('Double Click');
      expect(r.description).toBe('Double Click in VS Code');
    });

    it('triple click', () => {
      const r = buildClickDescription(1, 3, 'VS Code', null);
      expect(r.actionType).toBe('Triple Click');
    });

    it('quadruple+ click → triple', () => {
      const r = buildClickDescription(1, 5, 'VS Code', null);
      expect(r.actionType).toBe('Triple Click');
    });
  });

  describe('with element info', () => {
    it('includes element title in description', () => {
      const el: ElementInfo = { role: 'AXButton', title: 'Save', value: '', description: '', subrole: '' };
      const r = buildClickDescription(1, 1, 'VS Code', el);
      expect(r.description).toBe('Left Click on "Save" in VS Code');
    });

    it('uses role when title matches cleaned role (avoids duplication)', () => {
      const el: ElementInfo = { role: 'AXButton', title: 'Button', value: '', description: '', subrole: '' };
      const r = buildClickDescription(1, 1, 'App', el);
      expect(r.description).toBe('Left Click on Button in App');
    });

    it('uses role when no title/description/value', () => {
      const el: ElementInfo = { role: 'AXLink', title: '', value: '', description: '', subrole: '' };
      const r = buildClickDescription(1, 1, 'Firefox', el);
      expect(r.description).toBe('Left Click on Link in Firefox');
    });

    it('skips generic roles (Group, ScrollArea, Window, etc)', () => {
      for (const genericRole of ['Group', 'ScrollArea', 'Window', 'Unknown', 'WebArea', 'Splitter', 'Client', 'Pane']) {
        const el: ElementInfo = { role: genericRole, title: '', value: '', description: '', subrole: '' };
        const r = buildClickDescription(1, 1, 'App', el);
        expect(r.description).toBe('Left Click in App');
      }
    });

    it('skips AX-prefixed generic roles', () => {
      const el: ElementInfo = { role: 'AXScrollArea', title: '', value: '', description: '', subrole: '' };
      const r = buildClickDescription(1, 1, 'App', el);
      expect(r.description).toBe('Left Click in App');
    });

    it('element with only value → uses value as name', () => {
      const el: ElementInfo = { role: '', title: '', value: 'input text here', description: '', subrole: '' };
      const r = buildClickDescription(1, 1, 'App', el);
      expect(r.description).toBe('Left Click on "input text here" in App');
    });

    it('element with long value (>50 chars) → falls through to role', () => {
      const longVal = 'a'.repeat(60);
      const el: ElementInfo = { role: 'AXTextField', title: '', value: longVal, description: '', subrole: '' };
      const r = buildClickDescription(1, 1, 'App', el);
      // formatElementName skips value if > 50 chars, uses role instead
      expect(r.description).toBe('Left Click on TextField in App');
    });

    it('null element → no element info in description', () => {
      const r = buildClickDescription(1, 1, 'App', null);
      expect(r.description).toBe('Left Click in App');
    });

    it('undefined element → no element info', () => {
      const r = buildClickDescription(1, 1, 'App', undefined);
      expect(r.description).toBe('Left Click in App');
    });
  });

  describe('window title handling', () => {
    it('truncates long titles at 40 chars', () => {
      const longTitle = 'This is a very long window title that should be truncated somewhere';
      const r = buildClickDescription(1, 1, longTitle, null);
      expect(r.description).toContain('This is a very long window title that sh…');
      expect(r.description.length).toBeLessThan(longTitle.length + 20);
    });

    it('short title preserved', () => {
      const r = buildClickDescription(1, 1, 'Terminal', null);
      expect(r.description).toBe('Left Click in Terminal');
    });

    it('exactly 40 char title not truncated', () => {
      const t = 'a'.repeat(40);
      const r = buildClickDescription(1, 1, t, null);
      expect(r.description).not.toContain('…');
    });

    it('41 char title truncated', () => {
      const t = 'a'.repeat(41);
      const r = buildClickDescription(1, 1, t, null);
      expect(r.description).toContain('…');
    });
  });

  describe('double click + element combos', () => {
    it('double right click on element', () => {
      const el: ElementInfo = { role: 'AXButton', title: 'OK', value: '', description: '', subrole: '' };
      const r = buildClickDescription(2, 2, 'Dialog', el);
      expect(r.actionType).toBe('Double Click');
      expect(r.description).toBe('Double Click on "OK" in Dialog');
    });
  });
});

// =====================================================================
// formatElementName
// =====================================================================

describe('formatElementName', () => {
  it('prefers title', () => {
    expect(formatElementName({ role: 'AXButton', title: 'OK', value: 'val', description: 'desc', subrole: '' }))
      .toBe('OK');
  });

  it('falls back to description', () => {
    expect(formatElementName({ role: 'AXButton', title: '', value: '', description: 'A button', subrole: '' }))
      .toBe('A button');
  });

  it('falls back to short value', () => {
    expect(formatElementName({ role: '', title: '', value: 'hello', description: '', subrole: '' }))
      .toBe('hello');
  });

  it('skips long value, falls back to role', () => {
    const longVal = 'x'.repeat(60);
    expect(formatElementName({ role: 'AXTextField', title: '', value: longVal, description: '', subrole: '' }))
      .toBe('TextField');
  });

  it('strips AX prefix from role', () => {
    expect(formatElementName({ role: 'AXCheckBox', title: '', value: '', description: '', subrole: '' }))
      .toBe('CheckBox');
  });

  it('role without AX prefix preserved', () => {
    expect(formatElementName({ role: 'Button', title: '', value: '', description: '', subrole: '' }))
      .toBe('Button');
  });

  it('null → empty string', () => {
    expect(formatElementName(null)).toBe('');
  });

  it('undefined → empty string', () => {
    expect(formatElementName(undefined)).toBe('');
  });

  it('all empty → empty string', () => {
    expect(formatElementName({ role: '', title: '', value: '', description: '', subrole: '' })).toBe('');
  });
});

// =====================================================================
// shouldFilterClick
// =====================================================================

describe('shouldFilterClick', () => {
  describe('self-filtering', () => {
    it('filters Electron app', () => {
      expect(shouldFilterClick('Electron', 'main window', 800, true)).toEqual({ filtered: true, reason: 'self' });
    });

    it('filters Stept Desktop', () => {
      expect(shouldFilterClick('Stept Desktop', 'Recording', 800, true)).toEqual({ filtered: true, reason: 'self' });
    });

    it('filters by window title starting with Stept', () => {
      expect(shouldFilterClick('SomeApp', 'Stept Settings', 800, true)).toEqual({ filtered: true, reason: 'self' });
    });

    it('filters window title exactly "Stept Desktop"', () => {
      expect(shouldFilterClick('', 'Stept Desktop', 800, false)).toEqual({ filtered: true, reason: 'self' });
    });
  });

  describe('system app filtering', () => {
    it.each([
      'Dock', 'WindowManager', 'Spotlight', 'NotificationCenter',
      'SystemUIServer', 'Control Center', 'Mission Control',
      'loginwindow', 'ScreenSaverEngine', 'AirPlayUIAgent', 'Window Server',
    ])('filters system app: %s', (app) => {
      expect(shouldFilterClick(app, 'system', 800, true)).toEqual({ filtered: true, reason: 'system' });
    });

    it('does NOT filter regular apps', () => {
      expect(shouldFilterClick('Firefox', 'Mozilla Firefox', 800, true)).toEqual({ filtered: false });
    });

    it('does NOT filter when ownerApp is empty (native unavailable)', () => {
      // THE BUG: previously ownerApp="" caused all clicks to be dropped
      expect(shouldFilterClick('', 'Unknown Window', 800, false)).toEqual({ filtered: false });
    });

    it('does NOT filter empty ownerApp even with system-like window title', () => {
      expect(shouldFilterClick('', 'Control Center', 800, false)).toEqual({ filtered: false });
    });
  });

  describe('no-window filtering', () => {
    it('filters Unknown Window with zero width when native available', () => {
      expect(shouldFilterClick('', 'Unknown Window', 0, true)).toEqual({ filtered: true, reason: 'no-window' });
    });

    it('does NOT filter Unknown Window when native unavailable', () => {
      expect(shouldFilterClick('', 'Unknown Window', 0, false)).toEqual({ filtered: false });
    });

    it('does NOT filter Unknown Window with nonzero width', () => {
      expect(shouldFilterClick('', 'Unknown Window', 800, true)).toEqual({ filtered: false });
    });

    it('does NOT filter real window with zero width', () => {
      expect(shouldFilterClick('Firefox', 'Firefox', 0, true)).toEqual({ filtered: false });
    });
  });
});

// =====================================================================
// isPointInCaptureArea
// =====================================================================

describe('isPointInCaptureArea', () => {
  const area = { type: 'single-display', bounds: { x: 100, y: 50, width: 800, height: 600 } };

  it('point inside → true', () => {
    expect(isPointInCaptureArea(500, 300, area)).toBe(true);
  });

  it('point at origin → true', () => {
    expect(isPointInCaptureArea(100, 50, area)).toBe(true);
  });

  it('point at bottom-right edge → false (exclusive)', () => {
    expect(isPointInCaptureArea(900, 650, area)).toBe(false);
  });

  it('point just inside bottom-right → true', () => {
    expect(isPointInCaptureArea(899, 649, area)).toBe(true);
  });

  it('point outside left → false', () => {
    expect(isPointInCaptureArea(50, 300, area)).toBe(false);
  });

  it('point outside above → false', () => {
    expect(isPointInCaptureArea(500, 20, area)).toBe(false);
  });

  it('no captureArea → always true', () => {
    expect(isPointInCaptureArea(0, 0, undefined)).toBe(true);
  });

  it('all-displays type → always true', () => {
    expect(isPointInCaptureArea(-500, -500, { type: 'all-displays' })).toBe(true);
  });

  it('area without bounds → always true', () => {
    expect(isPointInCaptureArea(0, 0, { type: 'window' })).toBe(true);
  });
});

// =====================================================================
// detectMultiClick
// =====================================================================

describe('detectMultiClick', () => {
  const threshold = { distPx: 5, timeMs: 400 };

  function makeState(overrides: Partial<ClickState> = {}): ClickState {
    return { lastTime: 0, lastX: 0, lastY: 0, lastButton: 1, pendingCount: 0, ...overrides };
  }

  it('first click → not multi, count=1', () => {
    const result = detectMultiClick(500, 300, 1, 1000, makeState(), threshold);
    expect(result).toEqual({ isMulti: false, count: 1 });
  });

  it('second click same spot within time → multi, count=2', () => {
    const state = makeState({ lastTime: 1000, lastX: 500, lastY: 300, lastButton: 1, pendingCount: 1 });
    const result = detectMultiClick(502, 301, 1, 1200, state, threshold);
    expect(result).toEqual({ isMulti: true, count: 2 });
  });

  it('third click same spot → multi, count=3', () => {
    const state = makeState({ lastTime: 1200, lastX: 502, lastY: 301, lastButton: 1, pendingCount: 2 });
    const result = detectMultiClick(503, 300, 1, 1350, state, threshold);
    expect(result).toEqual({ isMulti: true, count: 3 });
  });

  it('second click too far away → not multi', () => {
    const state = makeState({ lastTime: 1000, lastX: 500, lastY: 300, lastButton: 1, pendingCount: 1 });
    const result = detectMultiClick(520, 300, 1, 1200, state, threshold); // dx=20 > 5
    expect(result).toEqual({ isMulti: false, count: 1 });
  });

  it('second click too slow → not multi', () => {
    const state = makeState({ lastTime: 1000, lastX: 500, lastY: 300, lastButton: 1, pendingCount: 1 });
    const result = detectMultiClick(500, 300, 1, 1500, state, threshold); // 500ms > 400ms
    expect(result).toEqual({ isMulti: false, count: 1 });
  });

  it('different button → not multi', () => {
    const state = makeState({ lastTime: 1000, lastX: 500, lastY: 300, lastButton: 1, pendingCount: 1 });
    const result = detectMultiClick(500, 300, 2, 1200, state, threshold); // right click
    expect(result).toEqual({ isMulti: false, count: 1 });
  });

  it('exactly at distance threshold → multi (< not <=)', () => {
    const state = makeState({ lastTime: 1000, lastX: 500, lastY: 300, lastButton: 1, pendingCount: 1 });
    const result = detectMultiClick(504, 300, 1, 1200, state, threshold); // dx=4 < 5
    expect(result).toEqual({ isMulti: true, count: 2 });
  });

  it('exactly at time threshold → not multi (< not <=)', () => {
    const state = makeState({ lastTime: 1000, lastX: 500, lastY: 300, lastButton: 1, pendingCount: 1 });
    const result = detectMultiClick(500, 300, 1, 1400, state, threshold); // exactly 400ms
    expect(result).toEqual({ isMulti: false, count: 1 });
  });

  it('no pending count → not multi', () => {
    const state = makeState({ lastTime: 1000, lastX: 500, lastY: 300, lastButton: 1, pendingCount: 0 });
    const result = detectMultiClick(500, 300, 1, 1200, state, threshold);
    expect(result).toEqual({ isMulti: false, count: 1 });
  });
});
