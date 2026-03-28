import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ElementFinder, getAdjustedRect, normalizeText } from './element-finder';
import type { GuideStep } from './types';

describe('element-finder helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 1280, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 720, configurable: true });

    HTMLElement.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 20,
      y: 30,
      left: 20,
      top: 30,
      right: 180,
      bottom: 70,
      width: 160,
      height: 40,
      toJSON: () => ({}),
    }));

    SVGElement.prototype.getBoundingClientRect = vi.fn(() => ({
      x: 20,
      y: 30,
      left: 20,
      top: 30,
      right: 180,
      bottom: 70,
      width: 160,
      height: 40,
      toJSON: () => ({}),
    }));

    document.elementFromPoint = vi.fn((_x: number, _y: number) => {
      const hit = document.querySelector('[data-hit-target="true"]');
      return (hit as Element | null) ?? document.body;
    });

    Object.defineProperty(globalThis, 'CSS', {
      value: {
        escape: (value: string) => value.replace(/"/g, '\\"'),
      },
      configurable: true,
    });
  });

  it('normalizes mixed whitespace and casing', () => {
    expect(normalizeText('  Save   Draft\nNow  ')).toBe('save draft now');
    expect(normalizeText(null)).toBe('');
  });

  it('finds an exact selector match with full confidence', () => {
    document.body.innerHTML = `
      <button id="save-btn" data-hit-target="true">Save draft</button>
      <button>Discard</button>
    `;

    const step: GuideStep = {
      selector: '#save-btn',
      element_info: {
        tagName: 'button',
        text: 'Save draft',
      },
    };

    const result = ElementFinder.find(step);

    expect(result).not.toBeNull();
    expect(result?.method).toBe('selector');
    expect(result?.confidence).toBe(1);
    expect((result?.element as HTMLElement).id).toBe('save-btn');
  });

  it('uses test ids before broader scoring when the selector is unstable', () => {
    document.body.innerHTML = `
      <button data-testid="publish-action">Publish</button>
      <button data-testid="discard-action" data-hit-target="true">Discard</button>
    `;

    const step: GuideStep = {
      selector: '.generated-class-123',
      element_info: {
        tagName: 'button',
        testId: 'discard-action',
        text: 'Discard',
      },
    };

    const result = ElementFinder.find(step);

    expect(result).not.toBeNull();
    expect(result?.method).toBe('test-id');
    expect((result?.element as HTMLElement).dataset.testid).toBe('discard-action');
  });

  it('falls back to tango scoring when only semantic metadata survives', () => {
    document.body.innerHTML = `
      <div>
        <button aria-label="Archive project" class="primary-action" data-hit-target="true">Archive</button>
        <button aria-label="Delete project" class="danger-action">Delete</button>
      </div>
    `;

    const step: GuideStep = {
      element_role: 'button',
      element_info: {
        tagName: 'button',
        ariaLabel: 'Archive project',
        className: 'primary-action',
        text: 'Archive',
        elementRect: { x: 20, y: 30, width: 160, height: 40 },
      },
    };

    const result = ElementFinder.find(step);

    expect(result).not.toBeNull();
    expect(result?.method).toBe('tango-scoring:button');
    expect((result?.element as HTMLElement).getAttribute('aria-label')).toBe('Archive project');
    expect(result?.confidence).toBeGreaterThan(0.5);
  });

  it('adjusts rects by iframe offsets when replaying nested content', () => {
    const button = document.createElement('button');
    const rect = getAdjustedRect({
      element: button,
      confidence: 0.7,
      method: 'tango-scoring:button',
      iframeOffset: { x: 300, y: 120 },
    });

    expect(rect).toMatchObject({
      left: 320,
      top: 150,
      right: 480,
      bottom: 190,
      width: 160,
      height: 40,
    });
  });
});
