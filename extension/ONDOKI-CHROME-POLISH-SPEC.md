# Chrome Extension Recording Polish — Build Spec

> **Goal**: Polish the existing Chrome extension recording into a tight, competitive experience. The bones are already solid — this is about closing the gaps.

---

## What We Already Have (Solid)

- ✅ Pre-click screenshots with click markers
- ✅ Dual-mode UI (sidepanel + dock overlay) — nice UX
- ✅ Pause/resume, step deletion, cross-tab recording
- ✅ PKCE OAuth flow + project selector
- ✅ Start Capture button shows immediately after login
- ✅ Full-page screenshots with zoom on click (sidepanel)
- ✅ Step persistence across SW restarts
- ✅ Double-click detection, navigate-after-click suppression

## What Needs Polish

1. **Step merging**: Optional post-hoc merge (like Scribe — not real-time, user-triggered)
2. **Auto-zoom screenshots**: Default to element-focused crop in the viewer, save zoom state
3. **API URL config**: Auto-fill for Chrome Web Store installs, configurable for self-hosted
4. **Better descriptions**: More semantic element labels (associated labels, ARIA, roles)
5. **PII blur**: Auto-detect sensitive fields in screenshots
6. **Instant share link**: Share URL available immediately on upload start, not after full upload
7. **Critical bugs**: Pause/resume broken, SW restart issues, dock UI desyncs

---

## The Spec (7 Workstreams)

### 1. API URL Auto-Configuration (P0, 1 day)

**Problem**: Self-hosted users must manually set the API URL. Chrome Web Store users should never see this.

**Solution**: Two distribution builds with different defaults.

**Approach**:
- Build flag / env variable at build time: `ONDOKI_API_BASE_URL`
- Chrome Web Store build: hardcoded to `https://app.ondoki.io/api/v1`, settings panel hides API URL field
- Open source / self-hosted build: defaults to `http://localhost:8000/api/v1`, API URL field visible in settings
- Remove the `!` badge on first install (BUG-C001) — if it's the store build, URL is already set. If it's self-hosted, they know what they're doing.

**Implementation**:
```javascript
// config.js (generated at build time)
export const DEFAULT_API_BASE_URL = '__ONDOKI_API_BASE_URL__'; // replaced by build script
export const IS_CLOUD_BUILD = '__ONDOKI_IS_CLOUD__' === 'true';

// In sidepanel.html: conditionally hide API URL settings
if (IS_CLOUD_BUILD) {
  document.getElementById('apiUrlSection').style.display = 'none';
}
```

**Build script** (add to package.json or Makefile):
```bash
# Cloud build (Chrome Web Store)
sed 's/__ONDOKI_API_BASE_URL__/https:\/\/app.ondoki.io\/api\/v1/; s/__ONDOKI_IS_CLOUD__/true/' config.js > dist/config.js

# Self-hosted build
sed 's/__ONDOKI_API_BASE_URL__/http:\/\/localhost:8000\/api\/v1/; s/__ONDOKI_IS_CLOUD__/false/' config.js > dist/config.js
```

**Open source question**: Whether to open-source the extension is a separate decision. This approach works either way — if open source, self-hosters build from source with their URL. If closed, only the cloud build ships to the store.

**Files to change**:
- New `config.js` with build-time replacements
- `background.js`: Import from config.js instead of hardcoded `DEFAULT_API_BASE_URL`
- `sidepanel.html`: Wrap API URL field in conditional
- Add build script / Makefile target

### 2. Step Merging — Post-Hoc, User-Triggered (P0, 3-4 days)

**Problem**: Recording a form fill produces many steps (click field, type, click next field, type, ...). These should be mergeable into cleaner steps — but as an explicit user action, not automatic.

**Solution**: "Merge steps" option in the web app's workflow editor (post-upload), similar to how Scribe offers merge as an editing action.

**Two levels**:

1. **Suggest merges** (in web app workflow editor):
   - After upload + AI processing, highlight step groups that could merge
   - Show merge suggestions: "Steps 3-7 could become: Fill out the contact form"
   - User clicks to accept/reject each suggestion
   - This uses the existing `merge_steps` AI tool in the web app

2. **Quick merge in extension** (pre-upload, in sidepanel):
   - Multi-select steps (checkboxes or shift-click)
   - "Merge selected" button → combines into single step
   - Uses first step's screenshot, concatenates descriptions
   - User edits the merged description inline

**Extension-side implementation** (quick merge):

