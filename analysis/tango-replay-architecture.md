# Tango Replay Architecture Analysis

Based on analysis of Tango Chrome extension v8.6.6 beautified source code.

## 1. Replay State Machine

### Key Files & Responsibilities:
- **BtgoBnV8.js** - Service worker, replay state machine, navigation handling
- **CYpKb1aB.js** - Main replay controller, step execution, clip-path rendering  
- **content-entry.js** - Content script bootstrap, route handling
- **element-finding.js** - Element scoring/matching system
- **Bw2Vl8wp.js** - Overlay UI, tooltips, highlights

### State Machine Flow:
The state machine is managed through **route-based state** rather than explicit states:

1. **Route.Hidden** - Guide not active
2. **Route.Viewing** - Guide active and running
3. **Route.Capturing** - Recording mode (not our concern)
4. **Route.Blurring** - Privacy mode (not our concern)

Key state transitions happen in `content-entry.js`:
```javascript
function F(e) {
  switch (e.route) {
    case i.Viewing:
      if (P) break;
      ((P = !0),
        c({ name: n.InjectPopupBlockCircumvention }),
        // Setup overlay and event handlers
        ));
      break;
    case i.Hidden:
      return B(); // Cleanup everything
  }
  // Route changed - update overlay
  if (e.route === i.Hidden && !e.params?.hasKnowledgeLayer) return B();
  L() || H(e);
}
```

## 2. Element Finding & Scoring System

### Core Element Finding (Mn function):
Located in `element-finding.js` around line 12079:

```javascript
function Mn(e, t, n) {
  let r = wn(e, !1, t);
  if (!e.tag) return null;
  let i = Array.from(t.body.querySelectorAll(e.tag)).map(xn),
    a = JSON.parse(e.attributes);
  for (let t of i) (Cn(t, r, n), Yt(t, e, a, !1, n), zt(t, e, a, n));
  Sn(i);  // Sort candidates by score
  let o = i[0];  // Best candidate
  return o
    ? Bt(e, a)
      ? o.wins.includes(`labelExact`)
        ? o.element
        : null
      : o.score > 4  // MINIMUM SCORE THRESHOLD
        ? o.element
        : null
    : null;
}
```

### Scoring System (K function):
```javascript
function K({ scorecard: e, key: t, config: n }) {
  ((e.score += n.pointMap[t]), e.wins.push(t));
}
```

### Key Scoring Categories (from Wn dispatcher):
1. **LABEL** - `zt` function - element labels/text matching
2. **ATTRIBUTES** - `Yt` function - id, class, aria attributes
3. **CSS_SELECTOR** - Direct CSS selector matching
4. **BOUNDS_SIZE** - Element size/position matching
5. **CHILDREN** - Child element structure
6. **ICON** - Icon hash matching
7. **PARENT_TEXT** - Text content in parent elements

### Element Type Classification:
The system uses semantic element types from object `t`:
- `button`, `link`, `option`, `menuitem`, `comboboxSearch`, etc.
- Each type has specific matching rules (`tags`, `ariaRoles`, `inputTypes`)

## 3. Step Advancement & Auto-Navigation

### Navigate Step Auto-Advancement:
Navigate steps automatically advance without user interaction. From stept's code this pattern should be:
```javascript
// Navigate / new-tab steps have no element to highlight — auto-advance
const isNavigateStep = actionType === 'navigate';
if (isNavigateStep) {
  chrome.runtime.sendMessage({
    type: 'GUIDE_STEP_CHANGED',
    currentIndex: index,
    totalSteps: this.steps.length,
    stepStatus: 'completed',
  }).catch(() => {});
  // Small delay so the sidepanel can update, then advance
  await new Promise<void>((r) => setTimeout(r, 300));
  if (this._stepSeq !== seq) return;
  this.showStep(index + 1);
  return;
}
```

### Click Detection & Auto-Advance:
Tango uses **both `pointerdown` and `click` events**:
- `pointerdown` for immediate navigation detection (links)
- `click` for standard interaction completion

