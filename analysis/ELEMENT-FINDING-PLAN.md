# Element Finding — Synthesis & Implementation Plan

**Date:** 2026-03-25
**Sources:** Tango v8.6.6 (source), Scribe v2.86.0 (source), browser-use (GitHub), Usertour (docs)
**Goal:** Make guide replay bulletproof

---

## The Core Problem

Stept uses a **cascade** (try selector → try testid → try text → try xpath → give up). This fails because:
- If one strategy returns the WRONG element with high confidence, we stop looking
- Multiple candidates can't be compared — first match wins
- No way to combine weak signals (the selector is close AND the text matches AND the position is right)

## The Solution: Multi-Signal Scoring (from Tango)

Instead of a cascade, **score every candidate element against every available signal simultaneously**. Highest score wins.

### Tango's Actual Point Map (from source code)

```
automationIdExact:   10   (data-testid, data-cy, etc.)
labelExact:           9   (exact text/aria-label match)
labelledByMatch:      6   (aria-labelledby reference)
contenteditable:      5
labelLoose:           5   (fuzzy text match)
attributesId:         4   (id attribute — only if stable)
attributesName:       4   (name attribute)
attributesHref:       3   (href match)
parentMatch:          3   (parent chain verification)
parentTableLabelExact:3   (table header context)
attributesClassExact: 2   (exact class match)
attributesDatasetExact:2  (data-* attributes)
attributesPlaceholder:2   (placeholder match)
attributesRole:       2   (ARIA role)
attributesValue:      2   (form value)
boundsSizeExact:      2   (element dimensions match)
cssSelector:          2   (CSS selector from recording)
childExactMatch:      2   (child elements match)
iconMatch:            2   (icon hash match)
parentTextExact:      2   (parent text)
attributesHrefPartial:2   (partial href)
attributesTagName:    1   (same HTML tag)
attributesType:       1   (input type)
attributesClassPartial:1  (partial class match)
boundsSizeLoose:      1   (approximate dimensions)
parentTextPartial:    1   (partial parent text)
```

Minimum score to accept = `floor(ratio * maxPossibleScore)` where ratio ~0.4 for normal elements, +0.1 for menu items, +0.2 for form items.

### What We Add Beyond Tango

**From Scribe:**
- Walk-up-to-parent: if clicked element has no useful attributes, record the nearest ancestor that does
- Dead-simple ID filter: `/\d+/.test(id)` → skip. Catches React, Radix, Angular, MUI, everything.

**From browser-use:**
- **Accessibility tree data** — record `computedRole` and `computedName` (Chrome supports these)
- **Element hash** — parentPath + stableAttributes + accessibleName. Framework-agnostic fingerprint.
- **Dynamic class filtering** — strip focus/hover/active/loading/transition classes before comparison

**Our innovations:**
- **Accessible name as top signal** — `element.computedName` gives you what screen readers see. It's computed from aria-label, aria-labelledby, visible text, alt, title, placeholder — all merged by the browser. More reliable than any single attribute.
- **Viewport proximity scoring** — when multiple candidates score equally, prefer the one closest to the recorded element position on screen
- **URL-scoped matching** — only score candidates that are on the expected URL's domain (prevents cross-page false matches)

---

## Implementation Plan

### Phase 1: Recording — Capture Better Data

**File: `extension/src/content/elements.ts`**

#### 1.1 Fix ID stability check (Scribe's approach)
```typescript
// CURRENT (broken):
if (el.id && !/^\d/.test(el.id) && !/^:/.test(el.id))

// NEW (Scribe-proven):
function _isStableId(id: string): boolean {
  if (!id) return false;
  if (/\d/.test(id)) return false;  // ANY digit = skip (Scribe's rule)
  return true;
}
```
Note: This is more aggressive than what we currently have. Scribe and Tango both do this. IDs with ANY digit are considered dynamic. This catches radix-:r1on:, search-ui-input-:r1ot:, mui-12345, react-select-2-input, etc.

#### 1.2 Record accessibility data
```typescript
// Add to captureElementInfo():
const computedRole = (el as any).computedRole || el.getAttribute('role') || null;
const computedName = (el as any).computedName || null;  // Chrome 100+
```

