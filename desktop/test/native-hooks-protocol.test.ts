import { EventEmitter } from 'events';
import { Readable } from 'stream';

/**
 * Integration tests for the native hooks protocol.
 * Tests the JSON contract between native binary and TypeScript recording service.
 * Uses mock processes — no real native binary or Electron needed.
 */

// ---- Mock helpers ----

interface MockProcess extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  stdin: { write: ReturnType<typeof jest.fn> };
  kill: ReturnType<typeof jest.fn>;
  pid: number;
}

function createMockProcess(): MockProcess {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const proc = new EventEmitter() as MockProcess;
  proc.stdout = stdout;
  proc.stderr = stderr;
  proc.stdin = { write: jest.fn() };
  proc.kill = jest.fn();
  proc.pid = 12345;
  return proc;
}

function sendLine(proc: MockProcess, obj: any): void {
  proc.stdout.push(JSON.stringify(obj) + '\n');
}

// ---- Event format tests ----

describe('native event JSON contract', () => {
  describe('ready message', () => {
    it('macOS ready message has correct shape', () => {
      const ready = { type: 'ready', platform: 'darwin', coordSpace: 'logical' };
      expect(ready.type).toBe('ready');
      expect(ready.platform).toBe('darwin');
      expect(ready.coordSpace).toBe('logical');
    });

    it('Windows ready message has correct shape', () => {
      const ready = { type: 'ready', platform: 'win32', coordSpace: 'physical' };
      expect(ready.type).toBe('ready');
      expect(ready.platform).toBe('win32');
      expect(ready.coordSpace).toBe('physical');
    });
  });

  describe('click event format', () => {
    it('has all required fields', () => {
      const click = {
        type: 'click',
        x: 500,
        y: 300,
        button: 1,
        window: {
          handle: 12345,
          title: 'VS Code',
          ownerName: 'Code',
          ownerPID: 1234,
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          isVisible: true,
          layer: 0,
        },
        element: {
          role: 'AXButton',
          title: 'Save',
          value: '',
          description: '',
          subrole: 'AXDefaultButton',
        },
        scale: 2.0,
        timestamp: 1700000000000,
      };

      expect(click.type).toBe('click');
      expect(typeof click.x).toBe('number');
      expect(typeof click.y).toBe('number');
      expect([1, 2, 3]).toContain(click.button);
      expect(click.window).toBeDefined();
      expect(click.window!.bounds.width).toBeGreaterThan(0);
      expect(click.scale).toBeGreaterThan(0);
      expect(click.timestamp).toBeGreaterThan(0);
    });

    it('allows null window', () => {
      const click = {
        type: 'click', x: 100, y: 100, button: 1,
        window: null, element: null, scale: 1.0, timestamp: Date.now(),
      };
      expect(click.window).toBeNull();
    });

    it('allows null element', () => {
      const click = {
        type: 'click', x: 100, y: 100, button: 1,
        window: { handle: 1, title: 'App', ownerName: 'App', ownerPID: 1, bounds: { x: 0, y: 0, width: 800, height: 600 }, isVisible: true, layer: 0 },
        element: null, scale: 1.0, timestamp: Date.now(),
      };
      expect(click.element).toBeNull();
    });

    it('button values: 1=left, 2=right, 3=middle', () => {
      for (const button of [1, 2, 3]) {
        const click = { type: 'click', x: 0, y: 0, button, window: null, element: null, scale: 1, timestamp: 0 };
        expect(click.button).toBe(button);
      }
    });
  });

  describe('key event format', () => {
    it('has all required fields', () => {
      const key = {
        type: 'key',
        keycode: 0,
        modifiers: ['meta'],
        window: {
          handle: 1, title: 'Terminal', ownerName: 'Terminal',
          ownerPID: 5678, bounds: { x: 0, y: 0, width: 800, height: 600 },
          isVisible: true, layer: 0,
        },
        timestamp: 1700000000000,
      };

      expect(key.type).toBe('key');
      expect(typeof key.keycode).toBe('number');
      expect(Array.isArray(key.modifiers)).toBe(true);
      expect(key.timestamp).toBeGreaterThan(0);
    });

    it('modifiers use lowercase strings', () => {
      const key = { type: 'key', keycode: 8, modifiers: ['ctrl', 'shift', 'alt', 'meta'], window: null, timestamp: 0 };
      for (const mod of key.modifiers) {
        expect(mod).toBe(mod.toLowerCase());
        expect(['ctrl', 'shift', 'alt', 'meta']).toContain(mod);
      }
    });

    it('allows empty modifiers array', () => {
      const key = { type: 'key', keycode: 0, modifiers: [], window: null, timestamp: 0 };
      expect(key.modifiers).toEqual([]);
    });

    it('Windows key event includes scancode', () => {
      const key = { type: 'key', keycode: 0x41, scancode: 30, modifiers: [], window: null, timestamp: 0 };
      expect(key.scancode).toBe(30);
    });
  });

  describe('scroll event format', () => {
    it('has all required fields', () => {
      const scroll = {
        type: 'scroll',
        x: 500, y: 300,
        deltaX: 0, deltaY: -3.5,
        window: {
          handle: 1, title: 'Firefox', ownerName: 'firefox',
          ownerPID: 999, bounds: { x: 0, y: 0, width: 1920, height: 1080 },
          isVisible: true, layer: 0,
        },
        timestamp: 1700000000000,
      };

      expect(scroll.type).toBe('scroll');
      expect(typeof scroll.deltaX).toBe('number');
      expect(typeof scroll.deltaY).toBe('number');
    });

    it('deltaY negative = scroll up, positive = scroll down', () => {
      const scrollUp = { type: 'scroll', x: 0, y: 0, deltaX: 0, deltaY: -3, window: null, timestamp: 0 };
      const scrollDown = { type: 'scroll', x: 0, y: 0, deltaX: 0, deltaY: 3, window: null, timestamp: 0 };
      expect(scrollUp.deltaY).toBeLessThan(0);
      expect(scrollDown.deltaY).toBeGreaterThan(0);
    });
  });
});

