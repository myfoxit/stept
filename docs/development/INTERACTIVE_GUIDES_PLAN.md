# Ondoki Interactive Guided Walkthroughs — Feature Plan

## Vision

**Open-source, self-hosted WalkMe.** Record a workflow once, then embed it as an interactive overlay that guides users through the real UI step by step — highlighting the exact element they need to click, showing instructions in context, and adapting when the UI changes.

Not automation. Not static docs. A living guide that walks humans through real interfaces.

---

## Why This Wins

| | Scribe | WalkMe | UiPath | **Ondoki** |
|---|---|---|---|---|
| Static docs | ✅ | ❌ | ❌ | ✅ |
| Interactive guides | ❌ | ✅ | ❌ | **✅** |
| Automation/RPA | ❌ | ❌ | ✅ | ❌ |
| Self-hosted | ❌ | ❌ | Partial | **✅** |
| Open source | ❌ | ❌ | ❌ | **✅** |
| Pricing | $23/seat/mo | $$$$ (enterprise only) | $$$$ | **Free / paid tiers** |

**WalkMe costs $10K-50K+/year.** There is no self-hosted alternative. Pendo, Whatfix, Userpilot — all cloud-only SaaS. The open-source gap is massive.

---

## How It Works (User Perspective)

### Recording (already exists)
1. User records a workflow as usual (desktop app or Chrome extension)
2. Behind the scenes, Ondoki now captures richer element data (Phase 1)

### Creating a Guide
1. User opens a recorded workflow in the web app
2. Clicks "Create Interactive Guide"
3. Reviews/edits each step — adjusts descriptions, adds tips
4. Publishes the guide → gets an embed snippet

### Embedding
```html
<!-- Drop into any internal web app -->
<script src="https://your-ondoki.com/guide.js" data-guide="abc123"></script>
```

Or trigger via:
- Chrome extension popup ("Start guide: Onboarding new order")
- URL parameter (`?ondoki-guide=abc123`)
- JavaScript API (`Ondoki.startGuide('abc123')`)

### User Experience
1. User opens the target app
2. Activates the guide (extension icon, hotkey, or auto-trigger)
3. A spotlight/tooltip highlights the first element: "Click the **New Order** button"
4. User clicks it → guide advances to step 2
5. "Type the customer name in the **Search** field" → highlights the search box
6. Continues step by step until complete
7. If an element can't be found → shows the screenshot with annotation as fallback

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Ondoki Guide Runtime                       │
│            (Chrome Extension or JS SDK)                       │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Guide steps loaded from API                                 │
│                                                              │
│  For each step:                                              │
│    ┌─────────────────────────────────────────┐               │
│    │  Element Finder (cascade)               │               │
│    │                                         │               │
│    │  1. DOM selector (id, data-testid)      │  Free, <5ms   │
│    │  2. Aria/role + text match              │  Free, <10ms  │
│    │  3. XPath from recorded path            │  Free, <10ms  │
│    │  4. Visual/text search (fuzzy)          │  Free, <50ms  │
│    │  5. LLM vision (screenshot → coords)   │  ~$0.003      │
│    │  6. Fallback: show screenshot overlay   │  Free          │
│    └─────────────────────────────────────────┘               │
│                                                              │
│  Overlay renderer:                                           │
│    - Spotlight (dim everything except target)                 │
│    - Tooltip with step instructions                          │
│    - Progress indicator                                      │
│    - "Skip" / "Back" / "End guide" controls                  │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Rich Element Capture During Recording

**Goal**: Capture enough to reliably find elements later. Ships independently, immediately improves documentation quality.

### 1a. Chrome Extension — Capture DOM context

When the extension records a click, also capture:

```json
{
  "selector": "#submit-btn",
  "xpath": "/html/body/div[2]/form/button[1]",
  "aria": { "role": "button", "label": "Submit Order" },
  "testId": "submit-order-btn",
  "text": "Submit Order",
  "tag": "button",
  "classes": ["btn", "btn-primary"],
  "rect": { "x": 450, "y": 320, "width": 120, "height": 36 },
  "parent_chain": [
    { "tag": "form", "id": "order-form", "classes": ["order-form"] },
    { "tag": "div", "id": "main-content" },
    { "tag": "body" }
  ],
  "nearby_text": ["Cancel", "Save Draft", "Total: $142.50"],
  "page_url": "https://app.example.com/orders/new",
  "page_title": "New Order — ExampleApp"
}
```

**This is the most important data for web-based guides.** DOM selectors are far more reliable than pixel positions.

### 1b. Desktop App — Capture richer AX data

Extend the native addon to capture on each interaction:

```json
{
  "role": "AXButton",
  "title": "Submit",
  "identifier": "submitButton",
  "frame": { "x": 450, "y": 320, "width": 120, "height": 36 },
  "parent_chain": [
    { "role": "AXGroup", "title": "Form Actions", "identifier": "formActions" },
    { "role": "AXWindow", "title": "New Order" }
  ],
  "siblings": [
    { "role": "AXButton", "title": "Cancel" },
    { "role": "AXButton", "title": "Save Draft" }
  ],
  "element_path": "AXApplication/AXWindow/AXWebArea/AXGroup/AXButton[Submit]"
}
```

