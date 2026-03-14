import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Screenshot annotation pixel verification tests.
 * Creates synthetic images, annotates them using the same sharp pipeline
 * as screenshot.ts, then reads pixels back to verify annotation placement.
 *
 * These tests prove the MATH is correct:
 * - Click at logical (X, Y) with capture region and scale
 * - Annotation circle center lands at the right pixel in the output image
 * - Image dimensions match expected logical × scale
 */

let sharp: any;
let sharpAvailable = false;
try {
  sharp = require('sharp');
  sharpAvailable = true;
} catch {
  console.warn('sharp not installed — skipping screenshot pixel tests');
}

// ---- Helpers ----

/**
 * Create a solid-color test image of given dimensions.
 */
async function createTestImage(width: number, height: number, color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  }).png().toBuffer();
}

/**
 * Create a test image with colored quadrants (like a real screen with distinct regions).
 */
async function createQuadrantImage(width: number, height: number): Promise<Buffer> {
  const halfW = Math.floor(width / 2);
  const halfH = Math.floor(height / 2);

  // Create 4 solid quadrants and composite them
  const red = await sharp({ create: { width: halfW, height: halfH, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
  const green = await sharp({ create: { width: width - halfW, height: halfH, channels: 3, background: { r: 0, g: 255, b: 0 } } }).png().toBuffer();
  const blue = await sharp({ create: { width: halfW, height: height - halfH, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer();
  const yellow = await sharp({ create: { width: width - halfW, height: height - halfH, channels: 3, background: { r: 255, g: 255, b: 0 } } }).png().toBuffer();

  return sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([
      { input: red, left: 0, top: 0 },
      { input: green, left: halfW, top: 0 },
      { input: blue, left: 0, top: halfH },
      { input: yellow, left: halfW, top: halfH },
    ])
    .png()
    .toBuffer();
}

/**
 * Replicate the exact annotation pipeline from screenshot.ts.
 * This is the function under test — it must match screenshot.ts exactly.
 */
async function annotateImage(
  sourceImage: Buffer,
  clickPoint: { x: number; y: number },
  scale: number,
  cropRegion?: { left: number; top: number; width: number; height: number }
): Promise<Buffer> {
  let pipeline = sharp(sourceImage);

  if (cropRegion) {
    pipeline = pipeline.extract(cropRegion);
  }

  const meta = await sharp(sourceImage).metadata();
  const pWidth = cropRegion?.width ?? meta.width!;
  const pHeight = cropRegion?.height ?? meta.height!;

  const pClickX = Math.round(clickPoint.x * scale);
  const pClickY = Math.round(clickPoint.y * scale);

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

  return sharp(sourceImage)
    .extract(cropRegion ?? { left: 0, top: 0, width: meta.width!, height: meta.height! })
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
}

/**
 * Get RGB value at a specific pixel.
 */
async function getPixel(imageBuffer: Buffer, x: number, y: number): Promise<{ r: number; g: number; b: number; a?: number }> {
  const { data, info } = await sharp(imageBuffer).raw().toBuffer({ resolveWithObject: true });
  const idx = (y * info.width + x) * info.channels;
  return {
    r: data[idx],
    g: data[idx + 1],
    b: data[idx + 2],
    a: info.channels === 4 ? data[idx + 3] : undefined,
  };
}

/**
 * Check if a pixel is "reddish" (annotation color is #ef4444).
 */
function isReddish(pixel: { r: number; g: number; b: number }): boolean {
  return pixel.r > 150 && pixel.g < 120 && pixel.b < 120;
}

/**
 * Check if a pixel matches an expected color (with tolerance).
 */
function colorMatches(pixel: { r: number; g: number; b: number }, expected: { r: number; g: number; b: number }, tolerance = 30): boolean {
  return Math.abs(pixel.r - expected.r) < tolerance
    && Math.abs(pixel.g - expected.g) < tolerance
    && Math.abs(pixel.b - expected.b) < tolerance;
}

// =====================================================================
// Image dimension tests
// =====================================================================

describe.skipIf(!sharpAvailable)('screenshot image dimensions', () => {
  it('1x scale → image size equals input', async () => {
    const img = await createTestImage(1920, 1080, { r: 128, g: 128, b: 128 });
    const annotated = await annotateImage(img, { x: 500, y: 300 }, 1.0);
    const meta = await sharp(annotated).metadata();
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1080);
  });

  it('crop region produces correct output size', async () => {
    const img = await createTestImage(1920, 1080, { r: 128, g: 128, b: 128 });
    const annotated = await annotateImage(img, { x: 400, y: 300 }, 1.0, { left: 100, top: 50, width: 800, height: 600 });
    const meta = await sharp(annotated).metadata();
    expect(meta.width).toBe(800);
    expect(meta.height).toBe(600);
  });

  it('Retina 2x source image cropped correctly', async () => {
    // Simulate: logical 1440×900, physical 2880×1800
    const img = await createTestImage(2880, 1800, { r: 128, g: 128, b: 128 });
    const annotated = await annotateImage(img, { x: 500, y: 300 }, 2.0, { left: 0, top: 0, width: 2880, height: 1800 });
    const meta = await sharp(annotated).metadata();
    expect(meta.width).toBe(2880);
    expect(meta.height).toBe(1800);
  });

  it('Windows 150% source image cropped correctly', async () => {
    // Simulate: logical 1280×800 → physical 1920×1200
    const img = await createTestImage(1920, 1200, { r: 128, g: 128, b: 128 });
    const annotated = await annotateImage(img, { x: 500, y: 300 }, 1.5, { left: 0, top: 0, width: 1920, height: 1200 });
    const meta = await sharp(annotated).metadata();
    expect(meta.width).toBe(1920);
    expect(meta.height).toBe(1200);
  });
});

// =====================================================================
// Annotation placement tests — the money tests
// =====================================================================

describe.skipIf(!sharpAvailable)('annotation pixel placement', () => {
  it('annotation center is reddish at 1x scale', async () => {
    const img = await createTestImage(800, 600, { r: 200, g: 200, b: 200 }); // gray background
    const clickX = 400;
    const clickY = 300;
    const annotated = await annotateImage(img, { x: clickX, y: clickY }, 1.0);

    // The center dot (radius ~3px) should be red at the click point
    const pixel = await getPixel(annotated, clickX, clickY);
    expect(isReddish(pixel)).toBe(true);
  });

  it('annotation center is reddish at 2x scale', async () => {
    const img = await createTestImage(2880, 1800, { r: 200, g: 200, b: 200 });
    // Click at logical (500, 300) → pixel (1000, 600) at 2x
    const annotated = await annotateImage(img, { x: 500, y: 300 }, 2.0);
    const pixel = await getPixel(annotated, 1000, 600);
    expect(isReddish(pixel)).toBe(true);
  });

  it('annotation center is reddish at 1.5x scale', async () => {
    const img = await createTestImage(1920, 1200, { r: 200, g: 200, b: 200 });
    // Click at logical (500, 300) → pixel (750, 450) at 1.5x
    const annotated = await annotateImage(img, { x: 500, y: 300 }, 1.5);
    const pixel = await getPixel(annotated, 750, 450);
    expect(isReddish(pixel)).toBe(true);
  });

  it('background is NOT reddish far from annotation', async () => {
    const img = await createTestImage(800, 600, { r: 200, g: 200, b: 200 });
    const annotated = await annotateImage(img, { x: 400, y: 300 }, 1.0);
    // 100px away from annotation — should be original gray
    const farPixel = await getPixel(annotated, 100, 100);
    expect(isReddish(farPixel)).toBe(false);
    expect(colorMatches(farPixel, { r: 200, g: 200, b: 200 })).toBe(true);
  });

  it('annotation at (0,0) corner is clamped into image without crash', async () => {
    const img = await createTestImage(400, 300, { r: 200, g: 200, b: 200 });
    const annotated = await annotateImage(img, { x: 0, y: 0 }, 1.0);
    const meta = await sharp(annotated).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
    // The overlay is at (0,0), circle center at radius (15,15).
    // The center dot (r=3) is around pixel (15,15). Check there.
    const pixel = await getPixel(annotated, 15, 15);
    expect(isReddish(pixel)).toBe(true);
  });

  it('annotation at bottom-right corner is clamped', async () => {
    const img = await createTestImage(400, 300, { r: 200, g: 200, b: 200 });
    const annotated = await annotateImage(img, { x: 399, y: 299 }, 1.0);
    const meta = await sharp(annotated).metadata();
    expect(meta.width).toBe(400);
    expect(meta.height).toBe(300);
  });

  it('annotation at center of each quadrant lands on correct color', async () => {
    const img = await createQuadrantImage(800, 600);

    // Top-left (red quadrant) — annotation at (200, 150)
    const annotatedTL = await annotateImage(img, { x: 200, y: 150 }, 1.0);
    // Check a pixel NEAR the click but outside annotation radius
    // Annotation radius at 1x = 15px, so check at +25px offset
    const nearTL = await getPixel(annotatedTL, 225, 150);
    expect(colorMatches(nearTL, { r: 255, g: 0, b: 0 }, 40)).toBe(true);

    // Top-right (green quadrant) — annotation at (600, 150)
    const annotatedTR = await annotateImage(img, { x: 600, y: 150 }, 1.0);
    const nearTR = await getPixel(annotatedTR, 625, 150);
    expect(colorMatches(nearTR, { r: 0, g: 255, b: 0 }, 40)).toBe(true);

    // Bottom-left (blue quadrant) — annotation at (200, 450)
    const annotatedBL = await annotateImage(img, { x: 200, y: 450 }, 1.0);
    const nearBL = await getPixel(annotatedBL, 225, 450);
    expect(colorMatches(nearBL, { r: 0, g: 0, b: 255 }, 40)).toBe(true);

    // Bottom-right (yellow quadrant) — annotation at (600, 450)
    const annotatedBR = await annotateImage(img, { x: 600, y: 450 }, 1.0);
    const nearBR = await getPixel(annotatedBR, 625, 450);
    expect(colorMatches(nearBR, { r: 255, g: 255, b: 0 }, 40)).toBe(true);
  });
});

// =====================================================================
// Full DPI pipeline: raw coords → logical → annotation pixel verification
// =====================================================================

describe.skipIf(!sharpAvailable)('full DPI pipeline pixel verification', () => {
  /**
   * Simulate the EXACT recording pipeline:
   * 1. Raw event arrives with physical coords (on Windows) or logical (on macOS)
   * 2. Normalize to logical
   * 3. Compute screenshot-relative position
   * 4. Scale to pixel position for annotation
   * 5. Verify annotation is red at that pixel
   */

  async function verifyPipeline(params: {
    name: string;
    rawX: number; rawY: number;
    coordSpace: 'logical' | 'physical';
    captureRegion: { x: number; y: number; width: number; height: number };
    scale: number;
  }) {
    const { rawX, rawY, coordSpace, captureRegion, scale } = params;

    // Step 1: Normalize coords
    let logicalX = rawX, logicalY = rawY;
    if (coordSpace === 'physical' && scale > 1) {
      logicalX = Math.round(rawX / scale);
      logicalY = Math.round(rawY / scale);
    }

    // Step 2: Screenshot-relative position
    const relX = Math.max(0, Math.min(logicalX - captureRegion.x, captureRegion.width - 1));
    const relY = Math.max(0, Math.min(logicalY - captureRegion.y, captureRegion.height - 1));

    // Step 3: Create source image at physical dimensions
    const imgW = Math.round(captureRegion.width * scale);
    const imgH = Math.round(captureRegion.height * scale);
    const img = await createTestImage(imgW, imgH, { r: 200, g: 200, b: 200 });

    // Step 4: Annotate
    const annotated = await annotateImage(img, { x: relX, y: relY }, scale);

    // Step 5: Verify annotation at expected pixel
    const expectedPixelX = Math.round(relX * scale);
    const expectedPixelY = Math.round(relY * scale);

    // Clamp to image bounds (annotation pipeline does this)
    const safeX = Math.max(0, Math.min(expectedPixelX, imgW - 1));
    const safeY = Math.max(0, Math.min(expectedPixelY, imgH - 1));

    const pixel = await getPixel(annotated, safeX, safeY);
    expect(isReddish(pixel)).toBe(true);

    // Also verify image dimensions
    const meta = await sharp(annotated).metadata();
    expect(meta.width).toBe(imgW);
    expect(meta.height).toBe(imgH);
  }

  it('macOS Retina 2x', () => verifyPipeline({
    name: 'macOS Retina 2x',
    rawX: 500, rawY: 300,
    coordSpace: 'logical',
    captureRegion: { x: 0, y: 0, width: 1440, height: 900 },
    scale: 2.0,
  }));

  it('macOS non-Retina 1x', () => verifyPipeline({
    name: 'macOS non-Retina 1x',
    rawX: 500, rawY: 300,
    coordSpace: 'logical',
    captureRegion: { x: 0, y: 0, width: 1920, height: 1080 },
    scale: 1.0,
  }));

  it('Windows 150% DPI', () => verifyPipeline({
    name: 'Windows 150%',
    rawX: 750, rawY: 450,
    coordSpace: 'physical',
    captureRegion: { x: 0, y: 0, width: 1280, height: 800 },
    scale: 1.5,
  }));

  it('Windows 125% DPI', () => verifyPipeline({
    name: 'Windows 125%',
    rawX: 625, rawY: 375,
    coordSpace: 'physical',
    captureRegion: { x: 0, y: 0, width: 1536, height: 864 },
    scale: 1.25,
  }));

  it('Windows 200% DPI', () => verifyPipeline({
    name: 'Windows 200%',
    rawX: 1000, rawY: 600,
    coordSpace: 'physical',
    captureRegion: { x: 0, y: 0, width: 960, height: 540 },
    scale: 2.0,
  }));

  it('Windows 100% (no scaling)', () => verifyPipeline({
    name: 'Windows 100%',
    rawX: 500, rawY: 300,
    coordSpace: 'physical',
    captureRegion: { x: 0, y: 0, width: 1920, height: 1080 },
    scale: 1.0,
  }));

  it('macOS secondary display offset', () => verifyPipeline({
    name: 'macOS secondary display',
    rawX: 2000, rawY: 400,
    coordSpace: 'logical',
    captureRegion: { x: 1440, y: 0, width: 1920, height: 1080 },
    scale: 2.0,
  }));

  it('click near edge of capture region', () => verifyPipeline({
    name: 'edge click',
    rawX: 50, rawY: 50,
    coordSpace: 'logical',
    captureRegion: { x: 0, y: 0, width: 1920, height: 1080 },
    scale: 1.0,
  }));

  it('YOUR exact Windows bug scenario — 1920×1200 physical, 1280×800 logical', () => verifyPipeline({
    name: 'Alexander Windows machine',
    rawX: 1541, rawY: 687,
    coordSpace: 'physical',
    captureRegion: { x: 0, y: 0, width: 1280, height: 800 },
    scale: 1.5,
  }));
});

// =====================================================================
// Annotation size scaling tests
// =====================================================================

describe.skipIf(!sharpAvailable)('annotation size scales with DPI', () => {
  it('annotation circle is larger at 2x than at 1x', async () => {
    const img1x = await createTestImage(800, 600, { r: 200, g: 200, b: 200 });
    const img2x = await createTestImage(1600, 1200, { r: 200, g: 200, b: 200 });

    const annotated1x = await annotateImage(img1x, { x: 400, y: 300 }, 1.0);
    const annotated2x = await annotateImage(img2x, { x: 400, y: 300 }, 2.0);

    // Count reddish pixels in a region around the click point
    async function countRedPixels(img: Buffer, centerX: number, centerY: number, radius: number): Promise<number> {
      const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const px = centerX + dx;
          const py = centerY + dy;
          if (px < 0 || px >= info.width || py < 0 || py >= info.height) continue;
          const idx = (py * info.width + px) * info.channels;
          if (data[idx] > 150 && data[idx + 1] < 120 && data[idx + 2] < 120) {
            count++;
          }
        }
      }
      return count;
    }

    const redAt1x = await countRedPixels(annotated1x, 400, 300, 25);
    const redAt2x = await countRedPixels(annotated2x, 800, 600, 50);

    // 2x should have ~4x the red pixels (area scales quadratically)
    // Allow generous tolerance since antialiasing affects exact counts
    expect(redAt2x).toBeGreaterThan(redAt1x * 2);
    expect(redAt1x).toBeGreaterThan(10); // sanity: there should be SOME red
  });
});
