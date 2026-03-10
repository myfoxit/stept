import { EventEmitter } from 'events';
import { BrowserWindow, ipcMain, screen } from 'electron';
import * as path from 'path';

let sharp: any;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('sharp not available for blur:', (e as Error).message);
}

export interface BlurRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

const BLUR_PRELOAD_PATH = path.join(__dirname, 'blur-preload.js');

export class BlurService extends EventEmitter {
  private blurWindow: BrowserWindow | null = null;
  private regions: BlurRegion[] = [];
  private isActive = false;
  private displayBounds: Rectangle | null = null;

  constructor() {
    super();
    this.setupIpcListeners();
  }

  private setupIpcListeners(): void {
    ipcMain.on('blur:regions-updated', (_event, regions: BlurRegion[]) => {
      if (!Array.isArray(regions)) return;
      // Validate each region
      this.regions = regions.filter(r =>
        typeof r.id === 'string' &&
        typeof r.x === 'number' && typeof r.y === 'number' &&
        typeof r.width === 'number' && typeof r.height === 'number' &&
        r.width >= 10 && r.height >= 10
      );
      this.emit('regions-changed', this.regions);
    });

    ipcMain.on('blur:request-deactivate', () => {
      this.deactivate();
    });
  }

  /**
   * Show blur overlay on the specified display.
   * The overlay captures mouse events so the user can draw blur rectangles.
   */
  async activate(displayBounds: Rectangle): Promise<void> {
    if (this.blurWindow && !this.blurWindow.isDestroyed()) {
      // Already active — bring to front
      this.blurWindow.focus();
      return;
    }

    this.displayBounds = displayBounds;
    this.isActive = true;

    this.blurWindow = new BrowserWindow({
      x: displayBounds.x,
      y: displayBounds.y,
      width: displayBounds.width,
      height: displayBounds.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      hasShadow: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: BLUR_PRELOAD_PATH,
      },
    });

    this.blurWindow.setContentProtection(true);
    this.blurWindow.setVisibleOnAllWorkspaces(true);

    if (process.platform === 'darwin') {
      this.blurWindow.setAlwaysOnTop(true, 'screen-saver');
    }

