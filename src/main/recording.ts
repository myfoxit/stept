import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import { ScreenshotService } from './screenshot';
import { ChildProcess, spawn } from 'child_process';
import { createInterface, Interface as ReadlineInterface } from 'readline';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// ---- Native hook event types ----

interface NativeClickEvent {
  type: 'click';
  x: number;
  y: number;
  button: number;
  window: NativeWindowInfo | null;
  element: NativeElementInfo | null;
  scale: number;
  monitorBounds?: { x: number; y: number; width: number; height: number };
  timestamp: number;
  screenshotPath?: string;
}

interface NativeKeyEvent {
  type: 'key';
  keycode: number;
  scancode?: number;  // Windows sends scancode too
  modifiers: string[];
  window: NativeWindowInfo | null;
  timestamp: number;
}

interface NativeScrollEvent {
  type: 'scroll';
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
  window: NativeWindowInfo | null;
  timestamp: number;
}

interface NativeReadyEvent {
  type: 'ready';
  platform: string;
  coordSpace: 'logical' | 'physical';
}

interface NativeWindowInfo {
  handle: number;
  title: string;
  ownerName: string;
  ownerPID: number;
  bounds: { x: number; y: number; width: number; height: number };
  isVisible: boolean;
  layer: number;
}

interface NativeElementInfo {
  role: string;
  title: string;
  value: string;
  description: string;
  subrole: string;
}

interface NativeDisplaysEvent {
  type: 'displays';
  displays: Array<{
    bounds: { x: number; y: number; width: number; height: number };
    scaleFactor: number;
    isPrimary: boolean;
  }>;
}

type NativeEvent = NativeClickEvent | NativeKeyEvent | NativeScrollEvent | NativeReadyEvent | NativeDisplaysEvent;

// ---- Public types ----

export interface CaptureArea {
  type: 'all-displays' | 'single-display' | 'window';
  displayId?: string;
  displayName?: string;
  windowHandle?: number;
  windowTitle?: string;
  bounds?: Rectangle;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecordedStep {
  stepNumber: number;
  timestamp: Date;
  actionType: string;
  windowTitle: string;
  description: string;
  screenshotPath?: string;
  globalMousePosition: { x: number; y: number };
  relativeMousePosition: { x: number; y: number };
  windowSize: { width: number; height: number };
  screenshotRelativeMousePosition: { x: number; y: number };
  screenshotSize: { width: number; height: number };
  textTyped?: string;
  scrollDelta?: number;
  elementName?: string;
  elementRole?: string;
  elementDescription?: string;
  ownerApp?: string;
  generatedTitle?: string;
  generatedDescription?: string;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  startTime?: Date;
  stepCount: number;
  captureArea?: CaptureArea;
}

// ---- macOS CGKeyCode → character map ----
// CGEventTap reports CGKeyCode (virtual keycodes), not hardware scancodes
const MAC_KEYCODE_MAP: Record<number, string> = {
  0: 'a', 1: 's', 2: 'd', 3: 'f', 4: 'h', 5: 'g', 6: 'z', 7: 'x',
  8: 'c', 9: 'v', 11: 'b', 12: 'q', 13: 'w', 14: 'e', 15: 'r',
  16: 'y', 17: 't', 18: '1', 19: '2', 20: '3', 21: '4', 22: '6',
  23: '5', 24: '=', 25: '9', 26: '7', 27: '-', 28: '8', 29: '0',
  30: ']', 31: 'o', 32: 'u', 33: '[', 34: 'i', 35: 'p', 37: 'l',
  38: 'j', 39: "'", 40: 'k', 41: ';', 42: '\\', 43: ',', 44: '/',
  45: 'n', 46: 'm', 47: '.', 49: ' ', 50: '`',
};

const MAC_NAMED_KEY_MAP: Record<number, string> = {
  36: 'Enter', 48: 'Tab', 51: 'Backspace', 53: 'Escape',
  117: 'Delete', 115: 'Home', 119: 'End',
  116: 'PageUp', 121: 'PageDown',
  123: 'Left', 124: 'Right', 125: 'Down', 126: 'Up',
  122: 'F1', 120: 'F2', 99: 'F3', 118: 'F4', 96: 'F5', 97: 'F6',
  98: 'F7', 100: 'F8', 101: 'F9', 109: 'F10', 103: 'F11', 111: 'F12',
};

// F9 keycode for pause/resume toggle
const MAC_F9 = 101;

// ---- Windows Virtual Key → character map ----
const WIN_VK_MAP: Record<number, string> = {
  // Letters A-Z (VK_A=0x41 to VK_Z=0x5A)
  0x41: 'a', 0x42: 'b', 0x43: 'c', 0x44: 'd', 0x45: 'e', 0x46: 'f',
  0x47: 'g', 0x48: 'h', 0x49: 'i', 0x4A: 'j', 0x4B: 'k', 0x4C: 'l',
  0x4D: 'm', 0x4E: 'n', 0x4F: 'o', 0x50: 'p', 0x51: 'q', 0x52: 'r',
  0x53: 's', 0x54: 't', 0x55: 'u', 0x56: 'v', 0x57: 'w', 0x58: 'x',
  0x59: 'y', 0x5A: 'z',
  // Numbers 0-9
  0x30: '0', 0x31: '1', 0x32: '2', 0x33: '3', 0x34: '4',
  0x35: '5', 0x36: '6', 0x37: '7', 0x38: '8', 0x39: '9',
  // Punctuation
  0xBA: ';', 0xBB: '=', 0xBC: ',', 0xBD: '-', 0xBE: '.', 0xBF: '/',
  0xC0: '`', 0xDB: '[', 0xDC: '\\', 0xDD: ']', 0xDE: "'",
  0x20: ' ', // Space
};

const WIN_NAMED_KEY_MAP: Record<number, string> = {
  0x08: 'Backspace', 0x09: 'Tab', 0x0D: 'Enter', 0x1B: 'Escape',
  0x2E: 'Delete', 0x2D: 'Insert', 0x24: 'Home', 0x23: 'End',
  0x21: 'PageUp', 0x22: 'PageDown',
  0x25: 'Left', 0x26: 'Up', 0x27: 'Right', 0x28: 'Down',
  0x2C: 'PrintScreen', 0x13: 'Pause',
  0x70: 'F1', 0x71: 'F2', 0x72: 'F3', 0x73: 'F4', 0x74: 'F5', 0x75: 'F6',
  0x76: 'F7', 0x77: 'F8', 0x78: 'F9', 0x79: 'F10', 0x7A: 'F11', 0x7B: 'F12',
};

// F9 = VK_F9
const WIN_F9 = 0x78;

// Windows modifier VK codes — ignore as standalone keypresses
const WIN_MODIFIER_VKS = [0x10, 0x11, 0x12, 0x5B, 0x5C, 0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5, 0x14];
// macOS modifier keycodes — ignore as standalone keypresses
const MAC_MODIFIER_KEYCODES = [54, 55, 56, 57, 58, 59, 60, 61, 62, 63];

export class RecordingService extends EventEmitter {
  private isRecording = false;
  private isPaused = false;
  private startTime?: Date;
  private stepCount = 0;
  private captureArea?: CaptureArea;
  private currentProjectId?: string;
  private screenshotFolder?: string;
  private screenshotService: ScreenshotService;
  private overlayWindow?: BrowserWindow;
  private currentText = '';
  private textFlushTimeout?: NodeJS.Timeout;
  private clickProcessing = false;
  private clickQueue: { event: NativeClickEvent; count: number; preCapture?: Buffer }[] = [];
  private lastClickTime = 0;
  private lastClickPos = { x: 0, y: 0 };
  private ignoredShortcuts: Set<string> = new Set();

