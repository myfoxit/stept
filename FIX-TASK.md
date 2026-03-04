# Smart Blur — Live PII Redaction UX

Read ALL current files first: content.js, background.js, sidepanel.js, sidepanel.html, sidepanel.css, redaction.js

## What we need

When user clicks the shield button during recording:

### 1. Pause capture automatically
- Send PAUSE message to background.js to stop capturing steps
- Sidepanel shows "Capture paused — Smart Blur active"

### 2. Inject a floating popup ON THE PAGE (not sidepanel)
- Inject via content.js into the page DOM (use shadow DOM to avoid CSS conflicts)
- Position: floating panel, bottom-right area, ~250px wide
- Title: "Smart Blur" with an ON/OFF master toggle
- Toggle switches (iOS-style, like our settings) for each category:
  - Email Addresses (default: on)
  - Numbers (default: off)
  - Common Names (default: on)
  - Form Fields (default: on)
  - Long Text (default: off — blur text nodes >100 chars)
  - Images (default: off — blur all <img> elements)
- Footer text: "Elements you hover over will still be visible"
- Close/done button to dismiss and resume capture

### 3. Apply redaction LIVE on the page
- When a toggle is turned ON → immediately apply blur/replacement to matching elements
- When a toggle is turned OFF → immediately remove that category's redaction
- User sees the page change in real-time as they toggle
- Use CSS filter: blur(4px) for text, blur(8px) for images
- Mark redacted elements with data-ondoki-redacted="category-name"

### 4. Keep redaction persistent during recording
- After user closes the Smart Blur popup and resumes capture, redaction STAYS on the page
- Screenshots capture the blurred state (no apply/remove cycle needed anymore)
- Redaction persists until recording ends or user opens Smart Blur again to change settings

### 5. "Choose others" custom selector (stretch)
- Skip this for now, but structure code to support it later

### 6. Update redaction.js
- Refactor to support live toggle per category
- Add: Long Text detection (text nodes >100 chars), Image blur (all <img>)
- Each category must be independently toggleable in real-time
- Remove the old apply/remove cycle from captureScreenshot — redaction is now persistent

### 7. Update the shield button behavior
- In sidepanel.js: clicking shield sends message to content.js to show/hide the Smart Blur popup
- Shield icon turns blue/active when Smart Blur popup is open
- In sidepanel recording footer, change shield icon to show "Smart Blur" text next to it

### 8. Clean up
- Remove the Privacy Redaction toggles from the Settings panel (they're now in Smart Blur)
- Keep the settings-stored defaults (chrome.storage.local) so Smart Blur opens with user's last preferences
- Remove the old APPLY_REDACTION/REMOVE_REDACTION message flow from background.js screenshot capture

## Style
- Popup background: white, rounded corners (12px), subtle shadow
- Toggle switches: same iOS-style as settings panel
- Font: system font stack, 13px body, 11px labels
- Colors: #3AB08A for active toggles, #D6D3D1 for inactive
- Draggable if possible (nice to have)

## Rules
- Vanilla JS only, IIFE pattern for content scripts, no build step
- Shadow DOM for the floating popup to avoid page CSS conflicts
- Atomic commits
- Don't break existing recording flow
- When done: `openclaw system event --text 'Done: Smart Blur live redaction complete' --mode now`
