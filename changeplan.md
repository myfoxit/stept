# Change Plan — Element Detection, Event Ordering & Ghost Screenshots (Mac + Windows)

## Key Design Principle: Trust the Hit Element

The AX/UIA element returned directly at the click point should be **trusted** — if someone clicked on static text "Alexander Hoehne", that IS what they clicked. The problem is only when we **walk up/down the tree** to find text — that's where we should prefer actionable elements over random text.

**Decision tree:**
1. Hit element is actionable (button, link, tab, field, etc.) → **use it** (high confidence)
2. Hit element is meaningful text (AXStaticText with actual content) → **use it** (high confidence — user clicked ON this text)
3. Hit element is generic (AXGroup, AXScrollArea, empty) → **walk up** looking for actionable ancestor → if found, **use ancestor** (high confidence)
4. Walk-up found only non-actionable text → **use it but flag as low confidence** (Electron decides)
5. Nothing useful found / element title == window title → return nil → Electron uses "Click here"

---

## Changes

### Change 1: Split element detection from event emission (Mac + Windows parity)
**Files:** `native/macos/window-info.swift`
**Priority:** HIGH — fixes ghost screenshots + unblocks event tap

On Mac, element detection (AX queries, 10-50ms) runs in the `eventTapCallback` alongside screenshot capture. If it takes too long, the OS can timeout the tap and let the click through before we finish, causing ghost screenshots.

**New Mac flow:**
```
eventTapCallback:
  screenshot (3-5ms) → getWindowAtPoint → writeJSON(click with element:null) → return
  
background DispatchQueue (async):
  getElementAtPoint → writeJSON({"type":"element","timestamp":T,"element":{...}})
```

- Add `ElementSupplement` struct with `type = "element"`, `timestamp`, `element`
- Protect `writeJSON` with a lock (NSLock or serial DispatchQueue) since callback thread + element queue both write stdout
- `ensureEnhancedAccessibility` still runs in callback (it's cached/fast after first call)

**Windows:** Already correct — hooks write click immediately with `element: null`, TypeScript enriches via serve-mode `point` command. No change needed.

### Change 2: Smarter element resolution (Mac + Windows)
**Files:** `native/macos/window-info.swift`, `native/windows/WindowInfo.cs` (serve mode's point handler)

**Mac — rewrite `getElementAtPoint`:**

```
1. AXUIElementCopyElementAtPosition → hitElement
2. Check hitElement role:
   a. ACTIONABLE (AXButton, AXLink, AXMenuItem, AXTab, AXPopUpButton, 
      AXCheckBox, AXRadioButton, AXMenuBarItem, AXImage+title, AXCell) 
      → return buildElementInfo(hitElement, confidence: "high")
   b. FIELD (AXTextField, AXTextArea, AXComboBox, AXSearchField, AXSecureTextField)
      → return buildElementInfo(hitElement, confidence: "high")  
   c. TEXT (AXStaticText, AXHeading) with non-empty title/value
      → return buildElementInfo(hitElement, confidence: "high")
      // User clicked ON this text — trust it
   d. GENERIC (AXGroup, AXScrollArea, AXWebArea, empty role, or text with no content)
      → continue to step 3

3. Walk UP from hitElement (max 8 levels):
   - If ancestor is ACTIONABLE with text → return it (confidence: "high")
   - If ancestor is FIELD → return it (confidence: "high")
   - Track first ancestor with ANY text as fallback

4. If walk-up found text-only ancestor → return it (confidence: "low")
5. Try drillDown from hitElement (existing logic but only accept ACTIONABLE/FIELD)
6. Return nil if nothing useful
```

Remove the old `drillDown` → `walkUp` → `walkUp(hitElement)` chain. Replace with the above.

**Add to `ElementInfo`:**
- `domId: String` — from `AXDOMIdentifier` (Chrome exposes DOM id attributes)
- `confidence: String` — `"high"` or `"low"`

**Windows — update serve-mode `GetElementJson`:**
Apply the same logic: trust the UIA hit element, prefer actionable ancestors during walk-up, add confidence field. The Windows UIA roles map to: `Button`, `Hyperlink`, `MenuItem`, `TabItem`, `CheckBox`, `RadioButton`, `Edit`, `ComboBox`, `Text` (= static text, trust if direct hit), `Group`/`Pane` (= generic, walk up).

### Change 3: Event buffer for ordering (Electron — affects both OS)
**File:** `src/main/recording.ts`
**Priority:** MEDIUM

Replace the separate click-debounce + immediate-key paths with a unified event buffer.

**Implementation:**
```typescript
private eventBuffer: Array<{ event: NativeEvent; receivedAt: number }> = [];
private bufferFlushTimer: NodeJS.Timeout | null = null;
private readonly BUFFER_WINDOW_MS = 120;
private readonly BUFFER_CHECK_MS = 50;
```

**`handleNativeEvent`:** Push ALL events into buffer. Start flush timer if not running.

**`flushEventBuffer`:** 
- Sort buffer by native `timestamp`
- Process events older than BUFFER_WINDOW_MS:
  - Before processing a `click`, check if there's a matching `element` supplement (same timestamp ±5ms) in the buffer → merge element data into the click
  - Double-click detection: consecutive clicks within 300ms at same position (dx<5, dy<5) → merge
  - Then dispatch to existing handlers: `handleNativeClick` / `handleNativeKey`

**On stop recording:** Flush all remaining events immediately.

**Removes:** `pendingClick` mechanism, `lastClickTime`/`lastClickPos` debounce, separate `clickQueue`.

### Change 4: Improve Electron naming (affects both OS)
**File:** `src/main/recording.ts`
**Priority:** LOW

1. `formatElementName`: if `element.confidence === 'low'` and role is not actionable → return `''`
2. `formatElementName`: if element title == window title (or is substring minus browser suffix) → return `''`
3. `buildClickDescription`: when no element name → `"Click here"` (not `"Click in <window title>"`)
4. `shortenWindowTitle`: add em-dash profile stripping (` – ProfileName` pattern from Chrome)

### Change 5: Remove async screenshot fallback for clicks
**File:** `src/main/recording.ts`
**Priority:** LOW

Native synchronous screenshots (CGDisplayCreateImage / BitBlt) are reliable and capture pre-click state. The Electron `desktopCapturer` fallback is async and always too late.

- If no native pre-capture and no `event.screenshotPath` → skip screenshot (don't fall back to desktopCapturer)
- Remove `preCaptureScreenshot` method (the event buffer + native screenshot replaces it)

---

## Files Touched
| File | Changes |
|------|---------|
| `native/macos/window-info.swift` | 1 (async element), 2 (smart resolution) |
| `native/windows/WindowInfo.cs` | 2 (smart resolution in serve-mode point handler) |
| `src/main/recording.ts` | 3 (event buffer), 4 (naming), 5 (remove fallback) |

## Build & Test
- Mac: `cd native/macos && swiftc -O -o window-info window-info.swift -framework AppKit -framework CoreGraphics -framework ApplicationServices`
- Windows: `cd native\windows && dotnet publish -c Release -r win-x64 --self-contained`
- Electron: `npm run dev:electron`