  // Native hooks process
  private hooksProcess: ChildProcess | null = null;
  private hooksRl: ReadlineInterface | null = null;
  private coordSpace: 'logical' | 'physical' = 'logical';
  private coordScale = 1; // physical→logical conversion factor

  // Maps physical monitor bounds key → Electron Display (for Windows mixed-DPI)
  private physicalDisplayMap: Map<string, Electron.Display> = new Map();
  // Maps physical monitor bounds key → logical bounds (for proper toLogical conversion)
  private physicalToLogicalBounds: Map<string, { x: number; y: number; width: number; height: number }> = new Map();

  constructor() {
    super();
    this.screenshotService = new ScreenshotService();
  }

  /** Set shortcut combos that should NOT be recorded as steps (e.g. "Ctrl+Shift+Space") */
  public setIgnoredShortcuts(shortcuts: string[]): void {
    this.ignoredShortcuts.clear();
    for (const s of shortcuts) {
      // Normalize: sort modifiers, uppercase key
      this.ignoredShortcuts.add(s.toUpperCase());
      // Also add Cmd variant for macOS
      this.ignoredShortcuts.add(s.replace(/Ctrl/i, 'Cmd').toUpperCase());
    }
  }

  // ------------------------------------------------------------------
  // Recording lifecycle
  // ------------------------------------------------------------------