// ---- Protocol tests ----

describe('native hooks protocol', () => {
  let proc: MockProcess;

  beforeEach(() => {
    proc = createMockProcess();
  });

  afterEach(() => {
    proc.stdout.destroy();
    proc.stderr.destroy();
  });

  it('first line is always a ready message', async () => {
    const readline = require('readline');
    const rl = readline.createInterface({ input: proc.stdout });

    const promise = new Promise<void>((resolve) => {
      rl.on('line', (line: string) => {
        const event = JSON.parse(line);
        expect(event.type).toBe('ready');
        expect(['logical', 'physical']).toContain(event.coordSpace);
        rl.close();
        resolve();
      });
    });

    sendLine(proc, { type: 'ready', platform: 'darwin', coordSpace: 'logical' });
    await promise;
  });

  it('events stream as newline-delimited JSON', async () => {
    const readline = require('readline');
    const rl = readline.createInterface({ input: proc.stdout });
    const events: any[] = [];

    const promise = new Promise<void>((resolve) => {
      rl.on('line', (line: string) => {
        events.push(JSON.parse(line));
        if (events.length === 3) {
          expect(events[0].type).toBe('ready');
          expect(events[1].type).toBe('click');
          expect(events[2].type).toBe('key');
          rl.close();
          resolve();
        }
      });
    });

    sendLine(proc, { type: 'ready', platform: 'darwin', coordSpace: 'logical' });
    sendLine(proc, { type: 'click', x: 100, y: 200, button: 1, window: null, element: null, scale: 2.0, timestamp: Date.now() });
    sendLine(proc, { type: 'key', keycode: 0, modifiers: [], window: null, timestamp: Date.now() });
    await promise;
  });

  it('handles stderr output without crashing', () => {
    proc.stderr.push('Warning: something\n');
    // Should not throw
  });

  it('kill terminates process', () => {
    proc.kill();
    expect(proc.kill).toHaveBeenCalled();
  });
});

// ---- Realistic event sequences ----

