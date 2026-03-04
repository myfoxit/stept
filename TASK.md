# Chrome Extension Major Upgrade Task

Read ALL existing source files first (background.js, content.js, sidepanel.js, popup.js, sidepanel.html, sidepanel.css, popup.html, popup.css, manifest.json).
Then read SCRIBE-VS-ONDOKI-COMPARISON.md and ONDOKI-CHROME-POLISH-SPEC.md for full context.

## Overview
Upgrade the Ondoki Chrome extension to match/exceed Scribe's recording quality and add search + context link features. Keep vanilla JS — NO React, NO build step.

## 1. Recording Quality Improvements (from Scribe comparison)

### 1a. Switch from `click` to `pointerdown` (content.js)
- Replace `addEventListener('click', ...)` with `addEventListener('pointerdown', ..., {capture: true})`
- Filter: only `event.button === 0` (left click) and `event.isPrimary` (ignore multi-touch)
- This fires BEFORE click handlers, so screenshots capture pre-click state more reliably

### 1b. Better element identification & descriptions (content.js)
Current: basic tagName, type, text, href, ariaLabel, id, classList, name, placeholder
Upgrade to Scribe's priority chain:
1. `aria-label` attribute
2. `<label for="elementId">` association (traverse DOM to find associated label)
3. `aria-labelledby` → resolve to referenced element's textContent
4. `placeholder` attribute
5. `title` attribute
6. `alt` attribute (for images)
7. `name` attribute
8. Parent element's text (first 100 chars, trimmed) — when target has no label
9. `data-testid`, `data-test`, `data-cy` (testing attributes, useful for description)

Generate better descriptions:
- SELECT elements: listen for `change` event after click, generate `Select the "Option Text" option.`
- Checkboxes: `Check/Uncheck the "Label" checkbox`
- Radio buttons: `Select the "Label" radio button`
- Links: `Click on the "Link Text" link`
- Buttons: `Click the "Button Text" button`
- Inputs: `Click on the "Label" input field`
- Generic: `Click on "visible text"` (first 60 chars)

### 1c. DOM-Level PII Redaction (new file: redaction.js)
Create a redaction module that runs BEFORE captureVisibleTab():

```
Flow:
content.js detects click → sends message to background.js
→ background.js tells content.js to APPLY REDACTION
→ content.js applies CSS-based redaction to sensitive elements
→ content.js sends "redaction-applied" to background.js
→ background.js calls captureVisibleTab()
→ background.js tells content.js to REMOVE REDACTION
→ content.js restores original state
```

Redaction targets (detect by attribute):
- `input[type="password"]` — replace value with bullets
- `input[type="email"]`, `input[autocomplete*="email"]` — blur
- `input[autocomplete*="name"]`, `input[autocomplete*="given"]`, `input[autocomplete*="family"]`
- `input[type="tel"]`, `input[autocomplete*="tel"]`
- `input[autocomplete*="cc-"]` (credit card fields)
- `input[autocomplete*="address"]`, `input[autocomplete*="postal"]`
- Text nodes containing `@` (email patterns)
- Text nodes matching common name patterns (use a reduced set of ~500 most common global names)

Implementation:
- Mark redacted elements with `data-ondoki-redacted="true"`
- Store original values in a WeakMap
- Apply redaction: set CSS `filter: blur(4px)` on text containers, replace input values with `•••••`
- Restore: remove blur, restore original values from WeakMap

Make redaction configurable via extension settings (stored in chrome.storage):
- `redaction.enabled` (default: true)
- `redaction.formFields` (default: true)
- `redaction.emails` (default: true)
- `redaction.names` (default: true)
- `redaction.numbers` (default: false — too aggressive by default)

### 1d. Input blur tracking (content.js)
- When recording, track `blur` events on input/textarea/select elements
- On blur: capture the field's label + value (redacted if PII redaction enabled)
- Generate description: `Type "value" in the "Label" field`
- Send as a TYPE step if the value actually changed since last focus

### 1e. IndexedDB for screenshots (new file: storage.js)
Move screenshots from chrome.storage.local to IndexedDB:
- DB name: `ondoki-recordings`
- Object store: `screenshots` (key: `stepId`)
- Store screenshot data URLs in IDB, store only metadata in chrome.storage
- Migrate existing data on extension load
- Add cleanup: delete IDB entries when recording is discarded/uploaded

### 1f. Critical bug fixes (from ISSUES.md)
- **Pause/Resume**: When paused, send PAUSE_RECORDING to content.js to remove event listeners. On resume, send RESUME_RECORDING to re-attach them.
- **Service worker restart**: On SW activation, re-inject content.js into tabs that were being recorded (check state.recording flag)
- **Dock UI sync**: When recording state changes (pause/resume/stop), send message to dock iframe to update its UI

## 2. Search Feature (new)

Add search functionality to the sidepanel, calling the existing backend API.