  public async startRecording(captureArea?: CaptureArea, projectId?: string): Promise<void> {
    if (this.isRecording) {
      throw new Error('Recording is already in progress');
    }

    try {
      this.captureArea = captureArea;
      this.currentProjectId = projectId;
      this.stepCount = 0;
      this.currentText = '';
      this.startTime = new Date();
      this.isRecording = true;
      this.isPaused = false;

      const sessionId = Date.now().toString();
      this.screenshotFolder = path.join(os.tmpdir(), 'Ondoki', sessionId);
      await fs.promises.mkdir(this.screenshotFolder, { recursive: true });

      if (captureArea && captureArea.type !== 'all-displays') {
        await this.showOverlay();
      }

      await this.startNativeHooks();
      this.emitStateChanged();

      console.log(`Recording started (native hooks, coordSpace=${this.coordSpace}):`, { captureArea, projectId });
    } catch (error) {
      this.isRecording = false;
      throw new Error(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async stopRecording(): Promise<void> {
    if (!this.isRecording) return;

    try {
      this.flushTypedText();
      this.stopNativeHooks();
      await this.hideOverlay();

      this.isRecording = false;
      this.isPaused = false;
      this.captureArea = undefined;
      this.currentProjectId = undefined;
      this.startTime = undefined;

      this.emitStateChanged();
      console.log('Recording stopped');
    } catch (error) {
      throw new Error(`Failed to stop recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public pauseRecording(): void {
    if (!this.isRecording || this.isPaused) return;
    this.flushTypedText();
    this.isPaused = true;
    this.emitStateChanged();
    console.log('Recording paused');
  }

  public resumeRecording(): void {
    if (!this.isRecording || !this.isPaused) return;
    this.isPaused = false;
    this.emitStateChanged();
    console.log('Recording resumed');
  }

  public getState(): RecordingState {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      startTime: this.startTime,
      stepCount: this.stepCount,
      captureArea: this.captureArea,
    };
  }

  // ------------------------------------------------------------------
  // Native hooks process
  // ------------------------------------------------------------------

  private async startNativeHooks(): Promise<void> {
    const binaryPath = this.screenshotService.getNativeBinaryPath();
    if (!binaryPath) {
      throw new Error('Native binary not found — cannot start input hooks');
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Native hooks process did not send ready message within 5 seconds'));
      }, 5000);

      this.hooksProcess = spawn(binaryPath, ['hooks'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.hooksRl = createInterface({ input: this.hooksProcess.stdout! });

      this.hooksRl.on('line', (line: string) => {
        try {
          const event = JSON.parse(line) as NativeEvent;
          if (event.type === 'ready') {
            clearTimeout(timeout);
            this.coordSpace = (event as NativeReadyEvent).coordSpace;
            // If physical coords, detect scale from screenshot dimensions
            if (this.coordSpace === 'physical') {
              const region = this.getCaptureRegion();
              this.screenshotService.getEffectiveScale(region).then(scale => {
                this.coordScale = scale;
                console.log(`Native hooks ready: coordSpace=${this.coordSpace}, coordScale=${this.coordScale}`);
              });
            } else {
              this.coordScale = 1;
              console.log(`Native hooks ready: coordSpace=${this.coordSpace}`);
            }
            resolve();
            return;
          }
          if (event.type === 'displays') {
            this.handleNativeDisplays((event as NativeDisplaysEvent).displays);
            return;
          }
          this.handleNativeEvent(event);
        } catch (e) {
          // Ignore unparseable lines
        }
      });

      this.hooksProcess.stderr?.on('data', (data: Buffer) => {
        console.warn('Native hooks stderr:', data.toString().trim());
      });

      this.hooksProcess.on('exit', (code, signal) => {
        console.warn(`Native hooks process exited (code=${code}, signal=${signal})`);
        this.hooksProcess = null;
        this.hooksRl = null;
      });

      this.hooksProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start native hooks: ${err.message}`));
      });
    });
  }

  private stopNativeHooks(): void {
    if (this.hooksProcess) {
      try {
        this.hooksProcess.kill();
      } catch {}
      this.hooksProcess = null;
    }
    if (this.hooksRl) {
      this.hooksRl.close();
      this.hooksRl = null;
    }
  }

  // ------------------------------------------------------------------
  // Native event dispatch
  // ------------------------------------------------------------------

  private handleNativeEvent(event: NativeEvent): void {
    if (!this.isRecording) return;

    switch (event.type) {
      case 'click':
        if (this.isPaused) return;
        this.handleNativeClick(event as NativeClickEvent);
        break;
      case 'key':
        this.handleNativeKey(event as NativeKeyEvent);
        break;
      case 'scroll':
        // Scroll events are intentionally not tracked (matches Scribe behavior)
        break;
    }
  }

  // ------------------------------------------------------------------
  // Coordinate normalization
  // ------------------------------------------------------------------

  /**
   * Convert raw native event coordinates to logical screen coordinates.
   *
   * macOS (coordSpace="logical"):  CGEventTap reports logical points → passthrough.
   *   The event.scale is the display's backingScaleFactor — it does NOT mean
   *   the coords need dividing; they're already logical.
   *
   * Windows (coordSpace="physical"):  Low-level hooks with Per-Monitor DPI V2
   *   report physical screen pixels → divide by the per-event scale to get logical.
   */
  private toLogical(x: number, y: number, eventScale?: number): { x: number; y: number } {
    // Only convert when the native binary reports physical coordinates (Windows).
    // macOS always reports logical — never divide, regardless of event.scale.
    if (this.coordSpace === 'physical') {
      const scale = eventScale ?? this.coordScale;
      if (scale > 1) {
        return {
          x: Math.round(x / scale),
          y: Math.round(y / scale),
        };
      }
    }
    return { x, y };
  }

  /**
   * Convert physical virtual-screen coordinates to Electron logical coordinates
   * using the physical→logical display mapping (handles mixed-DPI correctly).
   */
  private physicalToLogical(x: number, y: number, monitorBounds?: { x: number; y: number; width: number; height: number }, eventScale?: number): { x: number; y: number } {
    if (monitorBounds && this.physicalToLogicalBounds.size > 0) {
      const key = this.boundsKey(monitorBounds);
      const logicalBounds = this.physicalToLogicalBounds.get(key);
      if (logicalBounds) {
        const scale = eventScale ?? this.coordScale;
        return {
          x: Math.round(logicalBounds.x + (x - monitorBounds.x) / scale),
          y: Math.round(logicalBounds.y + (y - monitorBounds.y) / scale),
        };
      }
    }
    // Fallback to old method
    return this.toLogical(x, y, eventScale);
  }

  private boundsKey(b: { x: number; y: number; width: number; height: number }): string {
    return `${b.x},${b.y},${b.width},${b.height}`;
  }

