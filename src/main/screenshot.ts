import { screen, desktopCapturer } from 'electron';
let app: any;
try { app = require('electron').app; } catch {}
let screenshotDesktop: any;
let sharp: any;
try {
  screenshotDesktop = require('screenshot-desktop');
  sharp = require('sharp');
} catch (e) {
  console.warn('screenshot-desktop or sharp not available:', (e as Error).message);
}
import * as path from 'path';
import * as fs from 'fs';
import { execFile, execFileSync, ChildProcess, spawn } from 'child_process';
import * as os from 'os';
import { createInterface, Interface as ReadlineInterface } from 'readline';

export interface Display {
  id: string;
  name: string;
  bounds: Rectangle;
  workArea: Rectangle;
  isPrimary: boolean;
  scaleFactor: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowInfo {
  handle: number;
  title: string;
  ownerName: string;
  bounds: Rectangle;
  isVisible: boolean;
  processId: number;
}

export interface ElementInfo {
  role: string;
  title: string;
  value: string;
  description: string;
  subrole: string;
}

export interface PointQueryResult {
  mousePosition: { x: number; y: number };
  mousePositionFlipped: { x: number; y: number };
  scaleFactor: number;
  display: { scaleFactor: number; isPrimary: boolean; bounds?: Rectangle };
  window: {
    handle: number;
    title: string;
    ownerName: string;
    ownerPID: number;
    bounds: { x: number; y: number; width: number; height: number };
    isVisible: boolean;
  } | null;
  element: ElementInfo | null;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class ScreenshotService {
  private nativeBinaryPath: string | null = null;
  private nativeAvailable = false;

  // Persistent subprocess state
  private nativeProcess: ChildProcess | null = null;
  private nativeRl: ReadlineInterface | null = null;
  private pendingRequests = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private persistentMode = false;
  private disposed = false;
  private restartAttempts = 0;
  private maxRestartAttempts = 3;

  constructor() {
    this.initNativeBinary();
    this.startPersistentProcess();
  }

  // ------------------------------------------------------------------
  // Native binary discovery
  // ------------------------------------------------------------------

  private initNativeBinary(): void {
    const platform = process.platform;

    if (platform === 'darwin') {
      const candidates = [
        path.join(app?.isPackaged ? path.dirname(app.getPath('exe')) : '', '..', 'Resources', 'native', 'macos', 'window-info'),
        path.join(__dirname, '..', '..', 'native', 'macos', 'window-info'),
        path.join(__dirname, '..', 'native', 'macos', 'window-info'),
      ];

      for (const candidate of candidates) {
        try {
          if (fs.existsSync(candidate)) {
            fs.accessSync(candidate, fs.constants.X_OK);
            this.nativeBinaryPath = candidate;
            this.nativeAvailable = true;
            console.log('Native window-info binary found at:', candidate);
            return;
          }
        } catch {
          continue;
        }
      }

      // Try to compile on-the-fly in development
      if (!app?.isPackaged) {
        const srcPath = path.join(__dirname, '..', '..', 'native', 'macos', 'window-info.swift');
        const outPath = path.join(__dirname, '..', '..', 'native', 'macos', 'window-info');
        if (fs.existsSync(srcPath)) {
          try {
            console.log('Compiling native window-info binary...');
            execFileSync('swiftc', ['-O', '-o', outPath, srcPath, '-framework', 'AppKit', '-framework', 'CoreGraphics', '-framework', 'ApplicationServices']);
            this.nativeBinaryPath = outPath;
            this.nativeAvailable = true;
            console.log('Native binary compiled successfully');
          } catch (e) {
            console.warn('Failed to compile native binary:', (e as Error).message);
          }
        }
      }

      if (!this.nativeAvailable) {
        console.warn('Native window-info binary not found. Window detection will be limited.');
      }
    } else if (platform === 'win32') {
      const candidates = [
        path.join(app?.isPackaged ? path.dirname(app.getPath('exe')) : '', '..', 'Resources', 'native', 'windows', 'window-info.exe'),
        path.join(__dirname, '..', '..', 'native', 'windows', 'bin', 'Release', 'net8.0', 'win-x64', 'publish', 'window-info.exe'),
        path.join(__dirname, '..', '..', 'native', 'windows', 'window-info.exe'),
      ];
      for (const candidate of candidates) {
        try {
          if (fs.existsSync(candidate)) {
            this.nativeBinaryPath = candidate;
            this.nativeAvailable = true;
            console.log('Native window-info.exe found at:', candidate);
            return;
          }
        } catch { continue; }
      }
      console.warn('Native window-info.exe not found. Mouse click detection will record clicks but without window/element details.');
      console.warn('To enable full detection, build with: cd native/windows && dotnet publish -c Release -r win-x64 --self-contained');
    }
  }

  // ------------------------------------------------------------------
  // Persistent native subprocess
  // ------------------------------------------------------------------

  private startPersistentProcess(): void {
    if (!this.nativeAvailable || !this.nativeBinaryPath || this.disposed) {
      return;
    }

    try {
      this.nativeProcess = spawn(this.nativeBinaryPath, ['serve'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.persistentMode = true;
      this.restartAttempts = 0;

      this.nativeRl = createInterface({ input: this.nativeProcess.stdout! });

      this.nativeRl.on('line', (line: string) => {
        try {
          const response = JSON.parse(line);
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            this.pendingRequests.delete(response.id);
            clearTimeout(pending.timer);
            if (response.error) {
              pending.resolve(null); // Treat errors as null like the old code
            } else {
              pending.resolve(response.result);
            }
          }
        } catch (e) {
          // Ignore unparseable lines
        }
      });

      this.nativeProcess.stderr?.on('data', (data: Buffer) => {
        // Log stderr but don't treat as fatal
        console.warn('Native subprocess stderr:', data.toString().trim());
      });

      this.nativeProcess.on('exit', (code, signal) => {
        console.warn(`Native subprocess exited (code=${code}, signal=${signal})`);
        this.persistentMode = false;
        this.nativeProcess = null;
        this.nativeRl = null;

        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timer);
          pending.resolve(null);
        }
        this.pendingRequests.clear();

        // Auto-restart if not disposed
        if (!this.disposed && this.restartAttempts < this.maxRestartAttempts) {
          this.restartAttempts++;
          console.log(`Restarting native subprocess (attempt ${this.restartAttempts}/${this.maxRestartAttempts})...`);
          setTimeout(() => this.startPersistentProcess(), 100);
        }
      });

      this.nativeProcess.on('error', (err) => {
        console.error('Native subprocess error:', err.message);
        this.persistentMode = false;
      });

      console.log('Native subprocess started in persistent serve mode');
    } catch (e) {
      console.warn('Failed to start persistent native subprocess:', (e as Error).message);
      this.persistentMode = false;
    }
  }

