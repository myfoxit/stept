# Storylane Chrome Extension v4.0.3 — Technical Analysis

**Date**: 2026-03-22
**Purpose**: Competitive analysis for stept (open-source process documentation platform)
**Source**: Minified/bundled extension files from Storylane Chrome Extension v4.0.3

---

## Executive Summary

Storylane uses a **custom DOM serializer** (not rrweb-snapshot) built on top of a sophisticated page-capture library. Their approach creates a **full HTML clone** of the page, inlines CSS and assets, packages everything into a **ZIP archive**, and uploads via **AWS S3 multipart upload** with presigned URLs. For screenshots, they use `chrome.tabs.captureVisibleTab`. Their element identification uses a **cascading CSS selector strategy** (ID → href → class → tag → nth-child) rather than XPath. The entire system is React-based with Sentry error tracking.

---

## 1. DOM Capture Method

### Serialization Approach: Custom Serializer (NOT rrweb)
Storylane does **not** use rrweb-snapshot. Their core library (`web-capture.js`, 780KB) implements a custom `serialize()` function that:

- Uses `createTreeWalker` for efficient DOM traversal
- Walks `childNodes` recursively, checking `nodeType` for element classification
- Clones the DOM tree and processes it through a **processor chain**
- Outputs either an **HTML string** (with DOCTYPE) or **JSON** (structured `[doctype, elementTree]`)

### Processor Chain (htmlCaptureEngineScript.bundle.js)
The capture engine applies processors in sequence via `Mu()`:

1. **`ye()`** — Excludes Storylane's own injected scripts (`data-sl-engine-script`)
2. **`Be()`** — Normalizes SVG/resource URLs
3. **`Iu()`** — Filters out CSP meta tags, title, certain links, noframes, disabled stylesheets
4. **`Wu()`** — Marks invisible elements using `element.checkVisibility()` → sets `data-sl-hidden`
5. **`Uu()`** — Obfuscates password inputs (replaces value with `"sl-capture-fake-value"`)
6. **`ve()`** — SVG element handling
7. **`Ce()`** — Additional normalization
8. **`ju()`** — Background image URL processing
9. **`_u()`** — Canvas serialization (canvas → `toDataURL("image/png")` → background-image)

Post-processing walkers: `$u`, `we`, `Pe`, `Ku`, `Ou`, `Hu`

### Shadow DOM
- **30 `shadowRoot` references** in web-capture.js
- Uses `chrome.dom.openOrClosedShadowRoot(element)` to access shadow DOM
- Custom attribute `data-sl-shadow-root-id` for unique identification
- `data-sl-related-shadow-ids-list` links shadow DOM styles
- `SHADOW_ROOT_ATTRIBUTE_NAME` stored as custom attributes
- `Fu()` function restores shadow DOM structure after cloning

### Canvas Elements
- `toDataURL("image/png")` conversion (11 `image/png` references)
- WebGL contexts forced to `preserveDrawingBuffer: true` via `applyJsOverrides.bundle.js`
- Canvas content converted to CSS background-image data URIs

### SVG/Images
- Full SVG namespace support (`xmlns`, `foreignObject`)
- `parseSVGContent` and `parseXMLContent` parsers
- Handles `srcset` (13 refs), `currentSrc` (3 refs)
- `LAZY_SRC_ATTRIBUTE_NAME` for lazy-loaded images
- `getMediaAllInfo` function for comprehensive media metadata
- `naturalWidth`/`naturalHeight` for true image dimensions

### Iframes/Cross-Origin Frames
- Frame tree initialization via `webcapture.frameTree.initResponse` / `ackInitRequest` messages
- Each frame gets `data-sl-frame-uuid` identifier
- Cross-frame communication via `postMessage` + `chrome.tabs.sendMessage(tabId, msg, {frameId})`
- `web-capture-hooks-frames.js` overrides:
  - `IntersectionObserver` (mocked for cross-origin detection)
  - `Element.prototype.getBoundingClientRect` (viewport calculations)
  - Viewport dimension spoofing for lazy-loading triggers
