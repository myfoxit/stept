import { screen, desktopCapturer } from 'electron';
import screenshotDesktop from 'screenshot-desktop';
import sharp from 'sharp';
import * as path from 'path';
import * as fs from 'fs';

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
  bounds: Rectangle;
  isVisible: boolean;
  processId: number;
}

export class ScreenshotService {
  private tempDir?: string;

  constructor() {
    // We'll use the system temp directory for screenshots
  }

  public async getDisplays(): Promise<Display[]> {
    const displays = screen.getAllDisplays();
    
    return displays.map(display => ({
      id: display.id.toString(),
      name: display.label || `Display ${display.id}`,
      bounds: {
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
      },
      workArea: {
        x: display.workArea.x,
        y: display.workArea.y,
        width: display.workArea.width,
        height: display.workArea.height,
      },
      isPrimary: display.id === screen.getPrimaryDisplay().id,
      scaleFactor: display.scaleFactor,
    }));
  }

  public getDisplaysSync(): Display[] {
    const displays = screen.getAllDisplays();
    
    return displays.map(display => ({
      id: display.id.toString(),
      name: display.label || `Display ${display.id}`,
      bounds: {
        x: display.bounds.x,
        y: display.bounds.y,
        width: display.bounds.width,
        height: display.bounds.height,
      },
      workArea: {
        x: display.workArea.x,
        y: display.workArea.y,
        width: display.workArea.width,
        height: display.workArea.height,
      },
      isPrimary: display.id === screen.getPrimaryDisplay().id,
      scaleFactor: display.scaleFactor,
    }));
  }

  public async getWindows(): Promise<WindowInfo[]> {
    try {
      // Use desktopCapturer to get window list
      const sources = await desktopCapturer.getSources({
        types: ['window'],
        fetchWindowIcons: false,
      });

      return sources
        .filter(source => source.name !== '' && !source.name.includes('Electron'))
        .map(source => {
          // Parse the display_id which contains window handle info
          const handle = this.extractWindowHandle(source.display_id);
          
          return {
            handle,
            title: source.name,
            bounds: { x: 0, y: 0, width: 0, height: 0 }, // We'll need to get actual bounds
            isVisible: true,
            processId: 0, // Would need native code to get this
          };
        });
    } catch (error) {
      console.error('Failed to get windows:', error);
      return [];
    }
  }

  public async getWindowAtPoint(point: { x: number; y: number }): Promise<WindowInfo> {
    try {
      // This is a simplified implementation
      // In a real implementation, you'd use native APIs to get the window at a point
      const windows = await this.getWindows();
      
      // For now, return a default window info
      // In production, you'd need platform-specific code to get the actual window
      return {
        handle: 0,
        title: 'Unknown Window',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        isVisible: true,
        processId: 0,
      };
    } catch (error) {
      console.error('Failed to get window at point:', error);
      return {
        handle: 0,
        title: 'Unknown Window',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        isVisible: true,
        processId: 0,
      };
    }
  }

  public async getWindowByHandle(handle: number): Promise<WindowInfo | null> {
    try {
      // This would need platform-specific implementation
      // For now, return null to indicate the window couldn't be found
      return null;
    } catch (error) {
      console.error('Failed to get window by handle:', error);
      return null;
    }
  }

  public getCurrentWindow(): WindowInfo | null {
    try {
      // This would need platform-specific implementation
      // For now, return a default current window
      return {
        handle: 0,
        title: 'Current Window',
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        isVisible: true,
        processId: process.pid,
      };
    } catch (error) {
      console.error('Failed to get current window:', error);
      return null;
    }
  }