#### 1.3 Record element fingerprint (browser-use inspired)
```typescript
function computeElementHash(el: Element): string {
  const parts = [];
  // Parent path (tag names only, no indices — survives reordering)
  let p = el.parentElement;
  const parents = [];
  while (p && p !== document.body) {
    parents.unshift(p.tagName.toLowerCase());
    p = p.parentElement;
  }
  parts.push(parents.join('/'));
  
  // Stable attributes only
  const stable = ['role', 'name', 'type', 'placeholder', 'aria-label', 'href', 'data-testid'];
  for (const attr of stable) {
    const v = el.getAttribute(attr);
    if (v) parts.push(`${attr}=${v}`);
  }
  
  // Accessible name
  if ((el as any).computedName) parts.push(`an=${(el as any).computedName}`);
  
  return parts.join('|');
}
```

#### 1.4 Walk-up-to-parent (Scribe's pattern)
```typescript
// If the clicked element has no useful attributes, record the nearest useful ancestor
function getOptimizedTarget(el: Element): Element {
  const PRIORITY_ATTRS = ['aria-label', 'aria-placeholder', 'data-testid', 
                          'data-cy', 'data-test', 'name', 'role', 'placeholder', 'href', 'alt'];
  const SKIP_ATTRS = ['class', 'style', 'data-focused', 'aria-selected', 'aria-hidden'];
  
  const parent = el.parentElement;
  if (!parent) return el;
  
  // SVG path → use parent SVG/button
  if (el.tagName === 'path' && parent.tagName === 'svg') return parent;
  
  // If element has no priority attributes, check if parent does
  const hasUsefulAttrs = [...el.attributes].some(a => 
    PRIORITY_ATTRS.includes(a.name) && !SKIP_ATTRS.includes(a.name)
  );
  
  if (!hasUsefulAttrs) {
    const parentHasAria = [...parent.attributes].some(a => 
      PRIORITY_ATTRS.includes(a.name) || a.name.startsWith('aria-')
    );
    if (parentHasAria) return parent;
  }
  
  return el;
}
```

#### 1.5 Capture element bounds (Tango uses this for scoring)
Already captured as `elementRect` — good.

#### 1.6 Capture parent text context
```typescript
// Record immediate parent's text (Tango scores this)
parentText: el.parentElement?.textContent?.trim().slice(0, 100) || null
```
Already captured — good.

#### 1.7 Strip dynamic classes before storing
```typescript
const DYNAMIC_CLASS_PATTERNS = /\b(focus|hover|active|selected|loading|animate|transition|visible|hidden|open|closed|collapsed|expanded)\b/gi;
const stableClass = el.className.replace(DYNAMIC_CLASS_PATTERNS, '').replace(/\s+/g, ' ').trim();
```

---

### Phase 2: Replay — Multi-Signal Scoring

**File: `extension/src/guide-runtime/index.ts`**

Replace the cascade `findInRoot()` with a scoring function.

#### 2.1 Candidate Collection
```typescript
function collectCandidates(root: Document | ShadowRoot, step: GuideStep): Element[] {
  const tag = step.element_info?.tagName;
  const candidates: Element[] = [];
  
  // Start with elements matching the tag
  if (tag) {
    candidates.push(...Array.from(root.querySelectorAll(tag)));
  }
  
  // Add all interactive elements (for cross-tag matches)
  const interactive = 'a,button,input,select,textarea,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[tabindex]:not([tabindex="-1"]),[onclick],[contenteditable="true"]';
  candidates.push(...Array.from(root.querySelectorAll(interactive)));
  
  // Deduplicate
  return [...new Set(candidates)].filter(el => isVisible(el));
}
```