- Frame events: `web-capture-load-deferred-images-start/end`, `web-capture-dispatch-scroll-event-start/end`

---

## 2. CSS Handling

### Stylesheet Capture
- Extracts `document.adoptedStyleSheets` → converts to `<style data-adopted-stylesheet="true">`
- Iterates `cssRules` from all stylesheets, converts to `cssText`
- `compressCSS` and CSS minification built-in
- `removeUnusedFonts` and `normalizeFontFamily` processors

### @import / @font-face
- `qu()` function **recursively resolves `@import` statements**
- Circular import detection prevents infinite loops
- `@font-face` rules explicitly handled
- Loads `document.fonts.ready` → filters to actually-loaded fonts via `Array.from(document.fonts)`
- 1-second timeout fallback via `Promise.race()`

### Pseudo-class/Pseudo-element Handling
Comprehensive support for CSS states:

**Pseudo-classes captured**: `:hover`, `:focus`, `:active`, `:visited`, `:link`, `:target`, `:disabled`, `:enabled`, `:checked`, `:indeterminate`, `:valid`, `:invalid`, `:required`, `:optional`, `:read-only`, `:read-write`

**Pseudo-elements captured**: `::before`, `::after`, `::first-line`, `::first-letter`, `::selection`, `::placeholder`, `::backdrop`, `::marker`, `::file-selector-button`

### CSS Parser
- Bundles a CSS parser library (likely `csstree`) with:
  - Tokenizer, at-rule parsing, media query support
  - Property value parsing and generation
  - Walk/transform utilities

### Feature Flags
- `ext_font_optimization` — optimized font capture
- `ext_image_optimization` — optimized image capture
- `ext_copy_styles` — copy styles mode
- `ext_capture_version` — capture version selection

---

## 3. Asset Handling

### Strategy: Inline + Fetch + ZIP Archive
- Resources fetched via `ze()` (async fetch with error handling) and `Ee()` (URL resource processor)
- `toDataURL` for canvas/media conversion
- `Blob` / `createObjectURL` for binary data
- Extensive `Uint8Array` / `DataView` usage for binary processing

### ZIP Packaging
- **71 `zip` references**, 10 `Archive`, 4 `ZIP` in web-capture.js
- Uses zip.js-style implementation with `createZipWriter`
- Built-in `Deflate`/`Inflate` compression (12/8 occurrences)
- Supports `CompressionStream`/`DecompressionStream` with fallback
- Worker support (27 `Worker` references) for parallel compression

### Upload Flow: AWS S3 Multipart
1. **`api_createAwsSignature`** → `POST v1/company/aws_signatures` — generate signature
2. **`api_startMultipartUpload`** → `POST v1/company/aws_signatures/multipart_create` — init upload
3. **`api_getMultipartPreSignedUrls`** → `POST v1/company/aws_signatures/multipart_sign` — sign parts
4. **`api_finishMultipartUpload`** → `POST v1/company/aws_signatures/multipart_complete` — finalize

### CDN
- `webCaptureUploadCdnResource` function for CDN resource upload
- Separate resource upload path from page HTML upload

### Video Capture
- `URL.revokeObjectURL` overridden to no-op (prevents blob garbage collection)
- Video poster frame capture via `videoElement.readyState` + `context.drawImage()`
- CORS restriction handling: "Could not capture video frame due to CORS restrictions (tainted canvas)"
- `video_clips_enabled` feature flag

---

## 4. Screenshot Capture (Image Mode)

### Method
- **`chrome.tabs.captureVisibleTab()`** — primary screenshot method
- `chrome.offscreen.create()` with `offscreen.html` for off-screen canvas rendering
- Screenshots sent as base64 data URLs

### Resolution/Quality
- Tracks `devicePixelRatio` for high-DPI support
- Records viewport as `${window.innerWidth}x${window.innerHeight}` string
- JPEG output format (`projectKind: Ho.image`)
- Default quality settings (not user-configurable in content script)

### Click Position Tracking
- **Percentage-based coordinates** (`percentCoords`) — not pixel-absolute
- Click coordinates sent with each `captureImage` action
- `targetBoundingRect: {top, left, right, bottom, width, height}` for clicked elements