  // ------------------------------------------------------------------
  // Native command execution
  // ------------------------------------------------------------------

  private async execNative(args: string[]): Promise<any> {
    if (!this.nativeAvailable || !this.nativeBinaryPath) {
      return null;
    }

    // Try persistent mode first
    if (this.persistentMode && this.nativeProcess?.stdin?.writable) {
      return this.execNativePersistent(args);
    }

    // Fallback to one-shot execFile
    return this.execNativeOneShot(args);
  }

  private execNativePersistent(args: string[]): Promise<any> {
    return new Promise((resolve) => {
      const id = this.nextRequestId++;
      const cmd = args[0];
      let requestArgs: Record<string, number> | undefined;

      if (cmd === 'point' && args.length >= 3) {
        requestArgs = { x: parseFloat(args[1]), y: parseFloat(args[2]) };
      }

      const request = JSON.stringify({ id, cmd, args: requestArgs });

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        console.warn(`Native request ${id} (${cmd}) timed out after 5s, falling back to one-shot`);
        // Fallback to one-shot on timeout
        this.execNativeOneShot(args).then(resolve);
      }, 5000);

      this.pendingRequests.set(id, { resolve, reject: () => resolve(null), timer });

      try {
        this.nativeProcess!.stdin!.write(request + '\n');
      } catch (e) {
        this.pendingRequests.delete(id);
        clearTimeout(timer);
        console.warn('Failed to write to native subprocess, falling back to one-shot');
        this.execNativeOneShot(args).then(resolve);
      }
    });
  }

  private execNativeOneShot(args: string[]): Promise<any> {
    return new Promise((resolve) => {
      execFile(this.nativeBinaryPath!, args, { timeout: 3000, maxBuffer: 1024 * 1024 }, (error, stdout) => {
        if (error) {
          console.error('Native exec error:', error.message);
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch (e) {
          console.error('Native JSON parse error:', stdout.substring(0, 200));
          resolve(null);
        }
      });
    });
  }

  private execNativeSync(args: string[]): any {
    if (!this.nativeAvailable || !this.nativeBinaryPath) {
      return null;
    }

    try {
      const result = execFileSync(this.nativeBinaryPath!, args, { timeout: 3000, encoding: 'utf-8' });
      return JSON.parse(result);
    } catch (e) {
      console.error('Native sync exec error:', (e as Error).message);
      return null;
    }
  }

  // ------------------------------------------------------------------
  // Disposal
  // ------------------------------------------------------------------

  public dispose(): void {
    this.disposed = true;
    
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve(null);
    }
    this.pendingRequests.clear();

    // Kill the subprocess
    if (this.nativeProcess) {
      try {
        this.nativeProcess.stdin?.end();
        this.nativeProcess.kill();
      } catch {}
      this.nativeProcess = null;
    }

    if (this.nativeRl) {
      this.nativeRl.close();
      this.nativeRl = null;
    }

    this.persistentMode = false;
    console.log('ScreenshotService disposed');
  }

  // ------------------------------------------------------------------
  // Display info
  // ------------------------------------------------------------------

  public async getDisplays(): Promise<Display[]> {
    const displays = screen.getAllDisplays();
    return displays.map(display => ({
      id: display.id.toString(),
      name: display.label || `Display ${display.id}`,
      bounds: { ...display.bounds },
      workArea: { ...display.workArea },
      isPrimary: display.id === screen.getPrimaryDisplay().id,
      scaleFactor: display.scaleFactor,
    }));
  }

  public getDisplaysSync(): Display[] {
    const displays = screen.getAllDisplays();
    return displays.map(display => ({
      id: display.id.toString(),
      name: display.label || `Display ${display.id}`,
      bounds: { ...display.bounds },
      workArea: { ...display.workArea },
      isPrimary: display.id === screen.getPrimaryDisplay().id,
      scaleFactor: display.scaleFactor,
    }));
  }

  /**
   * Get the scale factor for a given screen point.
   */
  public getScaleFactorAtPoint(x: number, y: number): number {
    const display = screen.getDisplayNearestPoint({ x, y });
    return display?.scaleFactor ?? 1;
  }

  /**
   * Get the effective scale factor for a display, detecting cases where
   * Electron reports scaleFactor=1 but the display is actually scaled.
   * This happens on Windows when DPI awareness isn't fully propagated.
   */
  public async getEffectiveScale(displayBounds: Rectangle): Promise<number> {
    try {
      const screenshot = await this.takeScreenshotNative({ x: displayBounds.x, y: displayBounds.y });
      const metadata = await sharp(screenshot).metadata();
      if (metadata.width && displayBounds.width > 0) {
        return metadata.width / displayBounds.width;
      }
    } catch {}
    return this.getScaleFactorAtPoint(displayBounds.x, displayBounds.y);
  }

  // ------------------------------------------------------------------
  // Window enumeration (native)
  // ------------------------------------------------------------------

  public async getWindows(): Promise<WindowInfo[]> {
    const nativeResult = await this.execNative(['windows']);
    if (nativeResult?.windows) {
      return nativeResult.windows.map((w: any) => ({
        handle: w.handle,
        title: w.title,
        ownerName: w.ownerName,
        bounds: {
          x: w.bounds.x,
          y: w.bounds.y,
          width: w.bounds.width,
          height: w.bounds.height,
        },
        isVisible: w.isVisible,
        processId: w.ownerPID,
      }));
    }

    return this.getWindowsFallback();
  }

  private async getWindowsFallback(): Promise<WindowInfo[]> {
    try {
      const sources = await desktopCapturer.getSources({ types: ['window'], fetchWindowIcons: false });
      return sources
        .filter(source => source.name !== '' && !source.name.includes('Electron'))
        .map(source => ({
          handle: this.extractWindowHandle(source.display_id),
          title: source.name,
          ownerName: '',
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          isVisible: true,
          processId: 0,
        }));
    } catch (error) {
      console.error('Failed to get windows:', error);
      return [];
    }
  }

  // ------------------------------------------------------------------
  // Window at point (native) — THE CRITICAL FUNCTION
  // ------------------------------------------------------------------

  public async getWindowAtPoint(point: { x: number; y: number }): Promise<WindowInfo> {
    const nativeResult: PointQueryResult | null = await this.execNative(['point', point.x.toString(), point.y.toString()]);

    if (nativeResult?.window) {
      const w = nativeResult.window;
      return {
        handle: w.handle,
        title: w.title,
        ownerName: w.ownerName,
        bounds: {
          x: w.bounds.x,
          y: w.bounds.y,
          width: w.bounds.width,
          height: w.bounds.height,
        },
        isVisible: w.isVisible,
        processId: w.ownerPID,
      };
    }

    return {
      handle: 0,
      title: 'Unknown Window',
      ownerName: '',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      isVisible: true,
      processId: 0,
    };
  }

  public async getFullInfoAtPoint(point: { x: number; y: number }): Promise<PointQueryResult | null> {
    return this.execNative(['point', point.x.toString(), point.y.toString()]);
  }

  public async getWindowByHandle(handle: number): Promise<WindowInfo | null> {
    const windows = await this.getWindows();
    return windows.find(w => w.handle === handle) || null;
  }

  public getCurrentWindow(): WindowInfo | null {
    const nativeResult = this.execNativeSync(['mouse']);
    if (nativeResult?.window) {
      const w = nativeResult.window;
      return {
        handle: w.handle,
        title: w.title,
        ownerName: w.ownerName,
        bounds: { x: w.bounds.x, y: w.bounds.y, width: w.bounds.width, height: w.bounds.height },
        isVisible: w.isVisible,
        processId: w.ownerPID,
      };
    }
    return null;
  }

  // ------------------------------------------------------------------
  // Screenshots — Electron desktopCapturer (primary) + fallback
  // ------------------------------------------------------------------

  /**
   * Take a screenshot using Electron's desktopCapturer (no external process).
   * Returns a PNG buffer of the specified display or the display nearest the given point.
   */
  private async takeScreenshotNative(point?: { x: number; y: number }): Promise<Buffer> {
    const targetDisplay = point
      ? screen.getDisplayNearestPoint(point)
      : screen.getPrimaryDisplay();

    const physWidth = Math.round(targetDisplay.size.width * targetDisplay.scaleFactor);
    const physHeight = Math.round(targetDisplay.size.height * targetDisplay.scaleFactor);

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: physWidth, height: physHeight },
    });

    console.log(`[DIAG] desktopCapturer: ${sources.length} sources, target display=${targetDisplay.id} (${targetDisplay.size.width}x${targetDisplay.size.height}@${targetDisplay.scaleFactor})`);
    for (const s of sources) {
      const thumb = s.thumbnail;
      console.log(`[DIAG]   source: id="${s.id}" display_id="${s.display_id}" name="${s.name}" thumb=${thumb.getSize().width}x${thumb.getSize().height}`);
    }

    // Match by display ID — desktopCapturer source.display_id corresponds to Electron display.id
    const displayIdStr = targetDisplay.id.toString();
    let source = sources.find(s => s.display_id === displayIdStr);

    // Fallback: match by expected physical thumbnail size (handles Windows mixed-DPI
    // where display_id doesn't always match Electron's id)
    if (!source) {
      source = sources.find(s => {
        const thumb = s.thumbnail.getSize();
        return Math.abs(thumb.width - physWidth) < 10 && Math.abs(thumb.height - physHeight) < 10;
      });
    }

    // Fallback: if only one source (single monitor), just use it
    if (!source && sources.length === 1) {
      source = sources[0];
    }

    // Fallback: match by name containing display id
    if (!source) {
      source = sources.find(s => s.name.includes(displayIdStr));
    }

    if (!source) {
      console.error(`No desktopCapturer source for display ${displayIdStr}. Sources:`, sources.map(s => ({ id: s.id, display_id: s.display_id, name: s.name, thumb: s.thumbnail.getSize() })));
      throw new Error(`No desktopCapturer source found for display ${displayIdStr}`);
    }

    return source.thumbnail.toPNG();
  }

  /**
   * Take a full screenshot, preferring desktopCapturer, falling back to screenshot-desktop.
   */
  public async captureScreen(point?: { x: number; y: number }): Promise<Buffer> {
    try {
      return await this.takeScreenshotNative(point);
    } catch (e) {
      console.warn('desktopCapturer failed, falling back to screenshot-desktop:', (e as Error).message);
      if (screenshotDesktop) {
        return await screenshotDesktop({ format: 'png' });
      }
      throw e;
    }
  }

  public async takeScreenshot(bounds?: Rectangle): Promise<string> {
    try {
      let screenshot: Buffer;

      if (bounds) {
        const fullScreenshot = await this.captureScreen({ x: bounds.x, y: bounds.y });

        const scale = this.getScaleFactorAtPoint(bounds.x, bounds.y);

        const physicalBounds = {
          left: Math.max(0, Math.round(bounds.x * scale)),
          top: Math.max(0, Math.round(bounds.y * scale)),
          width: Math.round(bounds.width * scale),
          height: Math.round(bounds.height * scale),
        };

        // For desktopCapturer, the screenshot is relative to the display, not absolute
        // Adjust physical bounds to be relative to the display origin
        const targetDisplay = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
        physicalBounds.left = Math.max(0, Math.round((bounds.x - targetDisplay.bounds.x) * scale));
        physicalBounds.top = Math.max(0, Math.round((bounds.y - targetDisplay.bounds.y) * scale));

        const metadata = await sharp(fullScreenshot).metadata();
        physicalBounds.width = Math.min(physicalBounds.width, (metadata.width || 3840) - physicalBounds.left);
        physicalBounds.height = Math.min(physicalBounds.height, (metadata.height || 2160) - physicalBounds.top);

        if (physicalBounds.width > 0 && physicalBounds.height > 0) {
          screenshot = await sharp(fullScreenshot)
            .extract(physicalBounds)
            .png()
            .toBuffer();
        } else {
          screenshot = fullScreenshot;
        }
      } else {
        screenshot = await this.captureScreen();
      }

      const timestamp = Date.now();
      const filename = `screenshot_${timestamp}.png`;
      const tempPath = path.join(os.tmpdir(), 'Ondoki', filename);
      await fs.promises.mkdir(path.dirname(tempPath), { recursive: true });
      await fs.promises.writeFile(tempPath, screenshot);
      return tempPath;
    } catch (error) {
      throw new Error(`Failed to take screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  public async takeAnnotatedScreenshot(
    bounds: Rectangle,
    clickPoint: { x: number; y: number },
    outputDir: string,
    stepNumber: number,
    scaleFactor?: number,
    preCapturedBuffer?: Buffer,
    physicalAnnotation?: { x: number; y: number }
  ): Promise<string> {
    try {
      const fullScreenshot = preCapturedBuffer ?? await this.captureScreen({ x: bounds.x, y: bounds.y });
      const scale = scaleFactor ?? this.getScaleFactorAtPoint(bounds.x, bounds.y);

      // For desktopCapturer, coordinates are relative to the display
      const targetDisplay = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
      const pLeft = Math.max(0, Math.round((bounds.x - targetDisplay.bounds.x) * scale));
      const pTop = Math.max(0, Math.round((bounds.y - targetDisplay.bounds.y) * scale));
      let pWidth = Math.round(bounds.width * scale);
      let pHeight = Math.round(bounds.height * scale);

      const metadata = await sharp(fullScreenshot).metadata();
      const imgW = metadata.width || 3840;
      const imgH = metadata.height || 2160;
      console.log(`[DIAG] annotatedScreenshot: img=${imgW}x${imgH}, display=${targetDisplay.size.width}x${targetDisplay.size.height}, scale=${scale}, crop=left:${pLeft} top:${pTop} w:${pWidth} h:${pHeight}, bounds=${JSON.stringify(bounds)}`);
      pWidth = Math.min(pWidth, imgW - pLeft);
      pHeight = Math.min(pHeight, imgH - pTop);

      if (pWidth <= 0 || pHeight <= 0) {
        throw new Error(`Invalid crop region: ${pWidth}x${pHeight} at ${pLeft},${pTop} (img ${imgW}x${imgH}, scale ${scale})`);
      }

      const pClickX = physicalAnnotation
        ? Math.round(physicalAnnotation.x)
        : Math.round(clickPoint.x * scale);
      const pClickY = physicalAnnotation
        ? Math.round(physicalAnnotation.y)
        : Math.round(clickPoint.y * scale);

      const circleRadius = Math.round(15 * scale);
      const circleSize = circleRadius * 2;
      const strokeWidth = Math.round(3 * scale);

      const circleSvg = Buffer.from(`
        <svg width="${circleSize}" height="${circleSize}" xmlns="http://www.w3.org/2000/svg">
          <circle cx="${circleRadius}" cy="${circleRadius}" r="${circleRadius - strokeWidth}" 
                  stroke="#ef4444" stroke-width="${strokeWidth}" fill="rgba(239,68,68,0.15)"/>
          <circle cx="${circleRadius}" cy="${circleRadius}" r="${Math.round(3 * scale)}" 
                  fill="#ef4444" opacity="0.8"/>
        </svg>
      `);

      const overlayLeft = Math.max(0, Math.min(pClickX - circleRadius, pWidth - circleSize));
      const overlayTop = Math.max(0, Math.min(pClickY - circleRadius, pHeight - circleSize));

      const annotatedBuffer = await sharp(fullScreenshot)
        .extract({ left: pLeft, top: pTop, width: pWidth, height: pHeight })
        .composite([
          {
            input: circleSvg,
            left: overlayLeft,
            top: overlayTop,
            blend: 'over' as any,
          },
        ])
        .png()
        .toBuffer();

      const filename = `step_${stepNumber.toString().padStart(3, '0')}.png`;
      const outputPath = path.join(outputDir, filename);
      await fs.promises.writeFile(outputPath, annotatedBuffer);
      return outputPath;
    } catch (error) {
      throw new Error(`Failed to take annotated screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ------------------------------------------------------------------
  // Utilities
  // ------------------------------------------------------------------

  private extractWindowHandle(displayId: string): number {
    try {
      const match = displayId.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    } catch {
      return 0;
    }
  }

  public getVirtualScreenBounds(): Rectangle {
    const displays = screen.getAllDisplays();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const d of displays) {
      minX = Math.min(minX, d.bounds.x);
      minY = Math.min(minY, d.bounds.y);
      maxX = Math.max(maxX, d.bounds.x + d.bounds.width);
      maxY = Math.max(maxY, d.bounds.y + d.bounds.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  public isNativeAvailable(): boolean {
    return this.nativeAvailable;
  }

  public getNativeBinaryPath(): string | null {
    return this.nativeBinaryPath;
  }
}