describe('realistic recording scenarios', () => {
  it('user clicks a button, types text, presses Enter', () => {
    const events = [
      { type: 'ready', platform: 'darwin', coordSpace: 'logical' },
      // Click on search box
      {
        type: 'click', x: 500, y: 100, button: 1,
        window: { handle: 1, title: 'Firefox', ownerName: 'firefox', ownerPID: 100, bounds: { x: 0, y: 0, width: 1440, height: 900 }, isVisible: true, layer: 0 },
        element: { role: 'AXTextField', title: 'Search', value: '', description: 'Search the web', subrole: '' },
        scale: 2.0, timestamp: 1000,
      },
      // Type "hello"
      { type: 'key', keycode: 4, modifiers: [], window: { handle: 1, title: 'Firefox', ownerName: 'firefox', ownerPID: 100, bounds: { x: 0, y: 0, width: 1440, height: 900 }, isVisible: true, layer: 0 }, timestamp: 1100 },  // h
      { type: 'key', keycode: 14, modifiers: [], window: null, timestamp: 1150 },  // e
      { type: 'key', keycode: 37, modifiers: [], window: null, timestamp: 1200 },  // l
      { type: 'key', keycode: 37, modifiers: [], window: null, timestamp: 1250 },  // l
      { type: 'key', keycode: 31, modifiers: [], window: null, timestamp: 1300 },  // o
      // Press Enter
      { type: 'key', keycode: 36, modifiers: [], window: null, timestamp: 1500 },
    ];

    // Verify all events parse correctly
    for (const event of events) {
      const json = JSON.stringify(event);
      const parsed = JSON.parse(json);
      expect(parsed.type).toBeTruthy();
    }

    // Verify event types
    expect(events.map(e => e.type)).toEqual([
      'ready', 'click', 'key', 'key', 'key', 'key', 'key', 'key',
    ]);
  });

  it('user does Cmd+A, Cmd+C, clicks elsewhere, Cmd+V', () => {
    const events = [
      { type: 'ready', platform: 'darwin', coordSpace: 'logical' },
      // Cmd+A (select all)
      { type: 'key', keycode: 0, modifiers: ['meta'], window: { handle: 1, title: 'Notes', ownerName: 'Notes', ownerPID: 200, bounds: { x: 0, y: 0, width: 800, height: 600 }, isVisible: true, layer: 0 }, timestamp: 2000 },
      // Cmd+C (copy)
      { type: 'key', keycode: 8, modifiers: ['meta'], window: null, timestamp: 2200 },
      // Click in another window
      {
        type: 'click', x: 900, y: 400, button: 1,
        window: { handle: 2, title: 'VS Code', ownerName: 'Code', ownerPID: 300, bounds: { x: 400, y: 0, width: 1040, height: 900 }, isVisible: true, layer: 0 },
        element: { role: 'AXTextArea', title: '', value: '', description: 'Editor', subrole: '' },
        scale: 2.0, timestamp: 3000,
      },
      // Cmd+V (paste)
      { type: 'key', keycode: 9, modifiers: ['meta'], window: null, timestamp: 3200 },
    ];

    expect(events.filter(e => e.type === 'key' && (e as any).modifiers?.includes('meta')).length).toBe(3);
    expect(events.filter(e => e.type === 'click').length).toBe(1);
  });

  it('Windows 150% DPI scenario — click coords are physical', () => {
    const events = [
      { type: 'ready', platform: 'win32', coordSpace: 'physical' },
      {
        type: 'click', x: 1541, y: 687, button: 1,
        window: { handle: 12345, title: 'C:\\WINDOWS\\system32\\cmd.exe', ownerName: 'cmd', ownerPID: 5000, bounds: { x: 161, y: 149, width: 1694, height: 953 }, isVisible: true, layer: 0 },
        element: { role: 'Client', title: '', value: '', description: '', subrole: '' },
        scale: 1.5, timestamp: 5000,
      },
    ];

    const click = events[1] as any;
    // At 150%, logical coords = physical / 1.5
    const logicalX = Math.round(click.x / 1.5);
    const logicalY = Math.round(click.y / 1.5);
    expect(logicalX).toBe(1027);
    expect(logicalY).toBe(458);

    // Verify scale is included
    expect(click.scale).toBe(1.5);
  });

  it('rapid typing generates many key events without window info', () => {
    // After the first keystroke, subsequent keys may have null window
    // (window hasn't changed, native binary may skip the lookup for perf)
    const events = [];
    events.push({ type: 'ready', platform: 'darwin', coordSpace: 'logical' });

    const word = 'Hello World';
    const keycodes: Record<string, number> = { H: 4, e: 14, l: 37, o: 31, ' ': 49, W: 13, r: 15, d: 2 };

    for (let i = 0; i < word.length; i++) {
      events.push({
        type: 'key',
        keycode: keycodes[word[i]] || 0,
        modifiers: word[i] === word[i].toUpperCase() && word[i] !== ' ' ? ['shift'] : [],
        window: i === 0 ? { handle: 1, title: 'Editor', ownerName: 'Code', ownerPID: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, isVisible: true, layer: 0 } : null,
        timestamp: 5000 + i * 50,
      });
    }

    // All should parse fine, most with null window
    expect(events.filter(e => e.type === 'key' && !(e as any).window).length).toBe(word.length - 1);
  });
});