### Capture Flow
1. 3-second countdown (`Qn.Countdown` state with 1333ms ticks)
2. Active capture (`Qn.Capturing` state)
3. 600ms screenshot tick interval (`captureScreenshotTick`)
4. Pause/resume support (`Qn.Paused` state)
5. Hotkey-driven: `captureHotkeyPressed`, `stopHotkeyPressed`, `pauseHotkeyPressed`

---

## 5. Click/Event Detection

### Events Captured (sendMessagesForEvents.bundle.js)
| Event | Method | Throttling |
|-------|--------|------------|
| Click | `mousedown` + `pointerdown` | 100ms minimum gap |
| Scroll | `wheel` | None |
| Drag | `mousedown` → `mouseup` delta > 30px | None |
| Keyup | `keyup` | None |
| Frame position | `mousemove` + `mousedown` | None |

### Element Identification: Cascading Selector Strategy

The `v()` function generates CSS selectors in priority order:

1. **ID**: `#myId` (filtered: no digits-first, no colons)
2. **Anchor href**: `a[href="..."]` (filtered: no `#`, `mailto:`, `tel:`)
3. **Class combination**: Up to 3 CSS classes (alphanumeric + hyphens + underscores only)
4. **Tag name**: HTML tag
5. **nth-child**: `:nth-of-type()` fallback

**Validation**: Every generated selector verified via `querySelectorAll()` — must return exactly 1 match.

**IFrame support**: Special `$IFRAME$` prefix for cross-frame selectors.

### Event Payload Structure
```javascript
{
  x: clientX,
  y: clientY,
  targetBoundingRect: { top, left, right, bottom, width, height },
  elementSelector: "CSS selector",
  closestLinkSelector: "a[href='...'] or null",
  widgetText: "Human-readable description",
  widgetMetaData: {
    elementType: "button|checkbox|radio|list-item|...",
    elementText: "trimmed element text"
  }
}
```

### Auto-Generated Widget Text (Natural Language)
The `D()` function produces user-facing descriptions:
- `"Click here"` (default)
- `"Choose {label text}"` (checkboxes/radios)
- `"Click the \"{placeholder}\" field"` (inputs)
- `"Click on \"{text}\""` (buttons/elements with content)
- `"Select \"{text}\""` (list items)

---

## 6. HTML Capture Mode vs Screenshot Mode

### HTML Capture Flow
1. Content script (`htmlCaptureScript.bundle.js`) injected
2. Engine script (`htmlCaptureEngineScript.bundle.js`) receives `captureV2` action
3. DOM cloned via processor chain → CSS inlined → assets fetched
4. Shadow DOM restored, frameset → CSS grid conversion
5. Nested buttons/links → spans (fixes HTML nesting violations)
6. Output: HTML string or JSON, sent via `chrome.runtime.sendMessage({action: "frameHtmlCaptured"})`
7. ZIP-packaged and uploaded to S3

### Screenshot (Image) Capture Flow
1. Content script (`imageCaptureScript.bundle.js`) injected — React UI overlay
2. 3-second countdown, then active capture mode
3. Each click: `chrome.tabs.captureVisibleTab()` → screenshot + coordinates + metadata
4. Click metadata (selector, text, bounding rect) attached per step
5. Direct upload per screenshot (no ZIP packaging)

### Key Differences
| Aspect | HTML Capture | Screenshot Capture |
|--------|-------------|-------------------|
| Fidelity | Full DOM + CSS + assets | Pixel-perfect image |
| Interactivity | Can replay interactions | Static images with hotspots |
| Size | Large (ZIP with assets) | Smaller per-step |
| Capture speed | Slower (DOM processing) | Faster (screenshot API) |
| Cross-origin | Limited by CORS | Captures visible pixels |
| Output format | HTML/JSON + ZIP | JPEG images |
| Feature flag | `json_capture_enabled` | Default mode |

---

## 7. Frame/Iframe Handling