  public async takeScreenshot(bounds?: Rectangle): Promise<string> {
    try {
      let screenshot: Buffer;

      if (bounds) {
        // Take screenshot of specific region
        const fullScreenshot = await screenshotDesktop({ format: 'png' });
        
        // Crop to the specified bounds using sharp
        screenshot = await sharp(fullScreenshot)
          .extract({
            left: Math.max(0, bounds.x),
            top: Math.max(0, bounds.y),
            width: bounds.width,
            height: bounds.height,
          })
          .png()
          .toBuffer();
      } else {
        // Take full screenshot
        screenshot = await screenshotDesktop({ format: 'png' });
      }

      // Save to temp file
      const timestamp = Date.now();
      const filename = `screenshot_${timestamp}.png`;
      const tempPath = path.join(require('os').tmpdir(), 'Ondoki', filename);
      
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
    stepNumber: number
  ): Promise<string> {
    try {
      // Take screenshot of the specified region
      const screenshot = await screenshotDesktop({ format: 'png' });
      
      // Crop to bounds and annotate with click point
      const annotatedBuffer = await sharp(screenshot)
        .extract({
          left: Math.max(0, bounds.x),
          top: Math.max(0, bounds.y),
          width: bounds.width,
          height: bounds.height,
        })
        .composite([
          {
            input: await this.createClickCircle(),
            left: Math.max(0, clickPoint.x - 15),
            top: Math.max(0, clickPoint.y - 15),
            blend: 'over',
          },
        ])
        .png()
        .toBuffer();

      // Save annotated screenshot
      const filename = `step_${stepNumber.toString().padStart(3, '0')}.png`;
      const outputPath = path.join(outputDir, filename);
      
      await fs.promises.writeFile(outputPath, annotatedBuffer);
      return outputPath;
      
    } catch (error) {
      throw new Error(`Failed to take annotated screenshot: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async createClickCircle(): Promise<Buffer> {
    // Create a red circle overlay for click annotation
    const size = 30;
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 2}" 
                stroke="#ef4444" stroke-width="3" fill="none" opacity="0.8"/>
      </svg>
    `;
    
    return Buffer.from(svg);
  }

  private extractWindowHandle(displayId: string): number {
    // Parse window handle from display_id
    // This is a simplified implementation - the actual format depends on the platform
    try {
      const match = displayId.match(/(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    } catch {
      return 0;
    }
  }

  // Utility method to get virtual screen bounds (all displays)
  public getVirtualScreenBounds(): Rectangle {
    const displays = screen.getAllDisplays();
    
    let minX = Number.MAX_SAFE_INTEGER;
    let minY = Number.MAX_SAFE_INTEGER;
    let maxX = Number.MIN_SAFE_INTEGER;
    let maxY = Number.MIN_SAFE_INTEGER;
    
    for (const display of displays) {
      minX = Math.min(minX, display.bounds.x);
      minY = Math.min(minY, display.bounds.y);
      maxX = Math.max(maxX, display.bounds.x + display.bounds.width);
      maxY = Math.max(maxY, display.bounds.y + display.bounds.height);
    }
    
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }

  // Platform-specific window management methods would go here
  // These would need to be implemented using native modules for each platform
  
  // For Windows, you'd use win32 APIs like FindWindowEx, GetWindowRect, etc.
  // For macOS, you'd use Cocoa/Accessibility APIs
  // For Linux, you'd use X11 or Wayland APIs
  
  // Example placeholder methods:
  
  private async getWindowsOnWindows(): Promise<WindowInfo[]> {
    // Would use native Windows APIs
    return [];
  }
  
  private async getWindowsOnMac(): Promise<WindowInfo[]> {
    // Would use native macOS APIs
    return [];
  }
  
  private async getWindowsOnLinux(): Promise<WindowInfo[]> {
    // Would use native Linux APIs
    return [];
  }

  // Cross-platform window detection
  public async getWindowsForPlatform(): Promise<WindowInfo[]> {
    switch (process.platform) {
      case 'win32':
        return this.getWindowsOnWindows();
      case 'darwin':
        return this.getWindowsOnMac();
      case 'linux':
        return this.getWindowsOnLinux();
      default:
        return this.getWindows(); // Fallback to desktopCapturer method
    }
  }
}