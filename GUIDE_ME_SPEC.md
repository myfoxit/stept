# Interactive "Guide Me" Feature — Implementation Spec

## Overview
Implement Tango-style "Guide Me" interactive walkthroughs. When a user clicks "Guide Me" (play button) on a workflow — either from the Chrome extension sidepanel or from the web app workflow view — the system navigates to the correct page and highlights each step's target DOM element in-place, with a tooltip showing instructions and next/back/skip controls.

## Current State (already implemented)

### Chrome Plugin (`ondoki-plugin-chrome`)
- **guide-runtime.js** — FULLY IMPLEMENTED overlay renderer with:
  - Shadow DOM overlay with backdrop cutout, highlight ring, tooltip
  - Multi-level element finder (CSS selector → testid → role+text → tag+text → xpath → parent chain)
  - Step navigation (next/back/skip/close)
  - Click-to-advance for click steps
  - Position tracking (follows element on scroll/resize)
  - "Element not found" fallback UI
  - URL mismatch warning
- **background.js** — Has `FETCH_WORKFLOW_GUIDE`, `START_GUIDE`, `STOP_GUIDE` message handlers
  - `FETCH_WORKFLOW_GUIDE` calls `GET /process-recording/workflow/{id}/interactive-guide` (endpoint doesn't exist yet!)
  - `START_GUIDE` injects guide-runtime.js and sends guide data
- **sidepanel.js** — Has `playGuideForWorkflow()` function and play buttons on recent workflow items
  - Shows play icon button when `w.has_guide` is true in workflow list response

### Web Backend (`ondoki-web/api`)
- **models.py** — `ProcessRecordingStep` has:
  - `element_info` (JSON) — rich element data: tagName, id, className, text, href, type, name, placeholder, ariaLabel, role, title, alt, associatedLabel, parentText, testId, elementRect, selector, xpath, parentChain, siblingText
  - `dom_snapshot_key` — rrweb-snapshot serialized DOM tree stored in object storage
  - `url` — page URL for the step
  - `description`, `generated_title`, `generated_description`
  - `action_type` — Left Click, Right Click, Double Click, Type, Key, Navigate, Select
- Existing endpoints:
  - `POST /session/{id}/dom-snapshot` — upload DOM snapshots
  - `GET /workflow/{id}/guide` — returns `guide_markdown` (text guide, NOT interactive)
  - `GET /workflows/filtered` — workflow list (needs `has_guide` field)

### Web Frontend (`ondoki-web/app`)
- **workflow-view.tsx** — Has `GuidePanel` for markdown guide display
- Needs a "Guide Me" button that triggers the Chrome extension or shows the web-based guide

## What Needs to Be Built

### 1. Backend: Interactive Guide Endpoint
**File:** `api/app/routers/process_recording.py`

Add `GET /process-recording/workflow/{session_id}/interactive-guide` endpoint that:
- Loads all steps for the workflow (ordered by step_number)
- Builds an interactive guide JSON response from step data
- Returns format compatible with `guide-runtime.js`:

```json
{
  "id": "workflow-id",
  "title": "Workflow Title",
  "steps": [
    {
      "title": "Click the 'Submit' button",
      "description": "Generated or original step description",
      "selector": "button[data-testid='submit-btn']",
      "xpath": "/html/body/div[1]/form/button[2]",
      "element_text": "Submit",
      "element_role": "button",
      "element_info": { ...full element_info from step... },
      "expected_url": "https://example.com/form",
      "action_type": "Left Click",
      "step_number": 1
    }
  ]
}
```

- Use `generated_title` or `generated_description` or `description` for step title
- Pass through `element_info.selector`, `element_info.xpath`, `element_info.testId`, `element_info.role`, `element_info.ariaLabel`, `element_info.text`, `element_info.parentChain`
- Filter out "Navigate" steps (they're for page transitions, not interactive highlighting) — or include them with a flag so the guide can auto-navigate
- Set `expected_url` from step's `url` field

### 2. Backend: Add `has_guide` to Workflow List Response
**File:** `api/app/crud/process_recording.py` or serialization logic

The `get_filtered_workflows` response needs a `has_guide` boolean field. A workflow "has guide" if it has steps with `element_info` that contain a selector or identifiable element data. Simplest approach: add a computed column or just set `has_guide = True` for any workflow with steps (since all Chrome-recorded workflows have element_info).

### 3. Web Frontend: "Guide Me" Button on Workflow View
**File:** `app/src/pages/workflow-view.tsx`

Add a "Guide Me" button (play icon) next to the existing guide/AI toolbar. When clicked:
- Option A (if Chrome extension detected): Send message to extension to start guide via `chrome.runtime.sendMessage(EXTENSION_ID, { type: 'START_GUIDE_FOR_WORKFLOW', workflowId })` using `externally_connectable`
- Option B (standalone): Open a new tab to the workflow's first step URL with a query param like `?ondoki-guide=WORKFLOW_ID`, and the Chrome extension picks it up
- Option C (simplest, recommended): Just fetch the interactive guide JSON from the API and pass it to the extension. Add `externally_connectable` to ondoki's manifest for the web app domain.

**Recommended approach:** Add a button that:
1. Fetches `/workflow/{id}/interactive-guide` 
2. Opens a new window/tab to the first step's URL
3. Uses `window.postMessage` or `chrome.runtime.sendMessage` to tell the extension to start the guide

### 4. Chrome Extension: Cross-origin Guide Launch
**File:** `ondoki-plugin-chrome/manifest.json` + `background.js`

- Add `externally_connectable` for the ondoki web app domain(s)
- Listen for `chrome.runtime.onMessageExternal` in background.js for `START_GUIDE` messages from the web app
- OR: listen for URL patterns like `?ondoki-guide={workflowId}` on tab load and auto-start

### 5. Chrome Extension: Auto-Navigation Between Steps
**File:** `ondoki-plugin-chrome/guide-runtime.js`

When a step's `expected_url` doesn't match the current page:
- Show a "Navigate to page" button in the tooltip
- When clicked, navigate to the expected URL
- After navigation completes, re-inject guide-runtime.js and resume from the current step
- This requires the background.js to track active guide state and re-inject on tab navigation

**File:** `ondoki-plugin-chrome/background.js`

Add guide state tracking:
- Store active guide data (guide JSON + current step index) in background state
- On `webNavigation.onCompleted`, check if there's an active guide and the URL matches the expected step URL
- If so, re-inject guide-runtime.js and send `START_GUIDE` with the guide data at the correct step index

## Tango's Approach (from analysis)

Tango's "Guide Me" flow:
1. User clicks "Guide Me" in sidepanel or on tango.us web app
2. Extension creates a "guidance session" with a session ID
3. Overlay is injected into the page as a content script (React-based, uses `findElement` to locate targets)
4. Element finding uses multiple strategies: CSS selector, computed role, element features/attributes, text matching
5. Each step shows: highlighted element + tooltip with title/description + next/back buttons
6. When step action is "click", clicking the highlighted element auto-advances (status becomes "NeedsIntermediateAction" or "Success")
7. Cross-page navigation: extension tracks guidance session, re-injects overlay on navigation
8. "Agent fix" mode: can attempt to auto-perform actions

## Implementation Priority

1. **Backend endpoint** (interactive-guide) — Required for everything else
2. **Backend has_guide** — Required for play buttons in Chrome extension list
3. **Background.js guide state persistence** — Required for cross-page navigation  
4. **Web frontend Guide Me button** — The web app trigger
5. **Auto-navigation** — Polish feature