    const overlayHtml = this.buildOverlayHtml();
    await this.blurWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHtml)}`);
    this.blurWindow.show();

    this.blurWindow.on('closed', () => {
      this.blurWindow = null;
      this.isActive = false;
      this.emit('state-changed', { isActive: false, regionCount: this.regions.length });
    });

    this.emit('state-changed', { isActive: true, regionCount: this.regions.length });
  }

  /** Hide blur overlay (keeps regions for screenshot processing) */
  deactivate(): void {
    if (this.blurWindow && !this.blurWindow.isDestroyed()) {
      this.blurWindow.close();
    }
    this.blurWindow = null;
    this.isActive = false;
    this.emit('state-changed', { isActive: false, regionCount: this.regions.length });
  }

  /** Get current blur regions */
  getRegions(): BlurRegion[] {
    return [...this.regions];
  }

  /** Clear all regions */
  clearRegions(): void {
    this.regions = [];
    this.emit('regions-changed', this.regions);
    this.emit('state-changed', { isActive: this.isActive, regionCount: 0 });
  }

  /** Check if blur overlay is currently active */
  getIsActive(): boolean {
    return this.isActive;
  }

  /** Get full state for renderer */
  getState(): { isActive: boolean; regionCount: number } {
    return { isActive: this.isActive, regionCount: this.regions.length };
  }

  /**
   * Apply blur to a screenshot buffer using Sharp.
   * For each blur region, extracts the area, blurs it, and composites it back.
   */
  async applyBlurToScreenshot(
    screenshotBuffer: Buffer,
    screenshotBounds: Rectangle,
    scaleFactor: number
  ): Promise<Buffer> {
    if (!sharp || this.regions.length === 0) {
      return screenshotBuffer;
    }

    const metadata = await sharp(screenshotBuffer).metadata();
    const imgWidth = metadata.width || 0;
    const imgHeight = metadata.height || 0;
    if (imgWidth === 0 || imgHeight === 0) return screenshotBuffer;

    // The display where the screenshot was taken
    const targetDisplay = screen.getDisplayNearestPoint({
      x: screenshotBounds.x,
      y: screenshotBounds.y,
    });
    const displayOriginX = targetDisplay.bounds.x;
    const displayOriginY = targetDisplay.bounds.y;

    const composites: Array<{ input: Buffer; left: number; top: number }> = [];

    for (const region of this.regions) {
      // Region coords are in overlay-local pixels (relative to display origin).
      // Convert to screenshot pixel coords (accounting for scale and screenshot bounds offset).
      const regionScreenX = region.x + displayOriginX;
      const regionScreenY = region.y + displayOriginY;

      // Convert to screenshot-relative coords
      const relX = regionScreenX - screenshotBounds.x;
      const relY = regionScreenY - screenshotBounds.y;

      // Scale to physical pixels
      const pLeft = Math.round(relX * scaleFactor);
      const pTop = Math.round(relY * scaleFactor);
      let pWidth = Math.round(region.width * scaleFactor);
      let pHeight = Math.round(region.height * scaleFactor);

      // Clamp to image bounds
      if (pLeft < 0 || pTop < 0) continue;
      pWidth = Math.min(pWidth, imgWidth - pLeft);
      pHeight = Math.min(pHeight, imgHeight - pTop);
      if (pWidth <= 0 || pHeight <= 0) continue;

      try {
        const blurRadius = Math.max(1, Math.round(20 * scaleFactor));
        const blurredRegion = await sharp(screenshotBuffer)
          .extract({ left: pLeft, top: pTop, width: pWidth, height: pHeight })
          .blur(blurRadius)
          .png()
          .toBuffer();

        composites.push({ input: blurredRegion, left: pLeft, top: pTop });
      } catch (e) {
        console.warn('Failed to blur region:', (e as Error).message);
      }
    }

    if (composites.length === 0) return screenshotBuffer;

    return sharp(screenshotBuffer)
      .composite(composites.map(c => ({
        input: c.input,
        left: c.left,
        top: c.top,
        blend: 'over' as any,
      })))
      .png()
      .toBuffer();
  }

  /** Clean up — call on app quit or recording stop */
  dispose(): void {
    this.deactivate();
    this.regions = [];
    ipcMain.removeAllListeners('blur:regions-updated');
    ipcMain.removeAllListeners('blur:request-deactivate');
    this.removeAllListeners();
  }

  // ------------------------------------------------------------------
  // Overlay HTML
  // ------------------------------------------------------------------

  private buildOverlayHtml(): string {
    // Serialize existing regions so they persist when re-opening the overlay
    const existingRegions = JSON.stringify(this.regions);

    return `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%;
    background: transparent;
    overflow: hidden;
    cursor: crosshair;
    user-select: none;
    -webkit-user-select: none;
  }
  body { position: relative; }

  /* Subtle tinted overlay to indicate blur mode is active */
  .mode-indicator {
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.7);
    color: #fff;
    padding: 6px 16px;
    border-radius: 20px;
    font: 12px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    z-index: 10000;
    pointer-events: none;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .blur-rect {
    position: absolute;
    background: rgba(0, 0, 0, 0.15);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 2px solid rgba(139, 92, 246, 0.6);
    border-radius: 3px;
    cursor: grab;
    min-width: 10px;
    min-height: 10px;
  }
  .blur-rect:hover { border-color: rgba(139, 92, 246, 0.9); }
  .blur-rect.dragging { cursor: grabbing; }

  .blur-rect .delete-btn {
    position: absolute;
    top: -8px; right: -8px;
    width: 18px; height: 18px;
    background: rgba(239, 68, 68, 0.9);
    border: none;
    border-radius: 50%;
    color: #fff;
    font-size: 11px;
    line-height: 18px;
    text-align: center;
    cursor: pointer;
    display: none;
    z-index: 1;
  }
  .blur-rect:hover .delete-btn { display: block; }

  /* Resize handles */
  .blur-rect .resize-handle {
    position: absolute;
    width: 10px; height: 10px;
    background: rgba(139, 92, 246, 0.8);
    border-radius: 2px;
    display: none;
    z-index: 1;
  }
  .blur-rect:hover .resize-handle { display: block; }
  .resize-handle.nw { top: -5px; left: -5px; cursor: nw-resize; }
  .resize-handle.ne { top: -5px; right: -5px; cursor: ne-resize; }
  .resize-handle.sw { bottom: -5px; left: -5px; cursor: sw-resize; }
  .resize-handle.se { bottom: -5px; right: -5px; cursor: se-resize; }

  /* Drawing preview */
  .draw-preview {
    position: absolute;
    border: 2px dashed rgba(139, 92, 246, 0.8);
    background: rgba(139, 92, 246, 0.08);
    pointer-events: none;
    display: none;
  }
</style>
</head>
<body>
<div class="mode-indicator">Blur Mode — Draw rectangles over sensitive areas. Press Esc to exit.</div>
<div class="draw-preview" id="drawPreview"></div>