  /**
   * Build mapping between native physical display bounds and Electron displays.
   * Matches by: primary first, then by physical size + spatial ordering.
   */
  private handleNativeDisplays(nativeDisplays: NativeDisplaysEvent['displays']): void {
    const { screen } = require('electron');
    const electronDisplays: Electron.Display[] = screen.getAllDisplays();

    this.physicalDisplayMap.clear();
    this.physicalToLogicalBounds.clear();

    // Group native displays by physical size
    const nativeBySize = new Map<string, typeof nativeDisplays>();
    for (const nd of nativeDisplays) {
      const key = `${nd.bounds.width}x${nd.bounds.height}`;
      if (!nativeBySize.has(key)) nativeBySize.set(key, []);
      nativeBySize.get(key)!.push(nd);
    }

    // Group Electron displays by physical size
    const electronBySize = new Map<string, Electron.Display[]>();
    for (const ed of electronDisplays) {
      const physW = Math.round(ed.bounds.width * ed.scaleFactor);
      const physH = Math.round(ed.bounds.height * ed.scaleFactor);
      const key = `${physW}x${physH}`;
      if (!electronBySize.has(key)) electronBySize.set(key, []);
      electronBySize.get(key)!.push(ed);
    }

    // Match within each physical-size group, ordered by x then y position
    for (const [sizeKey, natives] of nativeBySize) {
      const electrons = electronBySize.get(sizeKey);
      if (!electrons || electrons.length === 0) continue;

      // Sort both by x position (physical and logical ordering should match)
      natives.sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
      electrons.sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);

      for (let i = 0; i < Math.min(natives.length, electrons.length); i++) {
        const key = this.boundsKey(natives[i].bounds);
        this.physicalDisplayMap.set(key, electrons[i]);
        this.physicalToLogicalBounds.set(key, electrons[i].bounds);
        console.log(`[DIAG] Display map: physical(${key}) → electron(id=${electrons[i].id}, bounds=${JSON.stringify(electrons[i].bounds)}, scale=${electrons[i].scaleFactor})`);
      }
    }