### 1c. Storage

Already have `element_info = Column(JSON)` — no migration needed. Just richer data.

**Effort: 3-5 days**

---

## Phase 2: OCR During Recording

**Goal**: Extract text + positions from screenshots for visual matching fallback.

### Approach
- **Chrome extension**: Not needed — we capture DOM text directly
- **Desktop app**: Use Apple Vision framework (macOS, free, fast) for text extraction from screenshots
- Run during recording, store results in `element_info`

```json
{
  "ocr_texts": [
    { "text": "Submit Order", "bounds": { "x": 450, "y": 315, "w": 130, "h": 22 }, "confidence": 0.98 },
    { "text": "Cancel", "bounds": { "x": 300, "y": 315, "w": 60, "h": 22 }, "confidence": 0.97 }
  ]
}
```

**Effort: 3-4 days**

---

## Phase 3: Guide SDK & Chrome Extension Overlay

**Goal**: A lightweight JavaScript runtime that renders step-by-step overlays in any web app.

### 3a. Guide JS SDK (~5KB gzipped)

```javascript
// Embed in any web app
Ondoki.init({ server: 'https://your-ondoki.com', apiKey: 'pk_...' });
Ondoki.startGuide('guide-id');
```

Features:
- Fetch guide steps from Ondoki API
- For each step, run element finder cascade
- Render overlay: spotlight + tooltip + progress
- Listen for user interaction (click/type on highlighted element)
- Advance to next step on correct action
- Report completion/abandonment analytics

### 3b. Element Finder (the core intelligence)

```typescript
interface ElementMatch {
  element: HTMLElement;
  confidence: number;    // 0-1
  method: string;        // which level found it
}

async function findElement(stepData: StepElementInfo): Promise<ElementMatch | null> {
  // Level 1: Direct selectors (highest confidence)
  if (stepData.selector) {
    const el = document.querySelector(stepData.selector);
    if (el && isVisible(el)) return { element: el, confidence: 1.0, method: 'selector' };
  }
  if (stepData.testId) {
    const el = document.querySelector(`[data-testid="${stepData.testId}"]`);
    if (el && isVisible(el)) return { element: el, confidence: 0.99, method: 'testid' };
  }

  // Level 2: Aria role + text content
  if (stepData.aria?.role && stepData.text) {
    const candidates = document.querySelectorAll(`[role="${stepData.aria.role}"]`);
    const match = [...candidates].find(el => el.textContent?.trim() === stepData.text);
    if (match && isVisible(match)) return { element: match, confidence: 0.9, method: 'aria' };
  }

  // Level 3: Tag + text content (fuzzy)
  if (stepData.tag && stepData.text) {
    const candidates = document.querySelectorAll(stepData.tag);
    const match = [...candidates].find(el => 
      el.textContent?.trim().toLowerCase().includes(stepData.text.toLowerCase())
    );
    if (match && isVisible(match)) return { element: match, confidence: 0.7, method: 'text' };
  }

  // Level 4: XPath fallback
  if (stepData.xpath) {
    const result = document.evaluate(stepData.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE);
    const el = result.singleNodeValue as HTMLElement;
    if (el && isVisible(el)) return { element: el, confidence: 0.6, method: 'xpath' };
  }

  // Level 5: Nearby text context (look for surrounding text, then find actionable element nearby)
  // ...

  // Level 6: LLM fallback (optional, costs money)
  // Screenshot page → send to vision model → get coordinates
  // ...

  return null; // Show screenshot overlay as final fallback
}
```

### 3c. Overlay Renderer

```
┌─────────────────────────────────────────────┐
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ░░░░░░░░░░░░░┌──────────────┐░░░░░░░░░░░░░ │
│ ░░░░░░░░░░░░░│ Submit Order │░░░░░░░░░░░░░ │  ← Spotlight cutout
│ ░░░░░░░░░░░░░└──────────────┘░░░░░░░░░░░░░ │
│ ░░░░░░░░░░░░░  ┌──────────────────────┐░░░ │
│ ░░░░░░░░░░░░░  │ Click "Submit Order" │░░░ │  ← Tooltip
│ ░░░░░░░░░░░░░  │ to confirm.          │░░░ │
│ ░░░░░░░░░░░░░  │        Step 3 of 7 → │░░░ │
│ ░░░░░░░░░░░░░  └──────────────────────┘░░░ │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└─────────────────────────────────────────────┘
```

Components:
- **Backdrop**: Semi-transparent overlay with cutout around target element
- **Pulse ring**: Subtle animation on the target to draw attention
- **Tooltip**: Step description + progress + nav buttons
- **Hotkey**: Escape to exit, arrow keys for navigation

### 3d. Chrome Extension Integration

For users who have the Ondoki Chrome extension:
- "Available guides for this page" popup
- Auto-suggest guides based on current URL
- Works on any web app without needing the JS SDK embedded

**Effort: 2-3 weeks**