<script>
(function() {
  const MIN_SIZE = 10;
  let regions = ${existingRegions};
  let drawing = false;
  let drawStart = null;
  let dragging = null; // { id, startX, startY, origX, origY }
  let resizing = null; // { id, corner, startX, startY, origRect }
  const preview = document.getElementById('drawPreview');

  function sendRegions() {
    if (window.blurAPI) {
      window.blurAPI.updateRegions(regions.map(r => ({
        id: r.id, x: r.x, y: r.y, width: r.width, height: r.height
      })));
    }
  }

  function renderRegions() {
    // Remove existing rect elements
    document.querySelectorAll('.blur-rect').forEach(el => el.remove());
    for (const r of regions) {
      const div = document.createElement('div');
      div.className = 'blur-rect';
      div.dataset.id = r.id;
      div.style.left = r.x + 'px';
      div.style.top = r.y + 'px';
      div.style.width = r.width + 'px';
      div.style.height = r.height + 'px';

      // Delete button
      const del = document.createElement('button');
      del.className = 'delete-btn';
      del.textContent = '\\u00d7';
      del.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        regions = regions.filter(rr => rr.id !== r.id);
        renderRegions();
        sendRegions();
      });
      div.appendChild(del);

      // Resize handles
      ['nw','ne','sw','se'].forEach(corner => {
        const handle = document.createElement('div');
        handle.className = 'resize-handle ' + corner;
        handle.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          resizing = {
            id: r.id, corner,
            startX: e.clientX, startY: e.clientY,
            origRect: { x: r.x, y: r.y, width: r.width, height: r.height }
          };
        });
        div.appendChild(handle);
      });

      // Drag to move
      div.addEventListener('mousedown', (e) => {
        if (e.target !== div) return;
        e.stopPropagation();
        div.classList.add('dragging');
        dragging = {
          id: r.id,
          startX: e.clientX, startY: e.clientY,
          origX: r.x, origY: r.y
        };
      });

      document.body.appendChild(div);
    }
  }

  // Drawing new rectangles on empty space
  document.body.addEventListener('mousedown', (e) => {
    if (e.target !== document.body && !e.target.classList.contains('mode-indicator')) return;
    drawing = true;
    drawStart = { x: e.clientX, y: e.clientY };
    preview.style.display = 'block';
    preview.style.left = e.clientX + 'px';
    preview.style.top = e.clientY + 'px';
    preview.style.width = '0px';
    preview.style.height = '0px';
  });

  document.addEventListener('mousemove', (e) => {
    if (drawing && drawStart) {
      const x = Math.min(e.clientX, drawStart.x);
      const y = Math.min(e.clientY, drawStart.y);
      const w = Math.abs(e.clientX - drawStart.x);
      const h = Math.abs(e.clientY - drawStart.y);
      preview.style.left = x + 'px';
      preview.style.top = y + 'px';
      preview.style.width = w + 'px';
      preview.style.height = h + 'px';
    }
    if (dragging) {
      const dx = e.clientX - dragging.startX;
      const dy = e.clientY - dragging.startY;
      const r = regions.find(rr => rr.id === dragging.id);
      if (r) {
        r.x = Math.max(0, dragging.origX + dx);
        r.y = Math.max(0, dragging.origY + dy);
        renderRegions();
      }
    }
    if (resizing) {
      const dx = e.clientX - resizing.startX;
      const dy = e.clientY - resizing.startY;
      const r = regions.find(rr => rr.id === resizing.id);
      if (!r) return;
      const orig = resizing.origRect;
      const corner = resizing.corner;
      if (corner === 'se') {
        r.width = Math.max(MIN_SIZE, orig.width + dx);
        r.height = Math.max(MIN_SIZE, orig.height + dy);
      } else if (corner === 'sw') {
        const newW = Math.max(MIN_SIZE, orig.width - dx);
        r.x = orig.x + orig.width - newW;
        r.width = newW;
        r.height = Math.max(MIN_SIZE, orig.height + dy);
      } else if (corner === 'ne') {
        r.width = Math.max(MIN_SIZE, orig.width + dx);
        const newH = Math.max(MIN_SIZE, orig.height - dy);
        r.y = orig.y + orig.height - newH;
        r.height = newH;
      } else if (corner === 'nw') {
        const newW = Math.max(MIN_SIZE, orig.width - dx);
        const newH = Math.max(MIN_SIZE, orig.height - dy);
        r.x = orig.x + orig.width - newW;
        r.y = orig.y + orig.height - newH;
        r.width = newW;
        r.height = newH;
      }
      renderRegions();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (drawing && drawStart) {
      const x = Math.min(e.clientX, drawStart.x);
      const y = Math.min(e.clientY, drawStart.y);
      const w = Math.abs(e.clientX - drawStart.x);
      const h = Math.abs(e.clientY - drawStart.y);
      if (w >= MIN_SIZE && h >= MIN_SIZE) {
        regions.push({
          id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          x, y, width: w, height: h
        });
        renderRegions();
        sendRegions();
      }
      preview.style.display = 'none';
      drawing = false;
      drawStart = null;
    }
    if (dragging) {
      document.querySelectorAll('.blur-rect').forEach(el => el.classList.remove('dragging'));
      dragging = null;
      sendRegions();
    }
    if (resizing) {
      resizing = null;
      sendRegions();
    }
  });

  // Escape to deactivate
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (window.blurAPI) window.blurAPI.requestDeactivate();
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // Could implement selected-region deletion here; for now, use X button
    }
  });

  // Initial render if restoring existing regions
  renderRegions();
  sendRegions();
})();
</script>
</body>
</html>`;
  }
}
