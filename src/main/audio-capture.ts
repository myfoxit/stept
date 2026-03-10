import { EventEmitter } from 'events';
import { BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: string;
}

export interface AudioCaptureResult {
  filePath: string;
  duration: number;
}

/**
 * Captures microphone audio using a hidden BrowserWindow with MediaRecorder.
 * Main process cannot use MediaRecorder directly — the hidden window handles
 * the Web Audio API and streams chunks back via IPC.
 */
export class AudioCaptureService extends EventEmitter {
  private hiddenWindow: BrowserWindow | null = null;
  private isCapturing = false;
  private isPaused = false;
  private audioChunks: Buffer[] = [];
  private startTime = 0;
  private outputDir: string;
  private ipcRegistered = false;

  constructor() {
    super();
    this.outputDir = path.join(os.tmpdir(), 'Ondoki', 'audio');
  }

  public getIsCapturing(): boolean {
    return this.isCapturing;
  }

  public getIsPaused(): boolean {
    return this.isPaused;
  }

  /**
   * List available audio input devices via the hidden window.
   */
  public async getDevices(): Promise<AudioDevice[]> {
    const win = await this.ensureHiddenWindow();
    return new Promise<AudioDevice[]>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out listing audio devices'));
      }, 5000);

      const handler = (_event: any, devices: AudioDevice[]) => {
        clearTimeout(timeout);
        ipcMain.removeListener('audio-capture:devices-result', handler);
        resolve(devices);
      };
      ipcMain.on('audio-capture:devices-result', handler);
      win.webContents.send('audio-capture:list-devices');
    });
  }

  /**
   * Start capturing audio from the microphone.
   */
  public async startCapture(deviceId?: string): Promise<void> {
    if (this.isCapturing) {
      throw new Error('Audio capture is already in progress');
    }

    await fs.promises.mkdir(this.outputDir, { recursive: true });
    this.audioChunks = [];
    this.startTime = Date.now();

    const win = await this.ensureHiddenWindow();
    this.registerIpcHandlers();

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timed out starting audio capture'));
      }, 5000);

      const successHandler = () => {
        clearTimeout(timeout);
        ipcMain.removeListener('audio-capture:started', successHandler);
        ipcMain.removeListener('audio-capture:error', errorHandler);
        this.isCapturing = true;
        this.isPaused = false;
        this.emit('state-changed', { isCapturing: true, isPaused: false });
        resolve();
      };

      const errorHandler = (_event: any, errorMsg: string) => {
        clearTimeout(timeout);
        ipcMain.removeListener('audio-capture:started', successHandler);
        ipcMain.removeListener('audio-capture:error', errorHandler);
        reject(new Error(`Audio capture failed: ${errorMsg}`));
      };

      ipcMain.once('audio-capture:started', successHandler);
      ipcMain.once('audio-capture:error', errorHandler);

      win.webContents.send('audio-capture:start', { deviceId });
    });
  }

  /**
   * Stop capturing and save the audio file.
   * Returns the file path and duration.
   */
  public async stopCapture(): Promise<AudioCaptureResult | null> {
    if (!this.isCapturing || !this.hiddenWindow) {
      return null;
    }

    return new Promise<AudioCaptureResult | null>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('[AudioCapture] Stop timed out, saving what we have');
        this.finalizeAudio().then(resolve);
      }, 3000);

      const handler = () => {
        clearTimeout(timeout);
        ipcMain.removeListener('audio-capture:stopped', handler);
        this.finalizeAudio().then(resolve);
      };

      ipcMain.once('audio-capture:stopped', handler);
      this.hiddenWindow!.webContents.send('audio-capture:stop');
    });
  }

  /**
   * Pause audio capture.
   */
  public pauseCapture(): void {
    if (!this.isCapturing || this.isPaused || !this.hiddenWindow) return;
    this.hiddenWindow.webContents.send('audio-capture:pause');
    this.isPaused = true;
    this.emit('state-changed', { isCapturing: true, isPaused: true });
  }

  /**
   * Resume audio capture.
   */
  public resumeCapture(): void {
    if (!this.isCapturing || !this.isPaused || !this.hiddenWindow) return;
    this.hiddenWindow.webContents.send('audio-capture:resume');
    this.isPaused = false;
    this.emit('state-changed', { isCapturing: true, isPaused: false });
  }

  /**
   * Clean up resources.
   */
  public dispose(): void {
    this.destroyHiddenWindow();
    this.removeAllListeners();
  }

  // ------------------------------------------------------------------
  // Internal
  // ------------------------------------------------------------------

  private async finalizeAudio(): Promise<AudioCaptureResult | null> {
    this.isCapturing = false;
    this.isPaused = false;
    this.emit('state-changed', { isCapturing: false, isPaused: false });

    if (this.audioChunks.length === 0) {
      console.warn('[AudioCapture] No audio data captured');
      return null;
    }

    const duration = (Date.now() - this.startTime) / 1000;
    const filePath = path.join(this.outputDir, `recording-${Date.now()}.webm`);

    try {
      const combined = Buffer.concat(this.audioChunks);
      await fs.promises.writeFile(filePath, combined);
      console.log(`[AudioCapture] Saved ${combined.length} bytes to ${filePath} (${duration.toFixed(1)}s)`);
      this.audioChunks = [];
      return { filePath, duration };
    } catch (error) {
      console.error('[AudioCapture] Failed to save audio:', error);
      return null;
    }
  }

  private registerIpcHandlers(): void {
    if (this.ipcRegistered) return;
    this.ipcRegistered = true;

    ipcMain.on('audio-capture:chunk', (_event, chunk: ArrayBuffer) => {
      this.audioChunks.push(Buffer.from(chunk));
      this.emit('audio-data', chunk);
    });
  }

  private async ensureHiddenWindow(): Promise<BrowserWindow> {
    if (this.hiddenWindow && !this.hiddenWindow.isDestroyed()) {
      return this.hiddenWindow;
    }

    this.hiddenWindow = new BrowserWindow({
      show: false,
      width: 1,
      height: 1,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'audio-capture-preload.js'),
      },
    });

    // Grant microphone permission for this window
    this.hiddenWindow.webContents.session.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        if (permission === 'media') {
          callback(true);
        } else {
          callback(false);
        }
      }
    );

    // Load a real HTML file (preload scripts don't work reliably with data: URLs)
    const htmlPath = path.join(__dirname, '..', 'renderer', 'audio-capture.html');
    await this.hiddenWindow.loadFile(htmlPath);

    this.hiddenWindow.on('closed', () => {
      this.hiddenWindow = null;
      if (this.isCapturing) {
        this.isCapturing = false;
        this.isPaused = false;
        this.emit('state-changed', { isCapturing: false, isPaused: false });
      }
    });

    return this.hiddenWindow;
  }

  private destroyHiddenWindow(): void {
    if (this.hiddenWindow && !this.hiddenWindow.isDestroyed()) {
      this.hiddenWindow.close();
    }
    this.hiddenWindow = null;
  }


}