### Frame Tree Architecture
- `webcapture.frameTree.initResponse` / `ackInitRequest` for tree initialization
- Each frame identified by `data-sl-frame-uuid`
- Messages routed via `chrome.tabs.sendMessage(tabId, msg, {frameId})`

### Cross-Origin Strategy
- `web-capture-hooks-frames.js` hooks into the page **before** capture:
  - Overrides `IntersectionObserver` (mocks for visibility detection)
  - Overrides `getBoundingClientRect` (viewport calculations)
  - Spoofs viewport dimensions (triggers lazy-loading in frames)
- Cookie/storage blocking: `web-capture-block-cookies-start/end`, `web-capture-block-storage-start/end`
- `HIDDEN_FRAME_ATTRIBUTE_NAME` for managing frame visibility

### Content Script Injection per Frame
- Engine script injected per frame via `chrome.tabs.sendMessage` with `frameId`
- Each frame independently captures its HTML and sends back via `frameHtmlCaptured`
- Parent frame reassembles frame content

---

## 8. JS Overrides (applyJsOverrides.bundle.js)

Two critical overrides (805 bytes total):

### 1. WebGL Drawing Buffer Preservation
```javascript
// Forces preserveDrawingBuffer: true for WebGL/WebGL2 contexts
HTMLCanvasElement.prototype.getContext = function(type, opts = {}) {
  if (type === "webgl" || type === "webgl2") {
    opts.preserveDrawingBuffer = true;
  }
  return originalGetContext.call(this, type, opts);
}
```
**Why**: Without this, WebGL canvas content is cleared before `toDataURL()` can capture it.

### 2. Blob URL Revocation Prevention
```javascript
URL.revokeObjectURL = function() {} // no-op
```
**Why**: Prevents pages from garbage-collecting blob URLs before the extension can capture referenced resources (images, videos, fonts loaded via `createObjectURL`).

---

## 9. Upload/Data Flow

### Architecture
```
Content Script → chrome.runtime.sendMessage → Background Script → S3 API
```

### Authentication
- **Bearer token** in `Authorization` header
- Token retrieved from cookie: `chrome.cookies.get({name: "token", url: "https://app.storylane.io"})`
- `credentials: "include"` on all fetch requests
- Custom header: `Extension-Version: ${version}`

### API Endpoints (api.storylane.io)

**Extension API (`ext/v1/`)**:
- `ext/v1/user` — user info
- `ext/v1/config` — configuration + feature flags
- `ext/v1/company/settings` — company settings
- `ext/v1/company/projects/{id}/pages` — create pages (POST)
- `ext/v1/company/projects/{id}/pages/bulk_action` — bulk delete
- `ext/v1/company/projects/{id}/flows` — flow management
- `ext/v1/company/projects/{id}/enhance` — AI content enhancement

**Main API (`v1/`)**:
- `v1/company/aws_signatures` — S3 upload signatures
- `v1/company/aws_signatures/multipart_*` — multipart upload lifecycle
- `v1/company/projects/{id}/flows/{flowId}/widgets` — widget CRUD

### Data Format
- Captured HTML/JSON packaged into **ZIP archive** with deflate compression
- ZIP uploaded via S3 multipart upload (presigned URLs)
- Screenshots uploaded as individual blobs
- All API communication is JSON over HTTPS

---

## 10. Surprising Findings & Notable Patterns

### What They Do Well
1. **ZIP packaging with streaming compression** — Uses Web Streams API (`ReadableStream`/`WritableStream`/`TransformStream`) with Worker threads for parallel compression. Much more efficient than base64-encoding everything.

2. **Cascading selector validation** — Every generated CSS selector is verified against the live DOM (`querySelectorAll` must return exactly 1 result). This avoids broken selectors.

3. **Natural language widget text** — Auto-generates human-readable step descriptions ("Click on 'Submit'", "Choose Marketing") rather than raw selectors. This is ready for their demo player without manual editing.

4. **Comprehensive pseudo-class/element capture** — Captures 16 pseudo-classes and 9 pseudo-elements. Most competitors only handle `:hover` and `::before`/`::after`.