```javascript
// In sidepanel.js — add multi-select + merge UI

let selectedSteps = new Set();

function toggleStepSelection(stepNumber) {
  if (selectedSteps.has(stepNumber)) {
    selectedSteps.delete(stepNumber);
  } else {
    selectedSteps.add(stepNumber);
  }
  updateMergeUI();
}

function updateMergeUI() {
  const mergeBar = document.getElementById('mergeBar');
  if (selectedSteps.size >= 2) {
    mergeBar.classList.remove('hidden');
    mergeBar.querySelector('.merge-count').textContent = `${selectedSteps.size} steps selected`;
  } else {
    mergeBar.classList.add('hidden');
  }
}

async function mergeSelectedSteps() {
  const sorted = [...selectedSteps].sort((a, b) => a - b);
  const stepsToMerge = sorted.map(n => steps.find(s => s.stepNumber === n)).filter(Boolean);
  
  if (stepsToMerge.length < 2) return;
  
  // Keep first step's screenshot, merge descriptions
  const merged = {
    ...stepsToMerge[0],
    description: stepsToMerge.map(s => s.description).join(' → '),
    mergedFrom: sorted,
  };
  
  // Remove merged steps, insert combined
  await sendMessage({ type: 'MERGE_STEPS', stepNumbers: sorted, merged });
  selectedSteps.clear();
  await refreshState();
}
```

**Background.js addition**:
```javascript
case 'MERGE_STEPS': {
  const { stepNumbers, merged } = message;
  const minNum = Math.min(...stepNumbers);
  state.steps = state.steps.filter(s => !stepNumbers.includes(s.stepNumber));
  merged.stepNumber = minNum;
  state.steps.push(merged);
  state.steps.sort((a, b) => a.stepNumber - b.stepNumber);
  // Renumber
  state.steps.forEach((s, i) => s.stepNumber = i + 1);
  state.stepCounter = state.steps.length;
  persistSteps();
  sendResponse({ success: true });
  break;
}
```

**Sidepanel UI**: Floating merge bar at bottom when 2+ steps selected:
```
┌─────────────────────────────────────┐
│ 3 steps selected  [Merge] [Cancel] │
└─────────────────────────────────────┘
```

**Web app side**: Already has `merge_steps` AI tool — just needs a UI to trigger it from the workflow viewer. This is a web app change, not extension.

**Files to change**:
- `sidepanel.js`: Add step selection, merge UI, `MERGE_STEPS` message
- `sidepanel.html/css`: Add merge bar, step checkboxes
- `background.js`: Handle `MERGE_STEPS` message

### 3. Auto-Zoom Screenshots (P0, 2 days)

**Problem**: Screenshots capture the full page (correct — same as Scribe). The sidepanel already supports click-to-zoom. But the default view shows the full page which makes steps feel noisy. The improvement: auto-zoom to the clicked element by default, with option to toggle full view.

**Solution**: In both the extension sidepanel AND the web app workflow viewer, default the screenshot view to a cropped region around the click target. Keep the full screenshot stored — this is a display concern.

**Extension (sidepanel.js)** — auto-crop display:

```javascript
function createStepCard(step, isNew) {
  // ... existing code ...
  
  // If we have click position + viewport size, default to cropped view
  const hasClickData = step.screenshotRelativeMousePosition && step.screenshotSize;
  
  // Screenshot container with two modes: cropped (default) and full
  const screenshotHtml = step.screenshotDataUrl ? `
    <div class="step-screenshot-container ${hasClickData ? 'auto-cropped' : ''}" 
         data-crop-x="${step.screenshotRelativeMousePosition?.x || 0}"
         data-crop-y="${step.screenshotRelativeMousePosition?.y || 0}"
         data-vw="${step.screenshotSize?.width || 0}"
         data-vh="${step.screenshotSize?.height || 0}">
      <img class="step-screenshot" src="${step.screenshotDataUrl}" alt="Step ${step.stepNumber}">
      ${hasClickData ? `
        <div class="click-marker" style="left: ${(step.screenshotRelativeMousePosition.x / step.screenshotSize.width) * 100}%; top: ${(step.screenshotRelativeMousePosition.y / step.screenshotSize.height) * 100}%;">
          <div class="click-marker-pulse"></div>
          <div class="click-marker-ring"></div>
          <div class="click-marker-dot"></div>
        </div>
        <button class="zoom-toggle" title="Toggle zoom">🔍</button>
      ` : ''}
    </div>
  ` : '';
}
```

**CSS for auto-crop** (sidepanel.css):
```css
.step-screenshot-container.auto-cropped {
  overflow: hidden;
  max-height: 180px;
}

.step-screenshot-container.auto-cropped .step-screenshot {
  /* CSS transform to zoom into click area */
  transform-origin: var(--crop-x) var(--crop-y);
  transform: scale(2.5);
}

.step-screenshot-container.full-view .step-screenshot {
  transform: none;
}
```

