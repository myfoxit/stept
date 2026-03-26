// Element finding logic — extracted from original guide-runtime IIFE
// KEEP: all scoring/finding logic unchanged

import type { GuideStep, FindResult, AdjustedRect, SearchRoot, IframeOffset } from './types';

export const normalizeText = (value: string | null | undefined): string =>
  String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

const unique = <T>(values: (T | null | undefined)[]): T[] => {
  const seen = new Set<T>();
  const result: T[] = [];
  for (const value of values) {
    if (value == null || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
};

export function isProbablyVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement || element instanceof SVGElement)) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = getComputedStyle(element as Element);
  if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') return false;
  if (parseFloat(style.opacity || '1') === 0) return false;
  const cx = Math.min(window.innerWidth - 1, Math.max(0, rect.left + rect.width / 2));
  const cy = Math.min(window.innerHeight - 1, Math.max(0, rect.top + rect.height / 2));
  const top = element.ownerDocument.elementFromPoint(cx, cy);
  if (!top) return true;
  return top === element || element.contains(top) || top.contains(element);
}

export function collectSearchRoots(root: Document | ShadowRoot = document, offset: IframeOffset = { x: 0, y: 0 }): SearchRoot[] {
  const roots: SearchRoot[] = [{ root, iframeOffset: offset }];
  const visit = (nodeRoot: Document | ShadowRoot, nodeOffset: IframeOffset, depth: number): void => {
    if (depth > 4) return;
    nodeRoot.querySelectorAll('*').forEach((el) => {
      if ((el as HTMLElement).id === 'stept-guide-overlay-host') return;
      const shadow = (el as HTMLElement).shadowRoot;
      if (shadow) roots.push({ root: shadow, iframeOffset: nodeOffset });
    });
    nodeRoot.querySelectorAll('iframe').forEach((frame) => {
      try {
        const doc = (frame as HTMLIFrameElement).contentDocument;
        if (!doc) return;
        const rect = frame.getBoundingClientRect();
        const nextOffset = { x: nodeOffset.x + rect.left, y: nodeOffset.y + rect.top };
        roots.push({ root: doc, iframeOffset: nextOffset });
        visit(doc, nextOffset, depth + 1);
      } catch {}
    });
    nodeRoot.querySelectorAll('*').forEach((el) => {
      const shadow = (el as HTMLElement).shadowRoot;
      if (shadow) visit(shadow, nodeOffset, depth + 1);
    });
  };
  visit(root, offset, 0);
  return roots;
}

export class ElementFinder {
  static find(step: GuideStep): FindResult | null {
    const roots = collectSearchRoots();
    const candidates: FindResult[] = [];
    const selectors = unique<string>([
      ...(step.selector ? [step.selector] : []),
      ...(step.element_info?.selector ? [step.element_info.selector] : []),
      ...((step.element_info?.selectorSet || []) as string[]),
      ...((step.element_info?.selectorTree?.selectors || []) as string[]),
    ]);

    for (const selector of selectors) {
      const direct = this.findBySelector(selector, roots, 'selector');
      if (direct) candidates.push(direct);
    }

    const testId = step.element_info?.testId;
    if (testId) {
      for (const attr of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-hook', 'data-e2e', 'data-automation-id']) {
        const found = this.findBySelector(`[${attr}="${CSS.escape(testId)}"]`, roots, 'test-id');
        if (found) candidates.push(found);
      }
    }

    const ariaLabel = step.element_info?.ariaLabel;
    if (ariaLabel) {
      const tag = (step.element_info?.tagName || '*').toLowerCase();
      const found = this.findBySelector(`${tag}[aria-label="${CSS.escape(ariaLabel)}"]`, roots, 'aria-label');
      if (found) candidates.push(found);
    }

    const role = step.element_role || step.element_info?.role;
    const text = step.element_text || step.element_info?.text || step.element_info?.content;
    if (role && text) {
      const found = this.findByText((root) => Array.from(root.querySelectorAll(`[role="${role}"]`)), text, roots, 'role-text');
      if (found) candidates.push(found);
    }

    if (step.element_info?.tagName && text) {
      const found = this.findByText((root) => Array.from(root.querySelectorAll(step.element_info!.tagName!)), text, roots, 'tag-text');
      if (found) candidates.push(found);
    }

    if (step.xpath || step.element_info?.xpath) {
      const found = this.findByXPath(step.xpath || step.element_info?.xpath || '', roots);
      if (found) candidates.push(found);
    }

    const contextual = this.findByContext(step, roots);
    if (contextual) candidates.push(contextual);

    if (candidates.length === 0) return null;
    candidates.sort((a, b) => b.confidence - a.confidence);
    return candidates[0] || null;
  }

