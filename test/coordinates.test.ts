import { describe, it, expect } from 'vitest';
import {
  toLogical,
  computeAnnotationPixel,
  screenshotRelativePosition,
  fullCoordPipeline,
  CoordSpace,
} from '../src/main/recording-utils';

// =====================================================================
// toLogical
// =====================================================================

describe('toLogical — coordinate normalization', () => {
  it('macOS logical coords pass through unchanged', () => {
    expect(toLogical(500, 300, 'logical', 2.0)).toEqual({ x: 500, y: 300 });
  });

  it('macOS logical coords pass through even with scale=1', () => {
    expect(toLogical(500, 300, 'logical', 1.0)).toEqual({ x: 500, y: 300 });
  });

  it('Windows physical coords divided by 1.5x scale', () => {
    // 1920×1200 physical → 1280×800 logical at 150%
    expect(toLogical(1920, 1200, 'physical', 1.5)).toEqual({ x: 1280, y: 800 });
  });

  it('Windows physical coords divided by 2x scale', () => {
    expect(toLogical(1000, 600, 'physical', 2.0)).toEqual({ x: 500, y: 300 });
  });

  it('Windows physical coords at 125% scale', () => {
    expect(toLogical(1600, 1000, 'physical', 1.25)).toEqual({ x: 1280, y: 800 });
  });

  it('Windows physical coords pass through when scale=1 (100% DPI)', () => {
    expect(toLogical(500, 300, 'physical', 1.0)).toEqual({ x: 500, y: 300 });
  });

  it('rounds to nearest integer', () => {
    // 333 / 1.5 = 222.0 exact
    expect(toLogical(333, 333, 'physical', 1.5)).toEqual({ x: 222, y: 222 });
    // 100 / 1.5 = 66.67 → 67
    expect(toLogical(100, 100, 'physical', 1.5)).toEqual({ x: 67, y: 67 });
  });

  it('handles zero coordinates', () => {
    expect(toLogical(0, 0, 'physical', 2.0)).toEqual({ x: 0, y: 0 });
    expect(toLogical(0, 0, 'logical', 2.0)).toEqual({ x: 0, y: 0 });
  });

  it('handles negative coordinates (multi-monitor left of primary)', () => {
    expect(toLogical(-500, 200, 'physical', 1.5)).toEqual({ x: -333, y: 133 });
  });
});

// =====================================================================
// screenshotRelativePosition
// =====================================================================

describe('screenshotRelativePosition', () => {
  const region = { x: 100, y: 50, width: 1280, height: 800 };

  it('click inside region → correct offset', () => {
    expect(screenshotRelativePosition({ x: 500, y: 300 }, region)).toEqual({ x: 400, y: 250 });
  });

  it('click at region origin → (0, 0)', () => {
    expect(screenshotRelativePosition({ x: 100, y: 50 }, region)).toEqual({ x: 0, y: 0 });
  });

  it('click at region bottom-right → clamped to (width-1, height-1)', () => {
    expect(screenshotRelativePosition({ x: 1380, y: 850 }, region)).toEqual({ x: 1279, y: 799 });
  });

  it('click past region bottom-right → clamped', () => {
    expect(screenshotRelativePosition({ x: 2000, y: 2000 }, region)).toEqual({ x: 1279, y: 799 });
  });

  it('click before region origin → clamped to 0', () => {
    expect(screenshotRelativePosition({ x: 0, y: 0 }, region)).toEqual({ x: 0, y: 0 });
  });

  it('region at (0,0)', () => {
    const r = { x: 0, y: 0, width: 1920, height: 1080 };
    expect(screenshotRelativePosition({ x: 500, y: 300 }, r)).toEqual({ x: 500, y: 300 });
  });
});

// =====================================================================
// computeAnnotationPixel
// =====================================================================

describe('computeAnnotationPixel', () => {
  it('macOS Retina 2x — annotation at double the logical offset', () => {
    const region = { x: 0, y: 0, width: 1440, height: 900 };
    const result = computeAnnotationPixel({ x: 500, y: 300 }, region, 2.0);
    expect(result).toEqual({ x: 1000, y: 600, inBounds: true });
  });

  it('Windows 150% — annotation position', () => {
    const region = { x: 0, y: 0, width: 1280, height: 800 };
    const result = computeAnnotationPixel({ x: 500, y: 300 }, region, 1.5);
    expect(result).toEqual({ x: 750, y: 450, inBounds: true });
  });

  it('1x scale — annotation equals logical position', () => {
    const region = { x: 0, y: 0, width: 1920, height: 1080 };
    const result = computeAnnotationPixel({ x: 500, y: 300 }, region, 1.0);
    expect(result).toEqual({ x: 500, y: 300, inBounds: true });
  });

  it('with region offset — subtracts origin', () => {
    const region = { x: 200, y: 100, width: 800, height: 600 };
    const result = computeAnnotationPixel({ x: 500, y: 400 }, region, 2.0);
    expect(result).toEqual({ x: 600, y: 600, inBounds: true });
  });

  it('click outside region → inBounds=false', () => {
    const region = { x: 0, y: 0, width: 100, height: 100 };
    const result = computeAnnotationPixel({ x: 200, y: 200 }, region, 1.0);
    expect(result.inBounds).toBe(false);
  });

  it('click before region → negative pixel, inBounds=false', () => {
    const region = { x: 500, y: 500, width: 100, height: 100 };
    const result = computeAnnotationPixel({ x: 0, y: 0 }, region, 1.0);
    expect(result.x).toBe(-500);
    expect(result.inBounds).toBe(false);
  });
});