**JavaScript** — set crop origin dynamically + toggle:
```javascript
// After creating the card, set the CSS custom properties
const container = card.querySelector('.step-screenshot-container');
if (hasClickData) {
  const xPct = (step.screenshotRelativeMousePosition.x / step.screenshotSize.width) * 100;
  const yPct = (step.screenshotRelativeMousePosition.y / step.screenshotSize.height) * 100;
  container.style.setProperty('--crop-x', `${xPct}%`);
  container.style.setProperty('--crop-y', `${yPct}%`);
}

// Toggle zoom
card.querySelector('.zoom-toggle')?.addEventListener('click', (e) => {
  e.stopPropagation();
  container.classList.toggle('auto-cropped');
  container.classList.toggle('full-view');
});
```

**Web app workflow viewer** — same principle:
- Default: CSS zoom to click marker area
- Click to toggle full view
- Save zoom preference per step (optional, future)

**No changes to screenshot capture** — we keep capturing full page. This is purely a display-side improvement.

**Element highlight overlay** — in addition to the existing click dot, draw a subtle highlight box around the clicked element:

We already have `elementRect` data (the bounding rect is available from `target.getBoundingClientRect()` in content.js — currently stored as `relativePosition` with x/y only). Need to also send `width` and `height`:

```javascript
// content.js — add to handleClick
const elementRect = {
  x: rect.left,
  y: rect.top,  
  width: rect.width,
  height: rect.height,
};
// Include in stepData
stepData.elementRect = elementRect;
```

Then in the viewer, draw a highlight box overlay (CSS) in addition to the click dot.

**Files to change**:
- `content.js`: Send `elementRect` (width/height) with click events
- `sidepanel.js`: Auto-crop display logic, zoom toggle
- `sidepanel.css`: Crop styles, zoom toggle button
- Web app workflow viewer: Same auto-crop display (separate PR)

### 4. Better Step Descriptions (P0, 2 days)

**Problem**: Descriptions are generic. `Click on button element` vs Scribe's `Click the "Submit" button`.

**Current state** (in `generateClickDescription`): Already handles buttons, links, inputs, selects, and text elements. But it's basic.

**Improvements**:

```javascript
function generateClickDescription(elementInfo, x, y, prefix) {
  const tag = elementInfo.tagName;
  
  // Buttons — find the best label
  if (tag === 'button' || elementInfo.type === 'submit' || elementInfo.role === 'button') {
    const label = elementInfo.ariaLabel || elementInfo.text || 'button';
    return `${prefix} the **${cleanLabel(label)}** button`;
  }
  
  // Links
  if (tag === 'a') {
    const label = elementInfo.text || elementInfo.ariaLabel || 'link';
    return `${prefix} the **${cleanLabel(label)}** link`;
  }
  
  // Inputs
  if (tag === 'input' || tag === 'textarea') {
    const label = elementInfo.ariaLabel || elementInfo.placeholder || 
                  elementInfo.associatedLabel || elementInfo.name || 'field';
    return `${prefix} the **${cleanLabel(label)}** field`;
  }
  
  // Select/dropdown
  if (tag === 'select') {
    const label = elementInfo.ariaLabel || elementInfo.name || 'dropdown';
    return `${prefix} the **${cleanLabel(label)}** dropdown`;
  }
  
  // Checkboxes/radios
  if (elementInfo.type === 'checkbox') {
    const label = elementInfo.associatedLabel || elementInfo.ariaLabel || '';
    return label ? `${prefix} the **${cleanLabel(label)}** checkbox` : `${prefix} checkbox`;
  }
  if (elementInfo.type === 'radio') {
    const label = elementInfo.associatedLabel || elementInfo.ariaLabel || '';
    return label ? `Select **${cleanLabel(label)}**` : `${prefix} radio option`;
  }
  
  // Tabs / nav items
  if (elementInfo.role === 'tab' || elementInfo.role === 'menuitem') {
    const label = elementInfo.text || elementInfo.ariaLabel || '';
    return label ? `${prefix} the **${cleanLabel(label)}** tab` : `${prefix} tab`;
  }
  
  // Elements with meaningful text (short)
  if (elementInfo.text && elementInfo.text.length > 0 && elementInfo.text.length <= 50) {
    return `${prefix} **${cleanLabel(elementInfo.text)}**`;
  }
  
  // Fallback: use tag name
  return `${prefix} on the page`;
}

function cleanLabel(text) {
  return text.trim().replace(/\s+/g, ' ').substring(0, 50);
}
```

