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
import { execFile, execFileSync } from 'child_process';
import * as os from 'os';

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

export class ScreenshotService {
  private nativeBinaryPath: string | null = null;
  private nativeAvailable = false;

  constructor() {
    this.initNativeBinary();
  }

  // ------------------------------------------------------------------
  // Native binary discovery
  // ------------------------------------------------------------------

  private initNativeBinary(): void {
    const platform = process.platform;

    if (platform === 'darwin') {
      // Look for compiled Swift binary in multiple locations
      const candidates = [
        // In app bundle (packaged)
        path.join(app?.isPackaged ? path.dirname(app.getPath('exe')) : '', '..', 'Resources', 'native', 'macos', 'window-info'),
        // Development: relative to project root
        path.join(__dirname, '..', '..', 'native', 'macos', 'window-info'),
        // Development: from src/main/
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
        // Packaged app
        path.join(app?.isPackaged ? path.dirname(app.getPath('exe')) : '', '..', 'Resources', 'native', 'windows', 'window-info.exe'),
        // Dev: dotnet publish output
        path.join(__dirname, '..', '..', 'native', 'windows', 'bin', 'Release', 'net8.0', 'win-x64', 'publish', 'window-info.exe'),
        // Dev: simple csc output
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
      console.warn('Native window-info.exe not found. Build with: cd native/windows && dotnet publish -c Release -r win-x64 --self-contained');
    }
  }

  // ------------------------------------------------------------------
  // Native command execution
  // ------------------------------------------------------------------

  private async execNative(args: string[]): Promise<any> {
    if (!this.nativeAvailable || !this.nativeBinaryPath) {
      return null;
    }

    return new Promise((resolve, reject) => {
      const cmd = this.nativeBinaryPath!;
      const cmdArgs = args;

      execFile(cmd, cmdArgs, { timeout: 3000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
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
   * On Retina/HiDPI, screenshot pixels = logical pixels * scaleFactor.
   */
  public getScaleFactorAtPoint(x: number, y: number): number {
    const display = screen.getDisplayNearestPoint({ x, y });
    return display?.scaleFactor ?? 1;
  }

  // ------------------------------------------------------------------
  // Window enumeration (native)
  // ------------------------------------------------------------------

  public async getWindows(): Promise<WindowInfo[]> {
    // Try native first
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

    // Fallback to desktopCapturer
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

  /**
   * Get the window and UI element at a specific screen point.
   * Uses native OS APIs for accurate results across DPI/multi-monitor.
   * Coordinates must be in LOGICAL screen coordinates (top-left origin).
   */
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

    // Fallback
    return {
      handle: 0,
      title: 'Unknown Window',
      ownerName: '',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      isVisible: true,
      processId: 0,
    };
  }

  /**
   * Get full point query result including element info and scale factor.
   */
  public async getFullInfoAtPoint(point: { x: number; y: number }): Promise<PointQueryResult | null> {
    return this.execNative(['point', point.x.toString(), point.y.toString()]);
  }

  public async getWindowByHandle(handle: number): Promise<WindowInfo | null> {
    // Get all windows and find by handle
    const windows = await this.getWindows();
    return windows.find(w => w.handle === handle) || null;
  }

  public getCurrentWindow(): WindowInfo | null {
    // Use native mouse position to get current window
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
  // Screenshots with proper DPI handling
  // ------------------------------------------------------------------

  public async takeScreenshot(bounds?: Rectangle): Promise<string> {
    try {
      let screenshot: Buffer;

      if (bounds) {
        const fullScreenshot = await screenshotDesktop({ format: 'png' });

        // Get scale factor for the capture region
        const scale = this.getScaleFactorAtPoint(bounds.x, bounds.y);

        // screenshot-desktop returns physical pixels, bounds are logical
        const physicalBounds = {
          left: Math.max(0, Math.round(bounds.x * scale)),
          top: Math.max(0, Math.round(bounds.y * scale)),
          width: Math.round(bounds.width * scale),
          height: Math.round(bounds.height * scale),
        };

        // Clamp to image dimensions
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
        screenshot = await screenshotDesktop({ format: 'png' });
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

  /**
   * Take a screenshot of a region and annotate with a click circle.
   * 
   * @param bounds       - Logical screen coordinates of the capture region
   * @param clickPoint   - Click position RELATIVE to bounds (logical coords)
   * @param outputDir    - Directory to save the screenshot
   * @param stepNumber   - Step number for filename
   * @param scaleFactor  - Optional override; auto-detected if omitted
   */
  public async takeAnnotatedScreenshot(
    bounds: Rectangle,
    clickPoint: { x: number; y: number },
    outputDir: string,
    stepNumber: number,
    scaleFactor?: number
  ): Promise<string> {
    try {
      const fullScreenshot = await screenshotDesktop({ format: 'png' });
      const scale = scaleFactor ?? this.getScaleFactorAtPoint(bounds.x, bounds.y);

      // Convert logical bounds to physical pixel coordinates
      const pLeft = Math.max(0, Math.round(bounds.x * scale));
      const pTop = Math.max(0, Math.round(bounds.y * scale));
      let pWidth = Math.round(bounds.width * scale);
      let pHeight = Math.round(bounds.height * scale);

      // Clamp to image size
      const metadata = await sharp(fullScreenshot).metadata();
      const imgW = metadata.width || 3840;
      const imgH = metadata.height || 2160;
      pWidth = Math.min(pWidth, imgW - pLeft);
      pHeight = Math.min(pHeight, imgH - pTop);

      if (pWidth <= 0 || pHeight <= 0) {
        throw new Error(`Invalid crop region: ${pWidth}x${pHeight} at ${pLeft},${pTop} (img ${imgW}x${imgH}, scale ${scale})`);
      }

      // Click point is in logical coords relative to bounds → convert to physical
      const pClickX = Math.round(clickPoint.x * scale);
      const pClickY = Math.round(clickPoint.y * scale);

      // Circle size scales with DPI
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
}