5. **Frameset → CSS Grid conversion** — Converts legacy `<frameset>` elements to CSS Grid layout during capture, ensuring old pages render in modern browsers.

6. **HTML nesting violation fixes** — Converts nested `<button>` inside `<button>` and `<a>` inside `<a>` to `<span>` elements. This prevents rendering bugs in the replay.

7. **Circular @import detection** — Prevents infinite loops when CSS files import each other circularly.

8. **Password obfuscation** — Replaces password field values with `"sl-capture-fake-value"` to avoid capturing credentials.

9. **AI content enhancement** — `api_requestAIEnhancement` with tone (`"marketer"`) and language settings. They can auto-rewrite captured content for marketing demos.

10. **Continuous capture mode** — `isContinuousCaptureStarted` flag enables real-time page monitoring, not just one-shot capture.

### Weaknesses / Areas stept Could Exploit

1. **No XPath** — They rely solely on CSS selectors with nth-child fallback. XPath would be more robust for complex DOM structures. stept's XPath + selector + testid approach is more comprehensive.

2. **No `data-testid` / `aria-*` priority** — Their selector cascade (ID → href → class → tag → nth-child) doesn't prioritize stable test attributes. stept's `testid` + `aria-label` capture is better for SPAs with dynamic class names.

3. **No parent chain** — They capture a single selector per element. stept's `parentChain` provides context for disambiguation.

4. **No `elementRect` for relative positioning** — They use percentage-based coords, which can drift with responsive layouts. stept's `elementRect` is more precise.

5. **Heavy bundle sizes** — 1.8MB + 1.7MB content scripts = 3.5MB of JS injected into pages. This can impact page performance. stept's approach with rrweb-snapshot is much lighter.

6. **Monolithic capture** — Their HTML capture creates a full-page clone each time. No incremental/diff-based capture. For multi-step flows, this means redundant data.

7. **ZIP-centric architecture** — ZIP packaging adds complexity. stept's JSON node tree + streaming upload is simpler and more debuggable.

8. **No rrweb-style replay** — Their HTML capture produces a static snapshot. They can't replay interactions frame-by-frame like rrweb. stept could leverage rrweb's event recording for richer replays.

---

## Comparison with stept

| Feature | Storylane | stept |
|---------|-----------|-------|
| DOM serialization | Custom serializer → HTML string/JSON → ZIP | rrweb-snapshot → JSON node tree |
| CSS capture | Full stylesheet extraction + CSS parser | rrweb-snapshot inline |
| Screenshots | `captureVisibleTab` (JPEG) | `captureVisibleTab` |
| Element ID | CSS selector cascade (ID→href→class→tag→nth) | Selector + XPath + testid + parentChain |
| Asset handling | Fetch + inline + ZIP archive | — |
| Upload | S3 multipart (presigned URLs) | FastAPI streaming |
| Shadow DOM | Full support (chrome.dom API) | rrweb-snapshot support |
| Frame handling | Per-frame injection + tree assembly | — |
| Bundle size | ~3.5MB content scripts | Lighter |
| AI features | Content rewriting with tone/language | LLM-based (inline_ai) |
| Video | Video clip recording | — |
| Selector validation | Live DOM verification | — |
| Widget text | Auto-generated natural language | — |

---

## Key Takeaways for stept

1. **Consider CSS selector validation** — Storylane's approach of verifying selectors against live DOM is worth adopting. stept could validate `element_info.selector` before storing.

2. **Auto-generate step descriptions** — Storylane's natural language widget text ("Click on 'Submit'") is a great UX pattern. stept could generate these from `element_info`.

3. **Password/credential scrubbing** — Important for enterprise adoption. Obfuscate sensitive input values during capture.

4. **WebGL `preserveDrawingBuffer` override** — If stept captures canvas-heavy apps, this override is essential.

5. **`URL.revokeObjectURL` override** — Prevents blob resource loss during capture.

6. **stept's advantages to lean into**: XPath robustness, data-testid priority, parentChain context, lighter bundle size, rrweb replay capability, simpler architecture.