### Search UI (sidepanel.html / sidepanel.js)
Add a search bar in the sidepanel header area (visible when NOT recording):
- Input field with magnifying glass icon and placeholder "Search recordings..."
- Debounce input by 300ms
- Show results below the search bar as a list:
  - Each result: title, snippet (with <mark> highlights), date
  - Click result → opens the recording in the web app (new tab)
- Show "No results" state when query returns empty
- Show loading spinner during search

### Search API integration
```
GET {apiUrl}/search?q={query}&project_id={projectId}&limit=10
Headers: Authorization: Bearer {accessToken}

Response: {
  total_results: number,
  results: [{
    id: string,
    name: string,
    generated_title: string,
    snippet: string,  // HTML with <mark> tags
    created_at: string,
    step_count: number
  }]
}
```

The `apiUrl`, `accessToken`, and `projectId` are already available in the extension from auth/settings.

## 3. Context Links Feature (like desktop app)

Port the desktop app's context link matching to the Chrome extension. The Chrome extension has a HUGE advantage: it already knows the current URL.

### How it works:
- On every tab change or URL change (already tracked via webNavigation), query the context-links/match API
- Display matched resources in the sidepanel with a badge counter

### Context match badge (popup.js / background.js)
- On tab URL change → call `GET {apiUrl}/context-links/match?url={currentUrl}&project_id={projectId}`
- If matches found → set badge on extension icon: show count (e.g., "3")
- Badge color: blue (#2563eb)
- Store matches in background.js state

### Context panel in sidepanel (sidepanel.js / sidepanel.html)
When NOT recording, show a "Context" section in the sidepanel:
- If matches exist for current tab URL:
  - Show list of matched resources (workflows/documents)
  - Each item: icon (📋 workflow, 📄 document), name, match_type badge
  - Click → opens resource in web app
- If no matches: show subtle "No related content for this page" message
- Add a "Link this page" button → opens context link creation in web app with pre-filled URL

### API:
```
GET {apiUrl}/context-links/match?url={tabUrl}&project_id={projectId}
Headers: Authorization: Bearer {accessToken}

Response: {
  matches: [{
    id: string,
    match_type: string,
    match_value: string,
    resource_type: "workflow" | "document",
    resource_id: string,
    resource_name: string,
    resource_summary?: string,
    priority: number
  }]
}
```

## 4. Settings Redesign — Slide-in Panel

Replace the current accordion settings with a slide-in panel:

### Implementation:
- Add a settings panel div to sidepanel.html that slides in from the right (CSS transform)
- Settings icon (⚙️) in the header triggers the slide
- Panel overlays the main content with a semi-transparent backdrop
- Close via X button or clicking backdrop
- Smooth CSS transition (transform: translateX)

### Settings contents:
- **API URL**: text input (show/hide based on build config)
- **PII Redaction**: toggle for each category (form fields, emails, names, numbers)
- **Display Mode**: radio (sidepanel / dock overlay)
- **Auto-upload**: toggle
- **About**: version number, link to web app

### CSS approach:
```css
.settings-panel {
  position: fixed;
  top: 0;
  right: 0;
  width: 100%;
  height: 100%;
  background: white;
  transform: translateX(100%);
  transition: transform 0.3s ease;
  z-index: 1000;
}
.settings-panel.open {
  transform: translateX(0);
}
.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
  z-index: 999;
}
.settings-backdrop.open {
  opacity: 1;
  pointer-events: auto;
}
```

## 5. API URL Build Configuration

Add build-flag-like behavior without a build step:
- In `background.js`, add a config constant at the top:
```javascript
const BUILD_CONFIG = {
  mode: 'self-hosted',  // Change to 'cloud' for Chrome Web Store build
  cloudApiUrl: 'https://app.ondoki.io/api/v1',
  defaultApiUrl: 'http://localhost:8000/api/v1',
};
```
- If mode is 'cloud': hide API URL field in settings, use cloudApiUrl
- If mode is 'self-hosted': show API URL field, default to defaultApiUrl

## File Organization

Create these new files:
- `redaction.js` — PII redaction module (DOM-level)
- `storage.js` — IndexedDB wrapper for screenshots  
- `search.js` — Search API client
- `context.js` — Context link matching logic
- `names.json` — Reduced common names dictionary (~500 names)

Keep existing files, refactor as needed:
- `background.js` — main service worker, orchestrates everything
- `content.js` — DOM interaction, click capture, redaction application
- `sidepanel.js` — sidepanel UI (add search, context, settings slide-in)
- `popup.js` — popup UI (keep minimal)

## Important Notes
- Keep vanilla JS. No React, no TypeScript, no build step.
- All new modules should use ES module syntax (import/export) where supported, falling back to message passing between content scripts and service worker.
- Content scripts can't use ES modules — use IIFE pattern and message passing.
- Test with: load unpacked extension, click through a recording flow, verify screenshots, check search works.
- The backend API is already running at the configured apiUrl — just wire up the fetch calls with proper auth headers.

## Commit strategy
Make atomic commits as you go — one per logical feature. Don't do one giant commit.