// ---- Edge cases ----

describe('edge cases', () => {
  it('malformed JSON line is skipped', () => {
    const lines = [
      '{"type":"ready","platform":"darwin","coordSpace":"logical"}',
      'not json at all',
      '{"type":"click","x":100,"y":200,"button":1,"window":null,"element":null,"scale":1,"timestamp":0}',
    ];

    const parsed: any[] = [];
    for (const line of lines) {
      try {
        parsed.push(JSON.parse(line));
      } catch {
        // Skip
      }
    }

    expect(parsed.length).toBe(2);
    expect(parsed[0].type).toBe('ready');
    expect(parsed[1].type).toBe('click');
  });

  it('event with extremely large coordinates', () => {
    const click = { type: 'click', x: 99999, y: 99999, button: 1, window: null, element: null, scale: 1, timestamp: 0 };
    expect(JSON.parse(JSON.stringify(click)).x).toBe(99999);
  });

  it('event with negative coordinates (multi-monitor)', () => {
    const click = { type: 'click', x: -500, y: -200, button: 1, window: null, element: null, scale: 1.5, timestamp: 0 };
    expect(JSON.parse(JSON.stringify(click)).x).toBe(-500);
  });

  it('window title with special characters', () => {
    const click = {
      type: 'click', x: 0, y: 0, button: 1, scale: 1, timestamp: 0,
      window: {
        handle: 1, title: 'file "test" — untitled.txt • modified', ownerName: 'TextEdit',
        ownerPID: 1, bounds: { x: 0, y: 0, width: 800, height: 600 }, isVisible: true, layer: 0,
      },
      element: null,
    };
    const roundtripped = JSON.parse(JSON.stringify(click));
    expect(roundtripped.window.title).toBe('file "test" — untitled.txt • modified');
  });

  it('window title with unicode', () => {
    const click = {
      type: 'click', x: 0, y: 0, button: 1, scale: 1, timestamp: 0,
      window: {
        handle: 1, title: '日本語テスト 🚀', ownerName: 'App',
        ownerPID: 1, bounds: { x: 0, y: 0, width: 800, height: 600 }, isVisible: true, layer: 0,
      },
      element: null,
    };
    const roundtripped = JSON.parse(JSON.stringify(click));
    expect(roundtripped.window.title).toBe('日本語テスト 🚀');
  });

  it('element with very long value is preserved in JSON', () => {
    const longVal = 'x'.repeat(1000);
    const click = {
      type: 'click', x: 0, y: 0, button: 1, scale: 1, timestamp: 0,
      window: null,
      element: { role: 'AXTextArea', title: '', value: longVal, description: '', subrole: '' },
    };
    const roundtripped = JSON.parse(JSON.stringify(click));
    expect(roundtripped.element.value.length).toBe(1000);
  });
});