#### 2.2 Score Each Candidate
```typescript
interface Scorecard {
  element: Element;
  score: number;
  wins: string[];
}

const POINT_MAP = {
  // From Tango's actual weights, adjusted for our use
  automationIdExact:    10,
  accessibleNameExact:  9,   // NEW: computedName match — strongest signal
  labelExact:           9,
  labelledByMatch:      6,
  contenteditable:      5,
  labelLoose:           5,
  accessibleNameLoose:  4,   // NEW: fuzzy accessible name
  attributesId:         4,
  attributesName:       4,
  attributesHref:       3,
  parentMatch:          3,
  fingerprintMatch:     3,   // NEW: element hash match
  attributesClassExact: 2,
  attributesDataset:    2,
  attributesPlaceholder:2,
  attributesRole:       2,
  attributesValue:      2,
  boundsSizeExact:      2,
  cssSelector:          2,
  childMatch:           2,
  parentTextExact:      2,
  attributesTagName:    1,
  attributesType:       1,
  attributesClassPartial:1,
  boundsSizeLoose:      1,
  parentTextPartial:    1,
};

function scoreCandidate(el: Element, step: GuideStep): Scorecard {
  const sc: Scorecard = { element: el, score: 0, wins: [] };
  const info = step.element_info || {};
  
  function award(key: string) {
    sc.score += POINT_MAP[key] || 0;
    sc.wins.push(key);
  }
  
  // --- Tag ---
  if (info.tagName && el.tagName.toLowerCase() === info.tagName.toLowerCase()) {
    award('attributesTagName');
  }
  
  // --- Automation ID (data-testid, data-cy, etc.) ---
  for (const attr of ['data-testid', 'data-test', 'data-cy', 'data-qa', 'data-automation-id']) {
    if (info.testId && el.getAttribute(attr) === info.testId) {
      award('automationIdExact');
      break;
    }
  }
  
  // --- Accessible Name (NEW - strongest text signal) ---
  const recordedName = info.computedName;
  const currentName = (el as any).computedName;
  if (recordedName && currentName) {
    if (currentName === recordedName) award('accessibleNameExact');
    else if (normalizeText(currentName).includes(normalizeText(recordedName)) ||
             normalizeText(recordedName).includes(normalizeText(currentName))) {
      award('accessibleNameLoose');
    }
  }
  
  // --- Label/Text (Tango's labelExact/labelLoose) ---
  const recordedText = info.content || info.text || step.element_text;
  if (recordedText) {
    const elText = (el.textContent || '').trim();
    const normalized = normalizeText(elText);
    const target = normalizeText(recordedText);
    if (normalized === target) award('labelExact');
    else if (normalized.includes(target) || target.includes(normalized)) award('labelLoose');
  }
  
  // --- ID (only if stable) ---
  if (info.id && el.id === info.id && !(/\d/.test(info.id))) {
    award('attributesId');
  }
  
  // --- Placeholder ---
  if (info.placeholder && (el as HTMLInputElement).placeholder === info.placeholder) {
    award('attributesPlaceholder');
  }
  
  // --- aria-label ---
  if (info.ariaLabel && el.getAttribute('aria-label') === info.ariaLabel) {
    award('labelExact');  // Same weight as text match
  }
  
  // --- Role ---
  if (info.role && (el.getAttribute('role') === info.role || (el as any).computedRole === info.role)) {
    award('attributesRole');
  }
  
  // --- Name attribute ---
  if (info.name && el.getAttribute('name') === info.name) {
    award('attributesName');
  }
  
  // --- Type ---
  if (info.type && (el as HTMLInputElement).type === info.type) {
    award('attributesType');
  }
  
  // --- Href ---
  if (info.href && (el as HTMLAnchorElement).href) {
    if ((el as HTMLAnchorElement).href === info.href) award('attributesHref');
    else if ((el as HTMLAnchorElement).href.includes(info.href) || info.href.includes((el as HTMLAnchorElement).href)) {
      award('attributesHref'); // partial
    }
  }
  
  // --- CSS Selector (only if it uniquely matches THIS element) ---
  if (info.selector) {
    try {
      const matched = document.querySelector(info.selector);
      if (matched === el) award('cssSelector');
    } catch {}
  }
  
  // --- Bounds (element dimensions) ---
  if (info.elementRect) {
    const rect = el.getBoundingClientRect();
    if (Math.round(rect.width) === info.elementRect.width && 
        Math.round(rect.height) === info.elementRect.height) {
      award('boundsSizeExact');
    } else if (info.elementRect.width > 0 && info.elementRect.height > 0) {
      const wDiff = Math.abs(rect.width - info.elementRect.width) / info.elementRect.width;
      const hDiff = Math.abs(rect.height - info.elementRect.height) / info.elementRect.height;
      if (wDiff < 0.1 && hDiff < 0.1) award('boundsSizeLoose');
    }
  }
  
  // --- Class (with dynamic filtering) ---
  if (info.className && el.className) {
    const DYNAMIC = /\b(focus|hover|active|selected|loading|animate|transition|visible|hidden|open|closed)\b/gi;
    const recorded = (info.className || '').replace(DYNAMIC, '').trim();
    const current = (typeof el.className === 'string' ? el.className : '').replace(DYNAMIC, '').trim();
    if (recorded === current) award('attributesClassExact');
    else if (recorded && current) {
      const recSet = new Set(recorded.split(/\s+/));
      const curSet = new Set(current.split(/\s+/));
      const overlap = [...recSet].filter(c => curSet.has(c)).length;
      if (overlap > 0 && overlap >= recSet.size * 0.5) award('attributesClassPartial');
    }
  }
  
  // --- Parent text ---
  if (info.parentText && el.parentElement) {
    const pt = (el.parentElement.textContent || '').trim().slice(0, 100);
    if (pt === info.parentText) award('parentTextExact');
    else if (pt.includes(info.parentText.slice(0, 30))) award('parentTextPartial');
  }
  
  // --- Fingerprint (NEW) ---
  if (info.fingerprint) {
    const currentFP = computeElementHash(el);
    if (currentFP === info.fingerprint) award('fingerprintMatch');
  }
  
  // --- Contenteditable ---
  if (el.getAttribute('contenteditable') === 'true') {
    award('contenteditable');
  }
  
  return sc;
}
```