  private static findBySelector(selector: string, roots: SearchRoot[], method: string): FindResult | null {
    for (const { root, iframeOffset } of roots) {
      try {
        const elements = Array.from(root.querySelectorAll(selector)).filter(isProbablyVisible);
        if (elements.length === 1) {
          return { element: elements[0], confidence: 1, method, iframeOffset };
        }
      } catch {}
    }
    return null;
  }

  private static findByText(query: (root: Document | ShadowRoot) => Element[], text: string, roots: SearchRoot[], method: string): FindResult | null {
    const expected = normalizeText(text);
    if (!expected) return null;
    for (const { root, iframeOffset } of roots) {
      const candidates = query(root)
        .filter(isProbablyVisible)
        .map((element) => ({ element, actual: normalizeText((element as HTMLElement).innerText || element.textContent || element.getAttribute('aria-label') || '') }))
        .filter(({ actual }) => actual && (actual === expected || actual.includes(expected) || expected.includes(actual)))
        .sort((a, b) => Math.abs(a.actual.length - expected.length) - Math.abs(b.actual.length - expected.length));
      if (candidates[0]) {
        return { element: candidates[0].element, confidence: candidates[0].actual === expected ? 0.86 : 0.72, method, iframeOffset };
      }
    }
    return null;
  }

  private static findByXPath(xpath: string, roots: SearchRoot[]): FindResult | null {
    for (const { root, iframeOffset } of roots) {
      try {
        const doc = root instanceof Document ? root : root.ownerDocument || document;
        const result = doc.evaluate(xpath, root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        if (result instanceof Element && isProbablyVisible(result)) {
          return { element: result, confidence: 0.64, method: 'xpath', iframeOffset };
        }
      } catch {}
    }
    return null;
  }

  private static findByContext(step: GuideStep, roots: SearchRoot[]): FindResult | null {
    const info = step.element_info;
    if (!info?.tagName) return null;
    const expectedText = normalizeText(info.text || info.content || step.element_text || '');
    const parentText = normalizeText(info.parentText || '');
    for (const { root, iframeOffset } of roots) {
      const candidates = Array.from(root.querySelectorAll(info.tagName)).filter(isProbablyVisible);
      let best: { element: Element; score: number } | null = null;
      for (const element of candidates) {
        let score = 0;
        const text = normalizeText((element as HTMLElement).innerText || element.textContent || '');
        if (expectedText && text) {
          if (text === expectedText) score += 4;
          else if (text.includes(expectedText) || expectedText.includes(text)) score += 2;
        }
        if (info.id && element.id === info.id) score += 5;
        if (info.name && element.getAttribute('name') === info.name) score += 2;
        if (info.placeholder && element.getAttribute('placeholder') === info.placeholder) score += 2;
        if (info.href && element.getAttribute('href') === info.href) score += 2;
        if (info.role && element.getAttribute('role') === info.role) score += 2;
        if (info.ariaLabel && element.getAttribute('aria-label') === info.ariaLabel) score += 3;
        if (info.stableClassName && typeof (element as HTMLElement).className === 'string') {
          const stable = normalizeText(info.stableClassName);
          if (stable && normalizeText((element as HTMLElement).className).includes(stable)) score += 1;
        }
        if (parentText && element.parentElement) {
          const actualParentText = normalizeText(element.parentElement.textContent || '');
          if (actualParentText === parentText) score += 2;
          else if (actualParentText.includes(parentText)) score += 1;
        }
        if (info.parentChain?.length) {
          let current = element.parentElement;
          for (const parent of info.parentChain) {
            if (!current) break;
            if (parent.id && current.id === parent.id) score += 2;
            if (parent.role && current.getAttribute('role') === parent.role) score += 1;
            if (parent.testId && [current.getAttribute('data-testid'), current.getAttribute('data-test')].includes(parent.testId)) score += 2;
            current = current.parentElement;
          }
        }
        if (!best || score > best.score) best = { element, score };
      }
      if (best && best.score >= 4) {
        return { element: best.element, confidence: Math.min(0.84, 0.45 + best.score * 0.05), method: 'context', iframeOffset };
      }
    }
    return null;
  }
}

export function getAdjustedRect(result: FindResult): AdjustedRect {
  if (result.rect) return result.rect;
  const rect = result.element!.getBoundingClientRect();
  const offset = result.iframeOffset || { x: 0, y: 0 };
  return {
    left: rect.left + offset.x,
    top: rect.top + offset.y,
    width: rect.width,
    height: rect.height,
    right: rect.right + offset.x,
    bottom: rect.bottom + offset.y,
  };
}