From `content-entry.js`:
```javascript
window.addEventListener(
  `pointerdown`,
  (e) => {
    let t = X(e);
    t && c({ name: n.HandleDirectToGuidanceLinkClick, url: t });
  },
  !0,
);
```

## 4. Overlay System

### Highlight Ring:
- Uses **clip-path rendering** for complex shapes
- **No backdrop/dimming** - just highlight ring
- Dynamic positioning with iframe offset calculations
- Zoom factor compensation

### Tooltip Positioning:
- Smart positioning to avoid viewport edges
- Header offset detection (sticky/fixed elements)
- Scrolling behavior to keep elements visible
- Multi-line support with proper wrapping

### Spotlight Effect:
The system creates focused attention using:
1. Precise element highlighting with padding
2. Tooltip with clear instructions
3. Smooth scrolling to bring element into view
4. Detection of obstructing elements

## 5. Multi-Page Navigation

### URL Matching & Re-injection:
From `content-entry.js` bootstrap pattern:
1. **URL change detection** via navigation listeners
2. **Guide state preservation** across pages
3. **Smart re-injection** based on step expectations

Key pattern:
```javascript
function H(e) {
  (V?.abort(), (V = new AbortController()), U(e, V.signal));
}

async function U(a, o) {
  if (o.aborted || !document.body) return;
  // ... setup overlay for new page
}
```

### Page Load Synchronization:
- Waits for `document.body` to exist
- Handles iframe detection
- Zoom factor recalculation on page change
- Overlay re-creation (not restoration)

## 6. Element Not Found Handling

### Recovery Mechanism:
When primary element finding fails, Tango falls back to:
1. **Parent element searching** - traverse up DOM tree
2. **Sibling element matching** - similar elements nearby  
3. **Fuzzy text matching** - partial content matches
4. **Semantic role fallbacks** - alternative interaction methods

### Intermediate Actions (jn function):
Handles complex UI patterns like:
- **Dropdown opening** before option selection
- **Menu expansion** before menuitem clicks
- **Combobox activation** before option picking

Returns `J.NeedsIntermediateAction` status when prerequisite actions needed.

## 7. Hover & Intermediate Actions

### Hover Step Handling:
Hover steps are treated as **roadblocks** in current Stept implementation:
```javascript
// Hover steps can't be guided — treat as roadblock
const isHoverStep = actionType.includes('hover') || actionType.includes('mouseover');
if (isHoverStep) {
  chrome.runtime.sendMessage({
    type: 'GUIDE_STEP_CHANGED',
    currentIndex: index,
    totalSteps: this.steps.length,
    stepStatus: 'roadblock',
  }).catch(() => {});
}
```

### Intermediate Action Patterns:
Tango supports complex interaction sequences:
1. **Open dropdown** → **select option**
2. **Hover menu** → **click submenu item**  
3. **Focus input** → **type text**
4. **Expand accordion** → **interact with content**

## Key Architectural Insights

### 1. Route-Based State Management:
Tango doesn't use explicit state machines but route-based overlay management. State is implied by which route is active.

### 2. Scoring-Based Element Finding:
- Minimum score threshold (score > 4)
- Multiple scoring criteria combined
- Fallback mechanisms for recovery
- Type-specific matching rules

### 3. Event-Driven Advancement:
- Multiple event listeners for different interaction types
- Smart handling of navigation vs. interaction
- Prevention of double-advancement

### 4. Overlay Lifecycle:
- Complete recreation on page changes
- No state restoration, just re-evaluation
- Iframe and zoom compensation
- Dynamic positioning updates

### 5. Multi-Page Continuity:
- URL-based step matching
- Background script coordination
- Graceful handling of unexpected navigations
- Re-injection timing coordination

This architecture explains why Tango's replay system is robust - it uses multiple redundant mechanisms, sophisticated scoring, and handles edge cases that simple implementations miss.