// =====================================================================
// fullCoordPipeline — end-to-end DPI matrix
// =====================================================================

describe('fullCoordPipeline — DPI matrix', () => {
  const testCases: {
    name: string;
    rawX: number; rawY: number;
    coordSpace: CoordSpace;
    captureRegion: { x: number; y: number; width: number; height: number };
    scale: number;
    expectedLogical: { x: number; y: number };
    expectedAnnotation: { x: number; y: number };
    expectedImageSize: { width: number; height: number };
  }[] = [
    {
      name: 'macOS Retina 2x (1440×900 logical)',
      rawX: 500, rawY: 300,
      coordSpace: 'logical',
      captureRegion: { x: 0, y: 0, width: 1440, height: 900 },
      scale: 2.0,
      expectedLogical: { x: 500, y: 300 },
      expectedAnnotation: { x: 1000, y: 600 },
      expectedImageSize: { width: 2880, height: 1800 },
    },
    {
      name: 'macOS non-Retina 1x',
      rawX: 500, rawY: 300,
      coordSpace: 'logical',
      captureRegion: { x: 0, y: 0, width: 1920, height: 1080 },
      scale: 1.0,
      expectedLogical: { x: 500, y: 300 },
      expectedAnnotation: { x: 500, y: 300 },
      expectedImageSize: { width: 1920, height: 1080 },
    },
    {
      name: 'Windows 150% DPI (1280×800 logical, 1920×1200 physical)',
      rawX: 750, rawY: 450,
      coordSpace: 'physical',
      captureRegion: { x: 0, y: 0, width: 1280, height: 800 },
      scale: 1.5,
      expectedLogical: { x: 500, y: 300 },
      expectedAnnotation: { x: 750, y: 450 },
      expectedImageSize: { width: 1920, height: 1200 },
    },
    {
      name: 'Windows 200% DPI (960×540 logical, 1920×1080 physical)',
      rawX: 1000, rawY: 600,
      coordSpace: 'physical',
      captureRegion: { x: 0, y: 0, width: 960, height: 540 },
      scale: 2.0,
      expectedLogical: { x: 500, y: 300 },
      expectedAnnotation: { x: 1000, y: 600 },
      expectedImageSize: { width: 1920, height: 1080 },
    },
    {
      name: 'Windows 125% DPI',
      rawX: 625, rawY: 375,
      coordSpace: 'physical',
      captureRegion: { x: 0, y: 0, width: 1536, height: 864 },
      scale: 1.25,
      expectedLogical: { x: 500, y: 300 },
      expectedAnnotation: { x: 625, y: 375 },
      expectedImageSize: { width: 1920, height: 1080 },
    },
    {
      name: 'Windows 100% DPI (no scaling)',
      rawX: 500, rawY: 300,
      coordSpace: 'physical',
      captureRegion: { x: 0, y: 0, width: 1920, height: 1080 },
      scale: 1.0,
      expectedLogical: { x: 500, y: 300 },
      expectedAnnotation: { x: 500, y: 300 },
      expectedImageSize: { width: 1920, height: 1080 },
    },
    {
      name: 'macOS with capture region offset (secondary display)',
      rawX: 2000, rawY: 400,
      coordSpace: 'logical',
      captureRegion: { x: 1440, y: 0, width: 1920, height: 1080 },
      scale: 2.0,
      expectedLogical: { x: 2000, y: 400 },
      expectedAnnotation: { x: 1120, y: 800 },
      expectedImageSize: { width: 3840, height: 2160 },
    },
    {
      name: 'Windows multi-monitor negative offset',
      rawX: -375, rawY: 450,
      coordSpace: 'physical',
      captureRegion: { x: -1280, y: 0, width: 1280, height: 800 },
      scale: 1.5,
      expectedLogical: { x: -250, y: 300 },
      expectedAnnotation: { x: 1545, y: 450 },
      expectedImageSize: { width: 1920, height: 1200 },
    },
  ];

  for (const tc of testCases) {
    it(tc.name, () => {
      const result = fullCoordPipeline(tc.rawX, tc.rawY, tc.coordSpace, tc.captureRegion, tc.scale);

      expect(result.logical).toEqual(tc.expectedLogical);
      expect(result.annotationPixel.x).toBe(tc.expectedAnnotation.x);
      expect(result.annotationPixel.y).toBe(tc.expectedAnnotation.y);
      expect(result.annotationPixel.inBounds).toBe(true);
      expect(result.imageSize).toEqual(tc.expectedImageSize);
    });
  }

  it('annotation outside capture region → inBounds=false', () => {
    const result = fullCoordPipeline(0, 0, 'logical', { x: 500, y: 500, width: 100, height: 100 }, 1.0);
    expect(result.annotationPixel.inBounds).toBe(false);
  });

  it('roundtrip consistency: physical → logical → annotation → physical matches input', () => {
    // For any physical coord, the annotation pixel should equal the raw coord
    // when capture starts at (0,0) — because annotation = (raw/scale) * scale = raw
    for (const scale of [1.0, 1.25, 1.5, 1.75, 2.0]) {
      const rawX = 750;
      const rawY = 450;
      const logicalW = Math.round(1920 / scale);
      const logicalH = Math.round(1080 / scale);
      const result = fullCoordPipeline(rawX, rawY, 'physical', { x: 0, y: 0, width: logicalW, height: logicalH }, scale);

      // Should be very close to raw (rounding may differ by ±1)
      expect(Math.abs(result.annotationPixel.x - rawX)).toBeLessThanOrEqual(1);
      expect(Math.abs(result.annotationPixel.y - rawY)).toBeLessThanOrEqual(1);
    }
  });
});