**Also capture** (in content.js `handleClick`):
```javascript
elementInfo.role = target.getAttribute('role') || null;
elementInfo.associatedLabel = getAssociatedLabel(target);

function getAssociatedLabel(el) {
  // 1. Check for <label for="...">
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label) return label.textContent.trim();
  }
  // 2. Check parent <label>
  const parentLabel = el.closest('label');
  if (parentLabel) return parentLabel.textContent.trim();
  // 3. Check aria-labelledby
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl) return labelEl.textContent.trim();
  }
  return null;
}
```

**Files to change**:
- `content.js`: Add `role`, `associatedLabel` to `elementInfo`, add `getAssociatedLabel()`
- `content.js`: Improve `generateClickDescription()`

### 5. Auto-PII Blur (P1, 3-4 days)

**Problem**: Screenshots capture emails, names, and other PII. Scribe auto-blurs these.

**Solution**: Client-side blur on screenshots before storing/uploading.

**Approach** (lightweight, no ML):

```javascript
async function blurPII(screenshotDataUrl, viewportSize, imageSize) {
  // 1. Find PII elements in the current DOM
  const piiRects = findPIIElements();
  
  if (piiRects.length === 0) return screenshotDataUrl;
  
  // 2. Draw blur boxes on screenshot
  const bitmap = await createImageBitmap(await (await fetch(screenshotDataUrl)).blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0);
  
  const scaleX = bitmap.width / viewportSize.width;
  const scaleY = bitmap.height / viewportSize.height;
  
  for (const rect of piiRects) {
    const x = rect.x * scaleX;
    const y = rect.y * scaleY;
    const w = rect.width * scaleX;
    const h = rect.height * scaleY;
    
    // Pixelate region (cheaper than blur)
    const pixelSize = 8;
    const imgData = ctx.getImageData(x, y, w, h);
    for (let py = 0; py < h; py += pixelSize) {
      for (let px = 0; px < w; px += pixelSize) {
        const i = (py * w + px) * 4;
        const r = imgData.data[i], g = imgData.data[i+1], b = imgData.data[i+2];
        for (let dy = 0; dy < pixelSize && py+dy < h; dy++) {
          for (let dx = 0; dx < pixelSize && px+dx < w; dx++) {
            const j = ((py+dy) * w + (px+dx)) * 4;
            imgData.data[j] = r;
            imgData.data[j+1] = g;
            imgData.data[j+2] = b;
          }
        }
      }
    }
    ctx.putImageData(imgData, x, y);
  }
  
  const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  return new Promise(r => { const fr = new FileReader(); fr.onloadend = () => r(fr.result); fr.readAsDataURL(blob); });
}

function findPIIElements() {
  const rects = [];
  
  // Email-like text in inputs
  document.querySelectorAll('input[type="email"], input[autocomplete*="email"]').forEach(el => {
    if (el.value) rects.push(el.getBoundingClientRect());
  });
  
  // Password fields (should never show, but belt+suspenders)
  document.querySelectorAll('input[type="password"]').forEach(el => {
    rects.push(el.getBoundingClientRect());
  });
  
  // Name fields
  document.querySelectorAll('input[autocomplete*="name"], input[name*="name"]').forEach(el => {
    if (el.value) rects.push(el.getBoundingClientRect());
  });
  
  // Phone fields
  document.querySelectorAll('input[type="tel"], input[autocomplete*="tel"]').forEach(el => {
    if (el.value) rects.push(el.getBoundingClientRect());
  });
  
  // Credit card
  document.querySelectorAll('input[autocomplete*="cc-"]').forEach(el => {
    rects.push(el.getBoundingClientRect());
  });
  
  // SSN, tax, etc. by pattern matching visible text
  // (skip for v1 — above covers 90%)
  
  return rects.filter(r => r.width > 0 && r.height > 0);
}
```

**Important**: PII detection runs in content script (has DOM access), sends rects to background for blur on the captured image.

**Flow**:
1. Content.js: `handleClick()` → gather PII rects → send with click event
2. Background.js: `addStep()` → capture screenshot → blur PII regions → store blurred version

**Files to change**:
- `content.js`: Add `findPIIElements()`, include `piiRects` in CLICK_EVENT data
- `background.js`: Add `blurPII()`, call after screenshot capture in `addStep()`

### 6. Instant Share Link (P1, 2-3 days)

**Problem**: After recording, user must: stop → upload → wait → go to web app → find workflow → copy link. Scribe: stop recording → share link appears instantly.

**Solution**:

