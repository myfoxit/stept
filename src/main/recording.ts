import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
let uIOhook: any;
let UiohookKey: any;
try {
  const mod = require('uiohook-napi');
  uIOhook = mod.uIOhook;
  UiohookKey = mod.UiohookKey;
} catch (e) {
  console.warn('uiohook-napi not available:', (e as Error).message);
}
import { ScreenshotService, PointQueryResult } from './screenshot';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

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
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  startTime?: Date;
  stepCount: number;
  captureArea?: CaptureArea;
}

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
  private hooksStarted = false;
  private clickProcessing = false; // Prevent concurrent click handling

  constructor() {
    super();
    this.screenshotService = new ScreenshotService();
    this.setupGlobalHooks();
  }

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

      this.startGlobalHooks();
      this.emitStateChanged();

      const nativeStatus = this.screenshotService.isNativeAvailable() ? 'native APIs active' : 'fallback mode';
      console.log(`Recording started (${nativeStatus}):`, { captureArea, projectId });
    } catch (error) {
      this.isRecording = false;
      throw new Error(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async stopRecording(): Promise<void> {
    if (!this.isRecording) return;

    try {
      this.flushTypedText();
      this.stopGlobalHooks();
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
  // Global input hooks
  // ------------------------------------------------------------------

  private setupGlobalHooks(): void {
    if (!uIOhook) {
      console.warn('uiohook-napi not available — recording will not capture input');
      return;
    }

    uIOhook.on('mousedown', (event: any) => {
      if (!this.isRecording || this.isPaused) return;
      if (this.captureArea && !this.isPointInCaptureArea(event.x, event.y)) return;
      this.handleMouseClick(event);
    });

    uIOhook.on('keydown', (event: any) => {
      if (!this.isRecording) return;

      if (event.keycode === UiohookKey?.F9) {
        if (this.isPaused) this.resumeRecording();
        else this.pauseRecording();
        return;
      }

      if (this.isPaused) return;
      this.handleKeyPress(event);
    });

    // Mouse scroll handler
    uIOhook.on('wheel', (event: any) => {
      if (!this.isRecording || this.isPaused) return;
      if (this.captureArea && !this.isPointInCaptureArea(event.x, event.y)) return;
      this.handleScroll(event);
    });
  }

  private startGlobalHooks(): void {
    if (this.hooksStarted || !uIOhook) return;
    try {
      uIOhook.start();
      this.hooksStarted = true;
      console.log('Global hooks started');
    } catch (error) {
      console.error('Failed to start global hooks:', error);
      throw new Error('Failed to start global input monitoring');
    }
  }

  private stopGlobalHooks(): void {
    if (!this.hooksStarted || !uIOhook) return;
    try {
      uIOhook.stop();
      this.hooksStarted = false;
      console.log('Global hooks stopped');
    } catch (error) {
      console.error('Failed to stop global hooks:', error);
    }
  }

  // ------------------------------------------------------------------
  // Click handler — uses native OS APIs for accurate info
  // ------------------------------------------------------------------

  private async handleMouseClick(event: any): Promise<void> {
    // Prevent concurrent click processing (screenshot + native query takes time)
    if (this.clickProcessing) return;
    this.clickProcessing = true;

    try {
      this.flushTypedText();

      // uiohook reports coordinates in LOGICAL screen space (top-left origin)
      const clickPoint = { x: event.x, y: event.y };

      // Query native OS for full info: window, element, scale factor
      const fullInfo = await this.screenshotService.getFullInfoAtPoint(clickPoint);
      const scaleFactor = fullInfo?.scaleFactor ?? this.screenshotService.getScaleFactorAtPoint(clickPoint.x, clickPoint.y);

      // Extract window info
      const windowTitle = fullInfo?.window?.title || 'Unknown Window';
      const ownerApp = fullInfo?.window?.ownerName || '';
      const windowBounds = fullInfo?.window?.bounds || { x: 0, y: 0, width: 1920, height: 1080 };
      const windowPID = fullInfo?.window?.ownerPID || 0;

      // Extract element info (accessibility)
      const elementName = this.formatElementName(fullInfo?.element);
      const elementRole = fullInfo?.element?.role || '';
      const elementDescription = fullInfo?.element?.description || fullInfo?.element?.title || '';

      // Determine capture region
      const captureRegion = this.getCaptureRegion();

      // Click position relative to capture region (logical coords)
      const screenshotRelative = {
        x: Math.max(0, Math.min(clickPoint.x - captureRegion.x, captureRegion.width - 1)),
        y: Math.max(0, Math.min(clickPoint.y - captureRegion.y, captureRegion.height - 1)),
      };

      // Take DPI-aware annotated screenshot
      let screenshotPath: string | undefined;
      try {
        screenshotPath = await this.screenshotService.takeAnnotatedScreenshot(
          captureRegion,
          screenshotRelative,
          this.screenshotFolder!,
          ++this.stepCount,
          scaleFactor
        );
      } catch (error) {
        console.error('Failed to take screenshot:', error);
        this.stepCount++; // Still increment
      }

      // Button type
      const buttonTypes: Record<number, string> = { 1: 'Left', 2: 'Right', 3: 'Middle' };
      const buttonType = buttonTypes[event.button] || 'Unknown';

      // Build description
      let description = `${buttonType} clicked`;
      if (elementName) description += ` on "${elementName}"`;
      if (elementRole) description += ` (${elementRole})`;
      description += ` in ${windowTitle}`;
      if (ownerApp && ownerApp !== windowTitle) description += ` [${ownerApp}]`;

      const step: RecordedStep = {
        stepNumber: this.stepCount,
        timestamp: new Date(),
        actionType: `${buttonType} Click`,
        windowTitle,
        description,
        screenshotPath,
        globalMousePosition: clickPoint,
        relativeMousePosition: {
          x: clickPoint.x - windowBounds.x,
          y: clickPoint.y - windowBounds.y,
        },
        windowSize: {
          width: windowBounds.width,
          height: windowBounds.height,
        },
        screenshotRelativeMousePosition: screenshotRelative,
        screenshotSize: {
          width: captureRegion.width,
          height: captureRegion.height,
        },
        elementName: elementName || undefined,
        elementRole: elementRole || undefined,
        elementDescription: elementDescription || undefined,
        ownerApp: ownerApp || undefined,
      };

      this.emit('step-recorded', step);
    } catch (error) {
      console.error('Error handling mouse click:', error);
    } finally {
      this.clickProcessing = false;
    }
  }

  // ------------------------------------------------------------------
  // Scroll handler
  // ------------------------------------------------------------------

  private scrollTimeout?: NodeJS.Timeout;
  private scrollAccumulator = 0;

  private handleScroll(event: any): void {
    this.scrollAccumulator += event.rotation || 0;

    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);

    this.scrollTimeout = setTimeout(async () => {
      if (Math.abs(this.scrollAccumulator) < 3) {
        this.scrollAccumulator = 0;
        return; // Ignore tiny scrolls
      }

      const fullInfo = await this.screenshotService.getFullInfoAtPoint({ x: event.x, y: event.y });
      const windowTitle = fullInfo?.window?.title || 'Unknown Window';

      const step: RecordedStep = {
        stepNumber: ++this.stepCount,
        timestamp: new Date(),
        actionType: 'Scroll',
        windowTitle,
        description: `Scrolled ${this.scrollAccumulator > 0 ? 'down' : 'up'} in ${windowTitle}`,
        scrollDelta: this.scrollAccumulator,
        globalMousePosition: { x: event.x, y: event.y },
        relativeMousePosition: { x: 0, y: 0 },
        windowSize: {
          width: fullInfo?.window?.bounds.width || 0,
          height: fullInfo?.window?.bounds.height || 0,
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

  private handleKeyPress(event: any): void {
    if (this.isFlushKey(event.keycode)) {
      this.flushTypedText();
      return;
    }

    const char = this.keycodeToChar(event.keycode);
    if (char) {
      this.currentText += char;

      if (this.textFlushTimeout) clearTimeout(this.textFlushTimeout);
      this.textFlushTimeout = setTimeout(() => this.flushTypedText(), 2000);
    }
  }

  private flushTypedText(): void {
    if (!this.currentText) return;

    if (this.textFlushTimeout) {
      clearTimeout(this.textFlushTimeout);
      this.textFlushTimeout = undefined;
    }

    try {
      const windowInfo = this.screenshotService.getCurrentWindow();

      const step: RecordedStep = {
        stepNumber: ++this.stepCount,
        timestamp: new Date(),
        actionType: 'Type',
        windowTitle: windowInfo?.title || 'Unknown Window',
        description: `Typed: "${this.currentText}" in ${windowInfo?.title || 'Unknown Window'}`,
        textTyped: this.currentText,
        globalMousePosition: { x: 0, y: 0 },
        relativeMousePosition: { x: 0, y: 0 },
        windowSize: {
          width: windowInfo?.bounds.width || 0,
          height: windowInfo?.bounds.height || 0,
        },
        screenshotRelativeMousePosition: { x: 0, y: 0 },
        screenshotSize: { width: 0, height: 0 },
        ownerApp: windowInfo?.ownerName || undefined,
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

  private formatElementName(element: any): string {
    if (!element) return '';
    // Prefer title > description > value > role
    if (element.title) return element.title;
    if (element.description) return element.description;
    if (element.value && element.value.length < 50) return element.value;
    // Humanize role: "AXButton" → "Button"
    if (element.role) return element.role.replace(/^AX/, '');
    return '';
  }

  private isFlushKey(keycode: number): boolean {
    if (!UiohookKey) return false;
    return [UiohookKey.Enter, UiohookKey.Tab, UiohookKey.Escape].includes(keycode);
  }

  private keycodeToChar(keycode: number): string {
    if (!UiohookKey) return '';

    if (keycode >= UiohookKey.A && keycode <= UiohookKey.Z) {
      return String.fromCharCode(keycode - UiohookKey.A + 'a'.charCodeAt(0));
    }
    if (keycode >= UiohookKey['0'] && keycode <= UiohookKey['9']) {
      return String.fromCharCode(keycode - UiohookKey['0'] + '0'.charCodeAt(0));
    }
    if (keycode === UiohookKey.Space) return ' ';
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
  // Recording overlay
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

      // Make click-through on macOS
      if (process.platform === 'darwin') {
        this.overlayWindow.setIgnoreMouseEvents(true);
      }

      await this.overlayWindow.loadURL(`data:text/html,${encodeURIComponent(`
        <!DOCTYPE html><html><head><style>
          body { margin:0; width:100vw; height:100vh;
                 border:2px solid #ef4444; box-sizing:border-box;
                 background:transparent; pointer-events:none;
                 animation:pulse 2s ease-in-out infinite; }
          @keyframes pulse {
            0%,100% { border-color:#ef4444; }
            50% { border-color:#dc2626; box-shadow:inset 0 0 12px rgba(239,68,68,0.15); }
          }
        </style></head><body></body></html>
      `)}`);

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
    this.stopGlobalHooks();
    this.hideOverlay();
    if (this.textFlushTimeout) clearTimeout(this.textFlushTimeout);
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout);
    this.screenshotService.dispose();
    this.removeAllListeners();
  }
}