---

## Phase 4: Desktop App Guided Walkthroughs

**Goal**: Same overlay experience but for native desktop apps (not just web).

### Approach
- Use macOS overlay window (NSPanel, level = .floating)
- Transparent background with spotlight cutout
- Find elements using AX API with recorded element data
- Same cascade: identifier → role+title → path → OCR → LLM → screenshot

### This is harder than web because:
- No DOM, no CSS selectors
- AX identifiers are less stable than DOM ids
- Different apps expose AX differently
- Need to handle multi-window, multi-display

**Effort: 3-4 weeks**
**Recommendation**: Ship web guides first (Phase 3), desktop later.

---

## Phase 5: Guide Analytics & Management

### Analytics
- Guide completion rate (how many finish all steps?)
- Drop-off points (which step do people get stuck on?)
- Time per step
- Element match success rate (are guides breaking?)

### Management (Web App)
- Guide builder: edit steps, reorder, add tips/branches
- Guide versioning: detect when elements change, alert guide author
- Guide assignment: assign guides to user roles/teams
- Guide triggers: auto-start on page visit, button click, or API call

### API
```
GET  /api/v1/guides                         # List guides
GET  /api/v1/guides/:id                     # Get guide + steps
POST /api/v1/guides/:id/start               # Log guide start
POST /api/v1/guides/:id/steps/:n/complete   # Log step completion
POST /api/v1/guides/:id/complete            # Log guide completion
POST /api/v1/guides/:id/abandon             # Log abandonment
```

**Effort: 2 weeks**

---

## Phase 6: Smart Adaptation (LLM-Powered)

**Goal**: When the UI changes and element matching fails, use LLM to adapt.

### Scenarios
1. **Button text changed** ("Submit" → "Place Order") — fuzzy text match handles this
2. **Element moved** — visual/position search handles this
3. **Page redesigned** — LLM vision: "find the submit button in this screenshot"
4. **New intermediate step** — LLM: "there's a new Terms checkbox. Guide author notified."

### Cost Control
- Only invoke LLM when Level 1-4 matching fails
- Cache LLM decisions per page+element combo
- Per-guide LLM budget (default: $0.10)
- Admin toggle: disable LLM entirely

### Auto-healing
When LLM finds an element the static matchers missed:
- Store the new selector/path
- Suggest guide update to author
- Next time: static match succeeds, no LLM needed

**Effort: 1-2 weeks**

---

## Monetization Angle

### Free (self-hosted)
- Unlimited guides
- Unlimited users
- Static docs + basic interactive guides
- Community support

### Pro ($X/seat/month)
- Guide analytics
- Auto-healing (LLM adaptation)
- Priority element matching
- Branding customization
- Email/Slack support

### Enterprise
- SSO/SAML (already building)
- Audit logs (already have)
- Custom deployment support
- SLA

**This is the WalkMe playbook but at 1/10th the price, self-hostable.**

---

## Implementation Priority

```
Weeks 1-2:   Phase 1 — Rich element capture (Chrome ext + Desktop)
             Ships standalone. Improves docs immediately.

Weeks 2-3:   Phase 2 — OCR layer (Desktop only, Apple Vision)
             Ships standalone. Better search + descriptions.

Weeks 3-6:   Phase 3 — Guide SDK + Chrome extension overlay
             THE main deliverable. Interactive web guides work.

Weeks 6-7:   Phase 5 — Analytics + management UI
             Makes guides production-ready.

Weeks 7-8:   Phase 6 — LLM adaptation
             Handles UI changes gracefully.

Weeks 9-12:  Phase 4 — Desktop overlay guides
             Extends to native apps. Nice-to-have, not urgent.
```

**MVP in 6 weeks**: Record in Chrome extension → create guide → embed JS snippet → users get interactive walkthrough on any web app.

---

## Competitive Positioning

**"Record once. Guide forever."**

| Competitor | What they do | Price | Self-hosted |
|-----------|-------------|-------|-------------|
| WalkMe | In-app guides, enterprise | $10K-50K+/yr | ❌ |
| Pendo | Product analytics + guides | $$$$ | ❌ |
| Whatfix | Digital adoption platform | $$$$ | ❌ |
| Userpilot | Onboarding flows | $249+/mo | ❌ |
| Scribe | Static documentation | $23/seat/mo | ❌ |
| **Ondoki** | **Docs + interactive guides** | **Free / paid tiers** | **✅** |

The only open-source, self-hosted tool that does both documentation AND interactive guided walkthroughs.

---

## Open Questions

1. **Chrome extension only, or also a JS SDK for embedding without extension?** → Recommend both. SDK for your own apps, extension for third-party apps you can't modify.
2. **Guide branching?** ("If you see error X, do this instead") → Nice for v2, not MVP.
3. **Multi-language guides?** → Already have translation infrastructure. Guides auto-translate.
4. **Offline guides?** → Bundle guide data in extension for air-gapped environments.
5. **Guide marketplace?** → Users share guides for common SaaS tools (Salesforce, Jira, etc.). Community flywheel. Future opportunity.
