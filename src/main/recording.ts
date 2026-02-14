import { EventEmitter } from 'events';
import { BrowserWindow } from 'electron';
import { uIOhook, UiohookKey, UiohookMouseEvent, UiohookKeyboardEvent } from 'uiohook-napi';
import { ScreenshotService } from './screenshot';
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
  
  // Track global hooks state
  private hooksStarted = false;

  constructor() {
    super();
    this.screenshotService = new ScreenshotService();
    
    // Set up global input hooks
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

      // Create screenshot folder
      const sessionId = Date.now().toString();
      this.screenshotFolder = path.join(os.tmpdir(), 'Ondoki', sessionId);
      await fs.promises.mkdir(this.screenshotFolder, { recursive: true });

      // Show overlay for area highlighting (except for all-displays mode)
      if (captureArea && captureArea.type !== 'all-displays') {
        await this.showOverlay();
      }

      // Start global input hooks
      this.startGlobalHooks();

      this.emitStateChanged();
      console.log('Recording started:', { captureArea, projectId });
      
    } catch (error) {
      this.isRecording = false;
      throw new Error(`Failed to start recording: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async stopRecording(): Promise<void> {
    if (!this.isRecording) {
      return;
    }

    try {
      // Flush any pending text
      this.flushTypedText();

      // Stop global input hooks
      this.stopGlobalHooks();

      // Hide overlay
      await this.hideOverlay();

      // Reset state
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
    if (!this.isRecording || this.isPaused) {
      return;
    }

    // Flush any pending text before pausing
    this.flushTypedText();
    
    this.isPaused = true;
    this.emitStateChanged();
    console.log('Recording paused');
  }

  public resumeRecording(): void {
    if (!this.isRecording || !this.isPaused) {
      return;
    }

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

  private setupGlobalHooks(): void {
    // Mouse event handler
    uIOhook.on('mousedown', (event: UiohookMouseEvent) => {
      if (!this.isRecording || this.isPaused) return;
      
      // Check if click is within capture area
      if (this.captureArea && !this.isPointInCaptureArea(event.x, event.y)) {
        return;
      }

      this.handleMouseClick(event);
    });

    // Keyboard event handler
    uIOhook.on('keydown', (event: UiohookKeyboardEvent) => {
      if (!this.isRecording) return;

      // Handle pause key (using F9 as pause toggle)
      if (event.keycode === UiohookKey.F9) {
        if (this.isPaused) {
          this.resumeRecording();
        } else {
          this.pauseRecording();
        }
        return;
      }

      if (this.isPaused) return;

      this.handleKeyPress(event);
    });
  }

  private startGlobalHooks(): void {
    if (this.hooksStarted) {
      return;
    }

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
    if (!this.hooksStarted) {
      return;
    }

    try {
      uIOhook.stop();
      this.hooksStarted = false;
      console.log('Global hooks stopped');
    } catch (error) {
      console.error('Failed to stop global hooks:', error);
    }
  }

  private async handleMouseClick(event: UiohookMouseEvent): Promise<void> {
    try {
      // Flush any pending text
      this.flushTypedText();

      const clickPoint = { x: event.x, y: event.y };
      
      // Get window information at click point
      const windowInfo = await this.screenshotService.getWindowAtPoint(clickPoint);
      
      // Determine capture region
      const captureRegion = this.getCaptureRegion();
      
      // Calculate relative positions
      const screenshotRelative = {
        x: clickPoint.x - captureRegion.x,
        y: clickPoint.y - captureRegion.y,
      };

      // Take screenshot and annotate with click point
      let screenshotPath: string | undefined;
      try {
        screenshotPath = await this.screenshotService.takeAnnotatedScreenshot(
          captureRegion,
          screenshotRelative,
          this.screenshotFolder!,
          ++this.stepCount
        );
      } catch (error) {
        console.error('Failed to take screenshot:', error);
        // Continue without screenshot
      }

      // Determine button type
      let buttonType = 'Unknown';
      switch (event.button) {
        case 1:
          buttonType = 'Left';
          break;
        case 2:
          buttonType = 'Right';
          break;
        case 3:
          buttonType = 'Middle';
          break;
      }

      const step: RecordedStep = {
        stepNumber: this.stepCount,
        timestamp: new Date(),
        actionType: `${buttonType} Click`,
        windowTitle: windowInfo.title,
        description: `Clicked at (${clickPoint.x}, ${clickPoint.y}) in ${windowInfo.title}`,
        screenshotPath,
        globalMousePosition: clickPoint,
        relativeMousePosition: {
          x: clickPoint.x - windowInfo.bounds.x,
          y: clickPoint.y - windowInfo.bounds.y,
        },
        windowSize: {
          width: windowInfo.bounds.width,
          height: windowInfo.bounds.height,
        },
        screenshotRelativeMousePosition: screenshotRelative,
        screenshotSize: {
          width: captureRegion.width,
          height: captureRegion.height,
        },
      };

      this.emit('step-recorded', step);
      
    } catch (error) {
      console.error('Error handling mouse click:', error);
    }
  }

  private handleKeyPress(event: UiohookKeyboardEvent): void {
    // Handle special keys that should flush text
    if (this.isFlushKey(event.keycode)) {
      this.flushTypedText();
      return;
    }

    // Convert keycode to character
    const char = this.keycodeToChar(event.keycode);
    if (char) {
      this.currentText += char;
      
      // Reset text flush timeout
      if (this.textFlushTimeout) {
        clearTimeout(this.textFlushTimeout);
      }
      
      // Auto-flush text after 2 seconds of no typing
      this.textFlushTimeout = setTimeout(() => {
        this.flushTypedText();
      }, 2000);
    }
  }

  private flushTypedText(): void {
    if (!this.currentText) {
      return;
    }

    if (this.textFlushTimeout) {
      clearTimeout(this.textFlushTimeout);
      this.textFlushTimeout = undefined;
    }

    try {
      // Get current window info
      const windowInfo = this.screenshotService.getCurrentWindow();
      
      const step: RecordedStep = {
        stepNumber: ++this.stepCount,
        timestamp: new Date(),
        actionType: 'Type',
        windowTitle: windowInfo?.title || 'Unknown Window',
        description: `Typed: ${this.currentText}`,
        textTyped: this.currentText,
        globalMousePosition: { x: 0, y: 0 },
        relativeMousePosition: { x: 0, y: 0 },
        windowSize: { 
          width: windowInfo?.bounds.width || 0, 
          height: windowInfo?.bounds.height || 0 
        },
        screenshotRelativeMousePosition: { x: 0, y: 0 },
        screenshotSize: { width: 0, height: 0 },
      };

      this.emit('step-recorded', step);
      this.currentText = '';
      
    } catch (error) {
      console.error('Error flushing typed text:', error);
      this.currentText = '';
    }
  }

  private isFlushKey(keycode: number): boolean {
    return [
      UiohookKey.Enter as number,
      UiohookKey.Tab as number,
      UiohookKey.Escape as number,
    ].includes(keycode);
  }

  private keycodeToChar(keycode: number): string {
    // Basic character mapping - could be extended
    if (keycode >= UiohookKey.A && keycode <= UiohookKey.Z) {
      return String.fromCharCode(keycode - UiohookKey.A + 'a'.charCodeAt(0));
    }
    
    if (keycode >= UiohookKey["0"] && keycode <= UiohookKey["9"]) {
      return String.fromCharCode(keycode - UiohookKey["0"] + '0'.charCodeAt(0));
    }
    
    if (keycode === UiohookKey.Space) {
      return ' ';
    }
    
    // Add more character mappings as needed
    return '';
  }

  private isPointInCaptureArea(x: number, y: number): boolean {
    if (!this.captureArea) {
      return true;
    }

    // For "all displays" we allow all points
    if (this.captureArea.type === 'all-displays') {
      return true;
    }

    if (!this.captureArea.bounds) {
      return true;
    }

    const { bounds } = this.captureArea;
    return (
      x >= bounds.x &&
      x < bounds.x + bounds.width &&
      y >= bounds.y &&
      y < bounds.y + bounds.height
    );
  }

  private getCaptureRegion(): Rectangle {
    if (this.captureArea?.bounds) {
      return this.captureArea.bounds;
    }

    // Default to primary display bounds
    const displays = this.screenshotService.getDisplaysSync();
    const primaryDisplay = displays.find(d => d.isPrimary) || displays[0];
    
    return primaryDisplay?.bounds || { x: 0, y: 0, width: 1920, height: 1080 };
  }

  private async showOverlay(): Promise<void> {
    if (!this.captureArea?.bounds) {
      return;
    }

    try {
      // Create overlay window
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
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      // Load overlay HTML
      await this.overlayWindow.loadURL(`data:text/html,${encodeURIComponent(this.getOverlayHTML())}`);
      
      // Show overlay
      this.overlayWindow.show();
      
      // Track window movements for window capture
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
    // Track window position changes for window capture mode
    // This would need platform-specific implementation
    // For now, we'll update the overlay position periodically
    const trackingInterval = setInterval(async () => {
      if (!this.isRecording || !this.overlayWindow || !this.captureArea?.windowHandle) {
        clearInterval(trackingInterval);
        return;
      }

      try {
        const windowInfo = await this.screenshotService.getWindowByHandle(this.captureArea.windowHandle);
        if (windowInfo && this.overlayWindow) {
          this.overlayWindow.setBounds(windowInfo.bounds);
          this.captureArea.bounds = windowInfo.bounds;
        }
      } catch (error) {
        // Window might have been closed
        clearInterval(trackingInterval);
      }
    }, 100);
  }

  private getOverlayHTML(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            margin: 0;
            padding: 0;
            width: 100vw;
            height: 100vh;
            border: 3px solid #ef4444;
            box-sizing: border-box;
            background: transparent;
            pointer-events: none;
            animation: pulse-border 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
          }
          
          @keyframes pulse-border {
            0%, 100% {
              border-color: #ef4444;
              box-shadow: inset 0 0 0 0 rgba(239, 68, 68, 0.1);
            }
            50% {
              border-color: #dc2626;
              box-shadow: inset 0 0 20px 0 rgba(239, 68, 68, 0.2);
            }
          }
        </style>
      </head>
      <body></body>
      </html>
    `;
  }

  private emitStateChanged(): void {
    this.emit('state-changed', this.getState());
  }

  // Cleanup method
  public dispose(): void {
    this.stopGlobalHooks();
    this.hideOverlay();
    
    if (this.textFlushTimeout) {
      clearTimeout(this.textFlushTimeout);
    }
    
    this.removeAllListeners();
  }
}