#### 2.3 Pick Winner
```typescript
function findElementByScoring(step: GuideStep): FindResult | null {
  const searchRoots = collectSearchRoots();
  let allScorecards: Scorecard[] = [];
  
  for (const { root, iframeOffset } of searchRoots) {
    const candidates = collectCandidates(root, step);
    for (const el of candidates) {
      const sc = scoreCandidate(el, step);
      if (sc.score > 0) {
        allScorecards.push(sc);
      }
    }
  }
  
  // Sort by score descending
  allScorecards.sort((a, b) => b.score - a.score);
  
  if (allScorecards.length === 0) return null;
  
  const best = allScorecards[0];
  
  // Minimum score threshold (Tango's ratio approach)
  // Calculate max possible score for this step's data
  const maxPossible = calculateMaxPossible(step);
  const minRequired = Math.floor(maxPossible * 0.3); // 30% minimum
  
  if (best.score < minRequired) return null;
  
  // If top two candidates are very close, use viewport proximity as tiebreaker
  if (allScorecards.length > 1) {
    const second = allScorecards[1];
    if (best.score - second.score <= 2 && step.element_info?.elementRect) {
      // Tiebreaker: prefer element closest to recorded position
      const bestDist = distanceToRecordedPosition(best.element, step.element_info.elementRect);
      const secondDist = distanceToRecordedPosition(second.element, step.element_info.elementRect);
      if (secondDist < bestDist * 0.5) {
        return { element: second.element, confidence: second.score / maxPossible, method: 'scoring+position' };
      }
    }
  }
  
  return { 
    element: best.element, 
    confidence: best.score / maxPossible, 
    method: `scoring(${best.wins.join(',')})` 
  };
}
```

---

### Phase 3: Side Panel & UX (already mostly done)

- Dark pill tooltip ✅
- No modals ✅  
- Sidepanel-driven ✅
- Mark as complete always visible ✅
- Calm status messages ✅

---

## Migration Path

1. **Recording side**: New recordings get richer data (accessibility, fingerprint, walk-up-to-parent). Old recordings still work — scoring just has fewer signals to work with.

2. **Replay side**: The scoring function replaces the cascade. It naturally handles both old recordings (fewer signals, lower scores but still finds elements) and new recordings (more signals, higher confidence).

3. **Self-healing**: When scoring finds an element that the old selectors missed, we can update the stored selectors for next time (Phase 5 from GUIDE-REPLAY-PLAN.md).

---

## Files to Change

| File | Change |
|------|--------|
| `extension/src/content/elements.ts` | Fix `_isStableId`, add accessibility capture, fingerprint, walk-up-to-parent, strip dynamic classes |
| `extension/src/guide-runtime/index.ts` | Replace cascade `findInRoot` with scoring-based `findElementByScoring` |
| `api/app/routers/process_recording.py` | Pass new fields through `interactive-guide` endpoint |

---

## Why This Works

The cascade fails for our OpenAI workflow because:
- Step 2: CSS selector has fragile Google DOM path → cascade trusts it → wrong element
- Step 3: Radix random ID → selector fails → text search → "API-Plattform" matches WRONG element (footer link scores equally with nav link)
- Steps 6-7: Radix random ID → selector fails → no text (empty input) → nothing found

With scoring:
- Step 2: CSS selector gets 2 pts, but `labelExact("OpenAI API")` + `tagName(a)` + `href(openai.com)` = 13 pts → right element
- Step 3: CSS selector fails (0 pts), but `labelExact("API-Plattform")` + `parentMatch(menu)` + `boundsSizeExact` = 14 pts for the nav link vs 10 pts for the footer link → right element
- Steps 6-7: CSS selector fails, but `placeholder("My Test Key")` + `tagName(input)` + `type(text)` = 5 pts → finds it

The scoring approach is inherently more resilient because **no single signal failure kills the match**.