    console.log(`[DIAG] Display mapping: ${this.physicalDisplayMap.size} of ${nativeDisplays.length} matched`);
  }

  /**
   * Find the Electron Display for a click's physical monitorBounds.
   */
  private findDisplayForMonitorBounds(monitorBounds: { x: number; y: number; width: number; height: number }): Electron.Display | undefined {
    return this.physicalDisplayMap.get(this.boundsKey(monitorBounds));
  }

  // ------------------------------------------------------------------
  // Click handler — events arrive pre-enriched from native binary
  // ------------------------------------------------------------------

  private pendingClick: { event: NativeClickEvent; timeout: NodeJS.Timeout; count: number; preCapture?: Buffer } | null = null;

  private handleNativeClick(event: NativeClickEvent): void {
    const pt = this.physicalToLogical(event.x, event.y, event.monitorBounds, (event as any).scale);

    // Check capture area
    if (this.captureArea && !this.isPointInCaptureArea(pt.x, pt.y)) return;

    const now = Date.now();
    const dx = Math.abs(pt.x - this.lastClickPos.x);
    const dy = Math.abs(pt.y - this.lastClickPos.y);
    const timeDiff = now - this.lastClickTime;
    const sameSpot = dx < 5 && dy < 5;
    const sameButton = event.button === (this.pendingClick?.event.button ?? event.button);

    this.lastClickTime = now;
    this.lastClickPos = { x: pt.x, y: pt.y };

    // Pre-capture screenshot immediately at click time (before debounce).
    // This captures what the user was looking at when they clicked — like Scribe/Tango.
    // Fire-and-forget; the promise resolves into pendingClick.preCapture.
    const capturePromise = this.preCaptureScreenshot(pt);

    if (this.pendingClick && sameSpot && sameButton && timeDiff < 300) {
      // Double/triple click — keep the FIRST click's pre-capture (shows pre-click state)
      clearTimeout(this.pendingClick.timeout);
      this.pendingClick.count++;
      const pending = this.pendingClick;
      this.pendingClick.timeout = setTimeout(() => {
        this.pendingClick = null;
        this.processClick(pending.event, pending.count, pending.preCapture);
      }, 80);
      return;
    }

    if (this.pendingClick) {
      // New click at different location — flush the old one
      clearTimeout(this.pendingClick.timeout);
      const pending = this.pendingClick;
      this.pendingClick = null;
      this.processClick(pending.event, pending.count, pending.preCapture);
    }

    // Store this click as pending, attach pre-capture when it resolves
    const newPending = {
      event,
      count: 1,
      preCapture: undefined as Buffer | undefined,
      timeout: null as any as NodeJS.Timeout,
    };
    newPending.timeout = setTimeout(() => {
      this.pendingClick = null;
      this.processClick(newPending.event, newPending.count, newPending.preCapture);
    }, 150);
    this.pendingClick = newPending;

    // Attach pre-capture buffer when ready (usually ~20-50ms)
    capturePromise.then(buf => {
      if (buf && this.pendingClick === newPending) {
        newPending.preCapture = buf;
      }
    });
  }

  /**
   * Capture a raw screenshot buffer immediately at click time.
   * Returns the display screenshot as a PNG buffer, or undefined on failure.
   */
  private async preCaptureScreenshot(clickPoint: { x: number; y: number }): Promise<Buffer | undefined> {
    try {
      return await this.screenshotService.captureScreen({ x: clickPoint.x, y: clickPoint.y });
    } catch (error) {
      console.warn('Pre-capture screenshot failed:', error);
      return undefined;
    }
  }

  private async processClick(event: NativeClickEvent, clickCount: number, preCapture?: Buffer): Promise<void> {
    if (this.clickProcessing) {
      this.clickQueue.push({ event, count: clickCount, preCapture });
      return;
    }
    this.clickProcessing = true;

    try {
      await this._processClickInner(event, clickCount, preCapture);
      while (this.clickQueue.length > 0) {
        const next = this.clickQueue.shift()!;
        try {
          await this._processClickInner(next.event, next.count, next.preCapture);
        } catch (error) {
          console.error('Error processing queued click:', error);
        }
      }
    } catch (error) {
      console.error('Error handling click:', error);
    } finally {
      this.clickProcessing = false;
    }
  }

  private async _processClickInner(event: NativeClickEvent, clickCount: number, preCapture?: Buffer): Promise<void> {
    this.flushTypedText();

    const clickPoint = this.physicalToLogical(event.x, event.y, event.monitorBounds, event.scale);
    console.log(`[DIAG] click raw=(${event.x},${event.y}) scale=${event.scale} logical=(${clickPoint.x},${clickPoint.y})`);
    const windowTitle = event.window?.title || 'Unknown Window';
    const ownerApp = event.window?.ownerName || '';
    const windowBounds = event.window?.bounds || { x: 0, y: 0, width: 1920, height: 1080 };
    const scaleFactor = event.scale || this.screenshotService.getScaleFactorAtPoint(clickPoint.x, clickPoint.y);

    // Skip clicks on the recording app itself — match by PID, not window title
    // (title matching catches Chrome tabs with "Ondoki" in them)
    const electronPID = process.pid;
    if (event.window?.ownerPID === electronPID) {
      console.log(`[DIAG] click filtered: own PID=${electronPID} title="${windowTitle}"`);
      return;
    }

    // Skip system UI — only if we have reliable window info
    if (ownerApp) {
      const systemApps = [
        'Dock', 'WindowManager', 'Spotlight', 'NotificationCenter',
        'SystemUIServer', 'Control Center', 'Mission Control',
        'loginwindow', 'ScreenSaverEngine', 'AirPlayUIAgent',
        'Window Server',
      ];
      if (systemApps.includes(ownerApp)) {
        console.log(`[DIAG] click filtered: systemApp="${ownerApp}"`);
        return;
      }
    }

    // Extract element info
    const elementName = this.formatElementName(event.element);
    const elementRole = event.element?.role || '';
    const elementDescription = event.element?.description || event.element?.title || '';

    // Screenshot — use the display where the click happened
    const captureRegion = this.getCaptureRegion();
    let screenshotBounds = captureRegion;
    if (!this.captureArea?.bounds) {
      // "all-displays" mode: find the display containing this click
      // Prefer physical monitor mapping (accurate on Windows mixed-DPI)
      if (event.monitorBounds) {
        const mappedDisplay = this.findDisplayForMonitorBounds(event.monitorBounds);
        if (mappedDisplay) {
          screenshotBounds = mappedDisplay.bounds;
        }
      }
      if (screenshotBounds === captureRegion) {
        // Fallback: match by logical click point
        const displays = this.screenshotService.getDisplaysSync();
        const clickDisplay = displays.find(d =>
          clickPoint.x >= d.bounds.x && clickPoint.x < d.bounds.x + d.bounds.width &&
          clickPoint.y >= d.bounds.y && clickPoint.y < d.bounds.y + d.bounds.height
        );
        if (clickDisplay) {
          screenshotBounds = clickDisplay.bounds;
        }
      }
    }
    const screenshotRelative = {
      x: Math.max(0, Math.min(clickPoint.x - screenshotBounds.x, screenshotBounds.width - 1)),
      y: Math.max(0, Math.min(clickPoint.y - screenshotBounds.y, screenshotBounds.height - 1)),
    };
    console.log(`[DIAG] screenshotBounds=${JSON.stringify(screenshotBounds)} screenshotRelative=(${screenshotRelative.x},${screenshotRelative.y})`);

    // On Windows with mixed DPI, physical hook coords don't match Electron's logical
    // display bounds. Use the native monitor's physical bounds for accurate annotation.
    let physicalAnnotation: { x: number; y: number } | undefined;
    if (event.monitorBounds) {
      physicalAnnotation = {
        x: event.x - event.monitorBounds.x,
        y: event.y - event.monitorBounds.y,
      };
      console.log(`[DIAG] monitorBounds=${JSON.stringify(event.monitorBounds)} physicalAnnotation=(${physicalAnnotation.x},${physicalAnnotation.y})`);
    }

    let screenshotPath: string | undefined;
    try {
      // Use native pre-click screenshot if available (captured synchronously in event tap)
      let nativePreCapture = preCapture;
      if (!nativePreCapture && event.screenshotPath) {
        try {
          const fs = require('fs');
          nativePreCapture = fs.readFileSync(event.screenshotPath);
          // Clean up temp file
          fs.unlink(event.screenshotPath, () => {});
        } catch (e) {
          console.error('[DIAG] Failed to read native screenshot:', e);
        }
      }
      
      screenshotPath = await this.screenshotService.takeAnnotatedScreenshot(
        screenshotBounds,
        screenshotRelative,
        this.screenshotFolder!,
        ++this.stepCount,
        scaleFactor,
        nativePreCapture,  // Native pre-click screenshot (synchronous, correct state)
        physicalAnnotation  // Physical pixel offset for accurate multi-monitor annotation
      );
    } catch (error) {
      console.error('Failed to take screenshot:', error);
      this.stepCount++;
    }

    // Build description
    const buttonTypes: Record<number, string> = { 1: 'Left', 2: 'Right', 3: 'Middle' };
    const buttonType = buttonTypes[event.button] || 'Left';
    const clickLabel = clickCount >= 3 ? 'Triple Click' : clickCount === 2 ? 'Double Click' : `${buttonType} Click`;

    // Simple description — LLM will construct the real one from metadata
    const description = `${clickLabel} here`;

    const step: RecordedStep = {
      stepNumber: this.stepCount,
      timestamp: new Date(),
      actionType: clickLabel,
      windowTitle,
      description,
      screenshotPath,
      globalMousePosition: clickPoint,
      relativeMousePosition: {
        x: clickPoint.x - windowBounds.x,
        y: clickPoint.y - windowBounds.y,
      },
      windowSize: { width: windowBounds.width, height: windowBounds.height },
      screenshotRelativeMousePosition: physicalAnnotation ?? screenshotRelative,
      screenshotSize: event.monitorBounds
        ? { width: event.monitorBounds.width, height: event.monitorBounds.height }
        : { width: screenshotBounds.width, height: screenshotBounds.height },
      elementName: elementName || undefined,
      elementRole: elementRole || undefined,
      elementDescription: elementDescription || undefined,
      ownerApp: ownerApp || undefined,
    };

    this.emit('step-recorded', step);
  }

  // ------------------------------------------------------------------
  // Scroll handler
  // ------------------------------------------------------------------

  private scrollTimeout?: NodeJS.Timeout;
  private scrollAccumulator = 0;
  private lastScrollWindow: NativeWindowInfo | null = null;

  private handleNativeScroll(event: NativeScrollEvent): void {
    this.scrollAccumulator += event.deltaY;
    this.lastScrollWindow = event.window;

    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);

    const pt = this.toLogical(event.x, event.y, (event as any).scale);

    this.scrollTimeout = setTimeout(() => {
      if (Math.abs(this.scrollAccumulator) < 2) {
        this.scrollAccumulator = 0;
        return;
      }

      const windowTitle = this.lastScrollWindow?.title || 'Unknown Window';

      const step: RecordedStep = {
        stepNumber: ++this.stepCount,
        timestamp: new Date(),
        actionType: 'Scroll',
        windowTitle,
        description: `Scrolled ${this.scrollAccumulator > 0 ? 'down' : 'up'} in ${windowTitle}`,
        scrollDelta: this.scrollAccumulator,
        globalMousePosition: pt,
        relativeMousePosition: { x: 0, y: 0 },
        windowSize: {
          width: this.lastScrollWindow?.bounds.width || 0,
          height: this.lastScrollWindow?.bounds.height || 0,
        },
        screenshotRelativeMousePosition: { x: 0, y: 0 },
        screenshotSize: { width: 0, height: 0 },
      };

      this.emit('step-recorded', step);
      this.scrollAccumulator = 0;
    }, 500);
  }

  // ------------------------------------------------------------------
  // Keyboard handler
  // ------------------------------------------------------------------

  private handleNativeKey(event: NativeKeyEvent): void {
    const isMac = process.platform === 'darwin';
    const keycode = event.keycode;

    // F9 = pause/resume toggle
    const f9Key = isMac ? MAC_F9 : WIN_F9;
    if (keycode === f9Key) {
      if (this.isPaused) this.resumeRecording();
      else this.pauseRecording();
      return;
    }

    if (this.isPaused) return;

    // Ignore pure modifier keypresses
    const modifierKeys = isMac ? MAC_MODIFIER_KEYCODES : WIN_MODIFIER_VKS;
    if (modifierKeys.includes(keycode)) return;

    const charMap = isMac ? MAC_KEYCODE_MAP : WIN_VK_MAP;
    const namedMap = isMac ? MAC_NAMED_KEY_MAP : WIN_NAMED_KEY_MAP;
    const flushKeys = isMac
      ? [36, 48, 53]   // Enter, Tab, Escape (macOS CGKeyCode)
      : [0x0D, 0x09, 0x1B]; // Enter, Tab, Escape (Windows VK)

    // Flush on Enter/Tab/Escape
    if (flushKeys.includes(keycode)) {
      this.flushTypedText(event.window);
      return;
    }

    const hasModifier = event.modifiers.includes('ctrl') || event.modifiers.includes('alt') || event.modifiers.includes('meta');

    if (hasModifier) {
      // Keyboard shortcut
      const char = charMap[keycode];
      const named = namedMap[keycode];
      // Normalize: space char → "Space" to match shortcut naming convention
      const keyLabel = char === ' ' ? 'Space' : char ? char.toUpperCase() : named;
      if (!keyLabel) return;

      const mods: string[] = [];
      if (event.modifiers.includes('ctrl')) mods.push('Ctrl');
      if (event.modifiers.includes('meta')) mods.push(isMac ? 'Cmd' : 'Win');
      if (event.modifiers.includes('alt')) mods.push(isMac ? 'Option' : 'Alt');
      if (event.modifiers.includes('shift')) mods.push('Shift');
      const combo = [...mods, keyLabel].join('+');

      // Skip ignored shortcuts BEFORE flushing text (avoid spurious text steps)
      if (this.ignoredShortcuts.has(combo.toUpperCase())) {
        console.log(`[DIAG] keyboard shortcut filtered: "${combo}" (configured shortcut)`);
        return;
      }

      this.flushTypedText(event.window);

      const windowTitle = event.window?.title || 'Unknown Window';

      const step: RecordedStep = {
        stepNumber: ++this.stepCount,
        timestamp: new Date(),
        actionType: 'Keyboard Shortcut',
        windowTitle,
        description: `Pressed ${combo} in ${windowTitle}`,
        textTyped: combo,
        globalMousePosition: { x: 0, y: 0 },
        relativeMousePosition: { x: 0, y: 0 },
        windowSize: { width: event.window?.bounds.width || 0, height: event.window?.bounds.height || 0 },
        screenshotRelativeMousePosition: { x: 0, y: 0 },
        screenshotSize: { width: 0, height: 0 },
        ownerApp: event.window?.ownerName || undefined,
      };
      this.emit('step-recorded', step);
      return;
    }

    // Regular typing
    const char = charMap[keycode];
    if (char) {
      this.currentText += char;
      if (this.textFlushTimeout) clearTimeout(this.textFlushTimeout);
      this.textFlushTimeout = setTimeout(() => this.flushTypedText(event.window), 2000);
      return;
    }

    // Named key without modifiers
    const namedKey = namedMap[keycode];
    if (namedKey) {
      if (namedKey === 'Backspace') {
        this.currentText += '[⌫]';
        if (this.textFlushTimeout) clearTimeout(this.textFlushTimeout);
        this.textFlushTimeout = setTimeout(() => this.flushTypedText(event.window), 2000);
        return;
      }

      this.flushTypedText(event.window);

      const windowTitle = event.window?.title || 'Unknown Window';
      const step: RecordedStep = {
        stepNumber: ++this.stepCount,
        timestamp: new Date(),
        actionType: 'Key Press',
        windowTitle,
        description: `Pressed ${namedKey} in ${windowTitle}`,
        textTyped: namedKey,
        globalMousePosition: { x: 0, y: 0 },
        relativeMousePosition: { x: 0, y: 0 },
        windowSize: { width: event.window?.bounds.width || 0, height: event.window?.bounds.height || 0 },
        screenshotRelativeMousePosition: { x: 0, y: 0 },
        screenshotSize: { width: 0, height: 0 },
        ownerApp: event.window?.ownerName || undefined,
      };
      this.emit('step-recorded', step);
    }
  }

  private flushTypedText(windowInfo?: NativeWindowInfo | null): void {
    if (!this.currentText) return;

    if (this.textFlushTimeout) {
      clearTimeout(this.textFlushTimeout);
      this.textFlushTimeout = undefined;
    }

    try {
      let windowTitle = windowInfo?.title || '';
      const ownerApp = windowInfo?.ownerName || '';
      if (!windowTitle) {
        // Fallback: ask native binary for current window
        const nativeWindow = this.screenshotService.getCurrentWindow();
        windowTitle = nativeWindow?.title || '';
      }
      if (!windowTitle) {
        const focused = BrowserWindow.getFocusedWindow();
        windowTitle = focused?.getTitle() || 'Unknown Window';
      }

      const step: RecordedStep = {
        stepNumber: ++this.stepCount,
        timestamp: new Date(),
        actionType: 'Type',
        windowTitle,
        description: `Typed: "${this.currentText}" in ${windowTitle}`,
        textTyped: this.currentText,
        globalMousePosition: { x: 0, y: 0 },
        relativeMousePosition: { x: 0, y: 0 },
        windowSize: {
          width: windowInfo?.bounds.width || 0,
          height: windowInfo?.bounds.height || 0,
        },
        screenshotRelativeMousePosition: { x: 0, y: 0 },
        screenshotSize: { width: 0, height: 0 },
        ownerApp: ownerApp || undefined,
      };

      this.emit('step-recorded', step);
      this.currentText = '';
    } catch (error) {
      console.error('Error flushing typed text:', error);
      this.currentText = '';
    }
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private formatElementName(element: NativeElementInfo | null): string {
    if (!element) return '';
    if (element.title) return element.title;
    if (element.description) return element.description;
    if (element.value && element.value.length < 50) return element.value;
    if (element.role) return element.role.replace(/^AX/, '');
    return '';
  }

  private isPointInCaptureArea(x: number, y: number): boolean {
    if (!this.captureArea) return true;
    if (this.captureArea.type === 'all-displays') return true;
    if (!this.captureArea.bounds) return true;

    const { bounds } = this.captureArea;
    return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height;
  }

  private getCaptureRegion(): Rectangle {
    if (this.captureArea?.bounds) return this.captureArea.bounds;
    const displays = this.screenshotService.getDisplaysSync();
    const primary = displays.find(d => d.isPrimary) || displays[0];
    return primary?.bounds || { x: 0, y: 0, width: 1920, height: 1080 };
  }

  // ------------------------------------------------------------------
  // Overlay
  // ------------------------------------------------------------------

  private async showOverlay(): Promise<void> {
    if (!this.captureArea?.bounds) return;

    try {
      this.overlayWindow = new BrowserWindow({
        x: this.captureArea.bounds.x,
        y: this.captureArea.bounds.y,
        width: this.captureArea.bounds.width,
        height: this.captureArea.bounds.height,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
        resizable: false,
        movable: false,
        minimizable: false,
        maximizable: false,
        hasShadow: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });

      this.overlayWindow.setIgnoreMouseEvents(true);
      this.overlayWindow.setContentProtection(true);
      this.overlayWindow.setVisibleOnAllWorkspaces(true);

      // On macOS, use screen-saver level so the overlay floats above everything
      // without intercepting input or appearing in screen captures
      if (process.platform === 'darwin') {
        this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      }

      const overlayHtml = `<!DOCTYPE html><html><head><style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
        .border-overlay {
          position: absolute;
          inset: 0;
          border: 2.5px dashed rgba(139, 92, 246, 0.85);
          border-radius: 4px;
          pointer-events: none;
          animation: march 1s linear infinite, glow 2s ease-in-out infinite;
        }
        @keyframes march {
          to { border-dash-offset: 20px; }
        }
        /* Marching ants via rotating background on a pseudo-element */
        .border-overlay::before {
          content: '';
          position: absolute;
          inset: -3px;
          border: 2.5px solid transparent;
          border-radius: 4px;
          background: repeating-linear-gradient(
            90deg,
            rgba(139, 92, 246, 0.9) 0px,
            rgba(139, 92, 246, 0.9) 6px,
            transparent 6px,
            transparent 12px
          ) border-box;
          -webkit-mask: linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          animation: dash-march 0.4s linear infinite;
        }
        @keyframes dash-march {
          to { background-position: 12px 0; }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 6px rgba(139, 92, 246, 0.25); }
          50% { box-shadow: 0 0 12px rgba(139, 92, 246, 0.45); }
        }
        .corner { position: absolute; width: 12px; height: 12px; }
        .corner::before, .corner::after {
          content: ''; position: absolute; background: rgba(139, 92, 246, 0.9); border-radius: 1px;
        }
        .corner-tl { top: -1px; left: -1px; }
        .corner-tl::before { width: 12px; height: 2.5px; top: 0; left: 0; }
        .corner-tl::after { width: 2.5px; height: 12px; top: 0; left: 0; }
        .corner-tr { top: -1px; right: -1px; }
        .corner-tr::before { width: 12px; height: 2.5px; top: 0; right: 0; }
        .corner-tr::after { width: 2.5px; height: 12px; top: 0; right: 0; }
        .corner-bl { bottom: -1px; left: -1px; }
        .corner-bl::before { width: 12px; height: 2.5px; bottom: 0; left: 0; }
        .corner-bl::after { width: 2.5px; height: 12px; bottom: 0; left: 0; }
        .corner-br { bottom: -1px; right: -1px; }
        .corner-br::before { width: 12px; height: 2.5px; bottom: 0; right: 0; }
        .corner-br::after { width: 2.5px; height: 12px; bottom: 0; right: 0; }
      </style></head><body>
        <div class="border-overlay">
          <div class="corner corner-tl"></div>
          <div class="corner corner-tr"></div>
          <div class="corner corner-bl"></div>
          <div class="corner corner-br"></div>
        </div>
      </body></html>`;

      await this.overlayWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml)}`);
      this.overlayWindow.show();

      if (this.captureArea.type === 'window' && this.captureArea.windowHandle) {
        this.startWindowTracking();
      }
    } catch (error) {
      console.error('Failed to show overlay:', error);
    }
  }

  private async hideOverlay(): Promise<void> {
    if (this.overlayWindow) {
      this.overlayWindow.close();
      this.overlayWindow = undefined;
    }
  }

  private startWindowTracking(): void {
    const trackingInterval = setInterval(async () => {
      if (!this.isRecording || !this.overlayWindow || !this.captureArea?.windowHandle) {
        clearInterval(trackingInterval);
        return;
      }
      try {
        const windowInfo = await this.screenshotService.getWindowByHandle(this.captureArea.windowHandle);
        if (windowInfo && this.overlayWindow) {
          this.overlayWindow.setBounds({
            x: windowInfo.bounds.x,
            y: windowInfo.bounds.y,
            width: windowInfo.bounds.width,
            height: windowInfo.bounds.height,
          });
          this.captureArea.bounds = windowInfo.bounds;
        }
      } catch {
        clearInterval(trackingInterval);
      }
    }, 200);
  }

  private emitStateChanged(): void {
    this.emit('state-changed', this.getState());
  }

  public dispose(): void {
    this.stopNativeHooks();
    this.hideOverlay();
    if (this.textFlushTimeout) clearTimeout(this.textFlushTimeout);
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    if (this.pendingClick) { clearTimeout(this.pendingClick.timeout); this.pendingClick = null; }
    this.screenshotService.dispose();
    this.removeAllListeners();
  }
}
