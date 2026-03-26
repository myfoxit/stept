# Tango Element Finding — Deep Dive Analysis

## Architecture Overview

Tango's element finding (`element-finding.js`, ~12764 lines) is far more sophisticated than Stept's.

### Key Differences from Stept:

## 1. Semantic Element Type Classification

Tango classifies elements into **semantic types** FIRST, then generates the appropriate query selector:

```javascript
// Tango's type system (22 types):
button: { tags: ['button', 'summary'], ariaRoles: ['button', 'tab'], inputTypes: ['button', 'submit'] }
link: { tags: ['a'], ariaRoles: ['link'] }
option: { tags: ['option'], ariaRoles: ['option', 'treeitem'] }
menuitem: { ariaRoles: ['menuitem'] }
comboboxSearch: { ariaRoles: ['combobox'] }
textbox: { tags: ['textarea', 'input'], ariaRoles: ['textbox'], contentEditable: true }
listitem: { tags: ['li'], ariaRoles: ['listitem'] }
// ... etc
```

The element type determines:
- Which CSS selector to use for candidate query
- Which scoring games to apply  
- What minimum score threshold to use

**Stept's approach:** Uses the RECORDED `tagName` directly in `querySelectorAll()`. If the tag changed, nothing is found.

**Tango's approach:** Classifies the recorded element by its semantic type (e.g., "link"), then queries ALL elements that could be that type: `a, [role="link"]`. This means if a link was recorded as `<a>` but is now `<div role="link">`, Tango still finds it.

## 2. The Scoring System (Point Map)

Tango uses a **versioned scoring config** (currently v13) with explicit point values:

```javascript
pointMap: {
  automationIdExact: 10,   // data-testid exact match
  labelExact: 9,           // aria-label / innerText exact match
  labelledByMatch: 6,      // aria-labelledby target match
  labelLoose: 5,           // text partial match
  contenteditable: 5,      // contentEditable match
  attributesId: 4,         // id attribute match
  attributesName: 4,       // name attribute match
  attributesHref: 3,       // href exact match
  parentMatch: 3,          // parent element match
  parentTableLabelExact: 3,
  attributesClassExact: 2, // className exact match
  attributesDataset: 2,    // data-* attribute match
  attributesDatasetExact: 2,
  attributesHrefPartial: 2,
  attributesPlaceholder: 2,
  attributesRole: 2,       // role attribute match
  attributesValue: 2,
  boundsSizeExact: 2,      // element dimensions match
  childExactMatch: 2,      // child element structure match
  childPartialMatch: 2,
  cssSelector: 2,          // CSS selector match (from XPath->CSS)
  iconMatch: 2,            // Icon hash match
  parentTextExact: 2,      // parent text exact match
  attributesClassPartial: 1,
  attributesDatasetPartial: 1,
  attributesEmpty: 1,
  attributesTagName: 1,    // tag name match (ONLY 1 point!)
  attributesType: 1,
  boundsSizeLoose: 1,
  parentTextPartial: 1,
}
```

**CRITICAL INSIGHT:** `tagName` is only worth **1 point**. It's the LEAST important signal. In Stept, tagName is used as the **primary query filter** — if it's wrong, nothing else runs.

## 3. Scoring Games (8 categories)

Each candidate element is scored across 8 independent "games":

1. **LABEL** (`zt`) — aria-label, innerText, alt, title, value match → 5-9 pts
2. **ATTRIBUTES** (`Yt`) — id, class, href, name, role, data-*, placeholder, type → 1-10 pts
3. **BOUNDS** (`Pn`) — element width/height match → 1-2 pts
4. **CSS_SELECTOR** (`Cn`) — XPath-derived CSS selector match → 2 pts
5. **PARENT** (`Tn`) — parent element containment → 3 pts
6. **LABELLED_BY** (`Gt`) — aria-labelledby target match → 6 pts
7. **CHILDREN** (`Vn`) — child element structure match → 2 pts
8. **ICON** (`Un`) — SVG/icon hash match → 2 pts

**Total possible: ~40+ points**

## 4. Dynamic Minimum Score

Tango doesn't use a fixed threshold. The minimum score is **calculated dynamically** based on what signals are available:

```javascript
minimumPointsRatio: 0.58,  // 58% of available signals must match
minimumPoints: 6,          // absolute minimum
```

For a "menuItem" step: ratio drops to 0.1 (very lenient)
For a "formItem" step: ratio drops to 0.2

So if a step only has text and href available (max ~12 points), minimum is 6.
But if a step has testId, label, href, parent, children (max ~30 points), minimum is ~17.

## 5. The Query Strategy

Tango's `Gn` (main find function):

1. **Classify** the recorded element into a semantic type
2. **Generate query** using the type's selectors: `s(role)` → `'a, [role="link"]'`
3. **Also search Shadow DOM** — explicitly traverses shadow roots
4. **Score ALL candidates** using ALL 8 games
5. **Sort by score**, pick best
6. **Check visibility** — if best is hidden, try second-best
7. **Check intermediate actions** — if element needs a parent to open first (dropdown, menu)

## 6. Label Matching (the `zt` function)

This is by far the most important game (9 points). It matches:
- `aria-label` exact → labelExact (9)
- `innerText` exact → labelExact (9)
- `alt` exact → labelExact (9)
- `title` exact → labelExact (9)
- `value` (for button/submit) → labelExact (9)
- Partial text match → labelLoose (5)

**For "API keys":** The text "API keys" would score labelExact=9 on any element whose innerText matches, regardless of tag.

## 7. What Stept is Missing

### Missing entirely:
- Semantic type classification (→ tag-agnostic querying)
- Label scoring as a standalone game (9 pts for text match!)
- Bounds/size matching
- Icon hash matching
- Child element structure matching
- Labelled-by matching (aria-labelledby)
- Dynamic minimum score calculation
- Intermediate action detection (need to open dropdown first)

### Present but broken:
- Tag-based querying (uses recorded tag, not semantic type)
- Text matching (only if tag matches first!)
- Attribute matching (only in findByContext which requires tagName)
- Parent chain matching (only in findByContext which requires tagName)

## Recommended Fix for Stept

The minimum viable fix: **Replace the tag-based candidate query with a semantic-type-based query.**

Instead of:
```typescript
root.querySelectorAll(info.tagName) // ONLY if tagName exists
```

Use:
```typescript
// Classify the recorded element into a semantic type
const semanticType = classifyElement(step);
// Query ALL elements that could match that type
root.querySelectorAll(getQueryForType(semanticType))
```

For "API keys" on the OpenAI sidebar:
- Recorded as: probably `<a>` with text "API keys"
- Live DOM: maybe `<a>`, `<div role="link">`, `<button>`, or custom component
- Tango query: `a, [role="link"]` → finds it
- Tango score: labelExact=9 + attributesHref=3 → score=12 → found
- Stept query: `a` only → if not `<a>`, nothing found