```
User clicks "Done" in sidepanel
  → Extension shows: "Share" panel with spinning upload indicator
  → Background: starts uploading immediately
  → Backend: returns session ID + share token immediately (before processing)
  → Extension shows: shareable link + "Copy Link" button (available within 1-2s)
  → Upload continues in background (screenshots)
  → Link works immediately (shows "Processing..." state, then renders steps as they arrive)
```

**Backend changes needed** (ondoki-web API):
- `POST /api/v1/process-recording/session/create` already returns `session_id`
- Add `share_token` to response (generate on create)
- Add `GET /api/v1/share/w/{token}` — public workflow view
- Steps stream in as they upload — viewer shows progressive loading

**Extension changes**:
```javascript
// After upload starts, immediately show share link
async function performUpload() {
  // Step 1: Create session (instant)
  const session = await createSession();
  const shareUrl = `${baseUrl}/share/w/${session.share_token}`;
  
  // Show share link immediately
  showShareLink(shareUrl);
  
  // Step 2: Upload metadata + screenshots in background
  await uploadMetadata(session.id);
  await uploadScreenshots(session.id);
  await finalizeSession(session.id);
  
  // Update UI: "Uploading..." → "Ready!"
  updateShareStatus('ready');
}
```

**Sidepanel UI after recording**:
```
┌─────────────────────────────────┐
│ ✅ 8 steps captured             │
│                                  │
│ ┌──────────────────────────────┐│
│ │ 🔗 ondoki.io/s/abc123       ││
│ │ [📋 Copy Link]  [📤 Share]  ││
│ └──────────────────────────────┘│
│                                  │
│ Uploading screenshots... 5/8    │
│ ████████████░░░░░░░░            │
│                                  │
│ [🔄 New Recording]              │
└─────────────────────────────────┘
```

**Files to change**:
- `background.js`: Restructure `uploadCapture()` to return share URL before full upload
- `sidepanel.js/html`: New share panel with copy link
- Backend (ondoki-web): Add `share_token` to session create, add public share route

### 7. Critical Bug Fixes (P0, 2-3 days)

From existing ISSUES.md, these must be fixed for recording to feel solid:

| # | Bug | Fix | Priority |
|---|-----|-----|----------|
| 6 | Pause doesn't stop content scripts | Broadcast `PAUSE_RECORDING` to all tabs, set `isRecording=false` in content.js | P0 |
| 7 | `RESUME_RECORDING` not handled in content.js | Add handler: set `isRecording=true`, reattach listeners | P0 |
| 14 | Dock "Complete" clears steps on upload failure | Only clear on success | P0 |
| 15 | Double-click screenshot timing | Capture on mousedown, resolve on click | P0 |
| 19 | SW restart doesn't re-inject tabs | On SW wake, query recording tabs, re-inject content.js | P0 |
| 20 | Dock UI doesn't update on pause/resume | Send pause/resume state to dock, update indicator | P0 |
| 5 | SW termination loses PKCE state | Store `codeVerifier`+`authState` in chrome.storage | P1 |
| 2 | `<all_urls>` too broad | Use `activeTab` + request on recording start | P1 |

---

## Build Order

| Week | Work | Why |
|------|------|-----|
| **1** | API URL auto-config (#1) + Critical bug fixes (#7) + Better descriptions (#4) | Solid foundation, no more broken pause/resume |
| **2** | Step merging UI (#2) + Auto-zoom screenshots (#3) | Recording output looks clean |
| **3** | Auto-PII blur (#5) + Instant share link (#6) | Privacy + frictionless sharing |

**Total: 3 weeks to polished recording UX.**

After this, the extension is ready to put in front of people. Ship it to Chrome Web Store, write the "Open Source Scribe Alternative" landing page, and start getting users.

---

## What We're NOT Building (Yet)

- ❌ Video recording (Guidde territory — different product)
- ❌ AI-powered step rewriting (do manual editing UX first)
- ❌ Annotation tools (drawing on screenshots)
- ❌ Multi-language step descriptions
- ❌ Step templates / macros
- ❌ Desktop app recording (Electron — separate track)

These are all valid features but none of them matter if the basic record → share flow isn't butter smooth.

---

## Success Criteria

Recording is "done" when:

1. **Chrome Web Store build**: Auto-configured, no API URL needed
2. **Self-hosted build**: API URL configurable in settings (already works)
3. **Step merging**: Users can select and merge steps in sidepanel before upload
4. **Screenshot view**: Auto-zoomed to click area by default, toggle for full view
5. **Descriptions**: Include associated labels, ARIA roles, semantic element names
6. **PII**: Sensitive fields auto-blurred in screenshots
7. **Share**: Link available < 3 seconds after recording stops
8. **Reliability**: No lost steps, no broken pause/resume, survives SW restart
