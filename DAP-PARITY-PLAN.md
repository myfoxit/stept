# Stept → DAP Parity Plan: Reaching WalkMe/Whatfix Level

## What They Actually Have (stripped of marketing)

### WalkMe DeepUI / UI Intelligence
- **Patented AI/ML that "understands" UIs** — 6 patents (2021). Uses computer vision + DOM analysis to recognize UI elements independent of selectors. Like face recognition but for UI components.
- **Auto-adapt to UI changes** — When Salesforce pushes a release, walkthroughs don't break. The system identifies elements by visual appearance + semantic meaning, not just CSS selectors.
- **Process analytics from UI** — Detects form errors, abandonment, time-to-complete without any instrumentation. Reads the UI directly.
- **Front-end automation** — Conversational chat triggers automations: "submit my PTO request" → bot fills forms across systems.
- **Context-aware AI assistant** — Knows what screen you're on, what you're doing, suggests next actions, validates input in real-time.
- **Memory** — Learns from user preferences and actions over time.

### Whatfix ScreenSense
- **Patented context + intent engine** — Perceives UIs "like a human." Understands not just WHAT element, but WHY the user is interacting with it.
- **LLM-powered element detection** — Uses LLMs to generate robust CSS selectors. Handles "weak" elements that traditional selectors miss.
- **Auto-adapt** — Adjusts to position changes, language changes, color changes dynamically.
- **Cross-application journeys** — Maintains context across different apps (start in Salesforce, continue in SAP).
- **AI Agents suite:**
  - Authoring Agent: plain-text → in-app guidance
  - Guidance Agent: real-time contextual help
  - Insights Agent: natural-language analytics queries
  - AI Roleplay: training simulations

---

## What You Have Today vs What You Need

### LAYER 1: Recording & Authoring

| Capability | WalkMe | Whatfix | stept today | Gap |
|---|---|---|---|---|
| Browser recording | ✅ | ✅ | ✅ Extension + Desktop | None |
| Desktop recording | ✅ | ✅ | ✅ Electron + native hooks | None |
| AI auto-annotation | ✅ | ✅ (Authoring Agent) | ✅ auto_processor.py | None |
| Text → guidance (AI) | ✅ | ✅ | ❌ | **BUILD** |
| Video → guide | ❌ | ❌ | ✅ video_processor.py | Ahead! |
| Rich editor | ✅ | ✅ | ✅ TipTap | None |
| Version history | ✅ | ✅ | ✅ | None |

**Gap: Text-to-guidance authoring.** User types "show me how to create a new contact in Salesforce" → AI generates a walkthrough. Whatfix calls this their "Authoring Agent." You'd need: LLM takes a text description + target app URL → generates step-by-step guide with element selectors. Medium difficulty — you have the LLM service and the element finder already.

### LAYER 2: Element Detection & Self-Healing

| Capability | WalkMe | Whatfix | stept today | Gap |
|---|---|---|---|---|
| CSS selector | ✅ | ✅ | ✅ | None |
| data-testid | ? | ✅ | ✅ | None |
| ARIA role + text | ✅ | ✅ | ✅ | None |
| XPath | ✅ | ✅ | ✅ | None |
| Visual/CV detection | ✅ (DeepUI) | ✅ (ScreenSense) | ❌ | **BUILD** |
| LLM-powered detection | ✅ | ✅ | ❌ | **BUILD** |
| Auto-adapt to UI changes | ✅ (patented) | ✅ (patented) | ❌ | **BUILD** |
| Parent chain context | ? | ? | ✅ | Ahead? |
| Cross-testid variants | ? | ? | ✅ (data-testid, data-test, data-cy) | Minor |

**Gap: AI-powered element detection + self-healing.** This is the BIG one. Three sub-components:

**2a. LLM Selector Recovery** (2-3 weeks)
When the 6-level cascade fails to find an element:
1. Take screenshot of current page
2. Get all interactive elements via DOM extraction
3. Send to LLM: "I'm looking for [old element_info]. Here are the current elements. Which one matches?"
4. LLM identifies the correct element
5. Update the stored selector (self-healing)

You already have: LLM service, element_info data, DOM extraction (in the engine SDK). The gap is wiring them together in the guide-runtime extension and on the backend.

**2b. Visual Element Matching** (4-6 weeks)
When both selectors AND LLM text matching fail:
1. Compare screenshot regions — the old screenshot (from recording) shows where the element WAS
2. Use vision model (GPT-4o, Claude) to find "the same button" on the current page
3. Return coordinates or best-matching element

This is what WalkMe's DeepUI does with their proprietary CV model. You can approximate it with vision LLMs — more expensive per call, but you only need it as a last resort. The economics work because it's the fallback of a fallback.

**2c. Continuous Adaptation** (2-3 weeks)
After any element is found via recovery (2a or 2b):
1. Extract the NEW selector information
2. Update the recording/walkthrough with the new selector
3. Next time, the primary cascade finds it directly — no LLM needed

This is the "self-healing" that saves the admin from manually fixing walkthroughs after every app update. WalkMe's "all our solutions worked after the Salesforce release" testimonial comes from this.

### LAYER 3: In-App Guidance Delivery

| Capability | WalkMe | Whatfix | stept today | Gap |
|---|---|---|---|---|
| Step-by-step walkthroughs | ✅ | ✅ (Flows) | ✅ (guide-runtime) | None |
| Tooltips on elements | ✅ | ✅ (Smart Tips) | 🟡 (context indicator only) | **UPGRADE** |
| Hotspots/beacons | ✅ | ✅ | ❌ | **BUILD** |
| Task lists | ✅ | ✅ | ❌ | **BUILD** |
| Self-help widget | ✅ | ✅ | 🟡 (extension sidepanel search) | **UPGRADE** |
| Pop-up announcements | ✅ | ✅ (Pop-Ups) | ❌ | **BUILD** |
| Launchers | ✅ | ✅ | ❌ | **BUILD** |
| Segmented by user role | ✅ | ✅ | 🟡 (RBAC exists) | **WIRE** |
| Cross-app journeys | ❌ | ✅ | ❌ | Later |
| Shadow DOM isolation | ✅ | ✅ | ✅ | None |

**Gaps are mostly UI widgets in the extension.** Your guide-runtime already does the hard part (finding elements, highlighting, click detection). What's missing are the TYPES of guidance:

- **Tooltips**: Show a tooltip anchored to a specific element with help text. Your guide-runtime already anchors to elements — this is adding a styled tooltip div instead of a highlight. (1 week)
- **Beacons/Hotspots**: Pulsating dot on an element to draw attention. CSS animation on a positioned div. (2-3 days)
- **Task lists**: Checklist widget showing "complete these 5 steps for onboarding." State stored server-side. (1 week)
- **Self-help widget**: Floating button → search panel → shows relevant guides. You have the sidepanel — make it embeddable as a widget on any page, not just when the extension sidepanel is open. (1-2 weeks)
- **Pop-ups/Announcements**: Modal overlay triggered by URL/page/user segment. (3-5 days)

These are all frontend Chrome extension features. No AI needed. No complex backend. Just styled components in your extension's content script with Shadow DOM isolation.

### LAYER 4: Automation

| Capability | WalkMe | Whatfix | stept today | Gap |
|---|---|---|---|---|
| Form auto-fill | ✅ | ✅ | ❌ | **BUILD** |
| Conversational automation | ✅ ("Turn text into action") | ❌ | ❌ | **BUILD** |
| Cross-app automation | ✅ | ❌ | ❌ | Later |
| Input validation | ✅ (AI) | ❌ | ❌ | Later |

**Form auto-fill** (2-3 weeks): Take a recording + variable data → fill form fields automatically. Your guide-runtime finds elements, your element_info has field types/labels. Add: variable substitution (${customer_name}) and action execution (fill instead of highlight).

**Conversational automation** (3-4 weeks): Chat interface → "submit my expense report for $450 for client dinner" → agent fills the form. Uses your existing chat UI + LLM function calling + the form auto-fill capability.

### LAYER 5: Analytics & Insights

| Capability | WalkMe | Whatfix | stept today | Gap |
|---|---|---|---|---|
| Walkthrough completion rate | ✅ | ✅ | ❌ | **BUILD** |
| User behavior tracking | ✅ (DeepUI reads forms) | ✅ (ScreenSense) | ❌ | **BUILD** |
| Error detection | ✅ | ✅ | ❌ | **BUILD** |
| Process mining | ✅ (Scribe-like) | 🟡 | ❌ | Later |
| AI insights (NL queries) | ❌ | ✅ (Insights Agent) | ❌ | Later |
| Usage analytics | ✅ | ✅ | 🟡 (view_count, audit log) | **UPGRADE** |

**Walkthrough analytics** (2-3 weeks):
- Track: which guide was triggered, completion rate per step, where users drop off, time per step
- Extension reports events to API: `guide_started`, `step_completed`, `step_skipped`, `guide_completed`, `guide_abandoned`
- Dashboard showing completion funnels per workflow
- This is high-value for enterprise buyers ("our Salesforce training walkthroughs have 78% completion")

**Error/friction detection** (4-6 weeks, later):
- Extension monitors for: form validation errors (red borders, error messages), page errors (console.error), repeated clicks on same element (user stuck), long time on single step
- Reports friction events to API
- Dashboard showing "top 10 friction points across your org"
- This is what WalkMe's DeepUI does and it's their biggest selling point for CIOs

### LAYER 6: Deployment & Targeting

| Capability | WalkMe | Whatfix | stept today | Gap |
|---|---|---|---|---|
| Chrome extension | ✅ | ✅ | ✅ | None |
| JS snippet embed | ✅ | ✅ | ❌ | **BUILD** |
| Desktop agent | ✅ | ✅ | ✅ (Electron) | None |
| User segmentation | ✅ (advanced) | ✅ | ❌ | **BUILD** |
| Trigger rules (URL/page/role) | ✅ | ✅ | 🟡 (context links) | **UPGRADE** |
| A/B testing | ✅ | ✅ | ❌ | Later |
| MDM deployment | ✅ | ✅ | ❌ | Later |

**JS snippet embed** (2-3 weeks): Critical for enterprise. Not every employee will install a Chrome extension. WalkMe/Whatfix work by adding a `<script>` tag to the app. IT admin adds it once → all users get walkthroughs without installing anything.

You'd build: a lightweight JS bundle (~50KB) that loads from your stept server, fetches relevant guides for the current page, and injects the guide-runtime. Essentially your guide-runtime packaged as a standalone script instead of a Chrome extension content script.

**User segmentation** (1-2 weeks): Show different guidance to different users. HR sees HR walkthroughs. Sales sees Sales walkthroughs. New hires see onboarding. Based on: user role, department (from SSO claims), custom attributes, URL patterns. You have RBAC and context links — extend context links with user attributes.

---

## Implementation Roadmap

### Phase 1: Self-Healing Element Detection (3 weeks)
**Goal: "Walkthroughs survive app updates without admin intervention"**
- LLM selector recovery in guide-runtime (extension)
- Backend endpoint: POST /api/v1/guide/recover-element (sends screenshot + element_info, returns new selector)
- Auto-update recording with recovered selector
- Test against Salesforce Lightning release (real-world validation)

### Phase 2: Guidance Widget Suite (3 weeks)
**Goal: "Full DAP guidance types, not just walkthroughs"**
- Tooltips anchored to elements (extension content script)
- Beacons/hotspots (CSS animation)
- Task lists with completion tracking
- Self-help search widget (embeddable, not just sidepanel)
- Pop-up announcements
- All with Shadow DOM isolation

### Phase 3: JS Snippet Deployment (2 weeks)
**Goal: "Add stept to any app with one script tag — no extension needed"**
- Bundle guide-runtime + widget suite as standalone JS
- Load configuration from stept server API
- `<script src="https://stept.company.com/widget.js" data-project="xxx"></script>`
- Admin dashboard for managing the snippet

### Phase 4: Walkthrough Analytics (2 weeks)
**Goal: "Know if your walkthroughs are working"**
- Event tracking: guide_started, step_completed, step_skipped, guide_completed, guide_abandoned
- Completion funnel dashboard per workflow
- Time-per-step analytics
- User completion rates (which users finished, which dropped off)

### Phase 5: User Segmentation & Targeting (2 weeks)
**Goal: "Right guidance to the right person at the right time"**
- Segment rules: by role, by department (SSO claims), by URL pattern, by custom attribute
- Trigger rules: show guide when URL matches, when element appears, on first visit, on schedule
- Admin UI for creating segments and assigning guidance

### Phase 6: Form Automation (3 weeks)
**Goal: "Guide can fill forms for users, not just show them where to click"**
- Variable system: ${customer_name}, ${amount}, ${date} in recordings
- Auto-fill action: guide-runtime fills fields instead of highlighting
- Variable sources: spreadsheet upload, API, manual entry, chat input
- Conversational automation: "submit my PTO for next Friday" → fills and submits

### Phase 7: Visual Element Matching (3 weeks)
**Goal: "Find elements even when the entire UI changes"**
- Screenshot comparison: old recording screenshot vs current page
- Vision LLM (GPT-4o/Claude): "Where is this button on the current page?"
- Coordinate-based fallback when all selector methods fail
- Only triggered as last resort — keeps cost low

### Phase 8: Error/Friction Detection (4 weeks)
**Goal: "Know where employees are struggling — without asking them"**
- Detect: form errors, repeated clicks, long dwell time, console errors
- Aggregate across users: "43 users got stuck on Step 3 of 'Create PO' this week"
- Dashboard: friction heatmap per application
- AI suggestions: "Users are struggling with the 'Cost Center' field — consider adding a tooltip"

---

## Timeline Summary

| Phase | Weeks | What You Get |
|---|---|---|
| 1. Self-Healing | 3 | Core differentiator. "Survives app updates." |
| 2. Widgets | 3 | Full DAP feature set. Tooltips, beacons, task lists. |
| 3. JS Snippet | 2 | Enterprise deployment without extension. |
| 4. Analytics | 2 | Completion tracking. CIO dashboard. |
| 5. Targeting | 2 | Right guidance → right user. |
| 6. Automation | 3 | Form fill. Conversational automation. |
| 7. Visual Match | 3 | Vision LLM fallback for element detection. |
| 8. Friction Detection | 4 | "Where are employees struggling." WalkMe's crown jewel. |
| **Total** | **22 weeks** | **~5.5 months to DAP parity** |

---

## What You Already Have That They Don't

These are features where you're AHEAD of WalkMe/Whatfix:

1. **Interactive Sandbox (Try-it mode)** — DOM snapshot → rrweb rebuild → users practice on a replica. Neither WalkMe nor Whatfix has this. Whatfix has "AI Roleplay" which is conversation-based, not real UI. This is genuinely unique and incredibly valuable for training.

2. **Video-to-Guide** — Upload a video, get a step-by-step guide. Neither competitor does this.

3. **MCP Server** — AI agents can query your knowledge base. Neither competitor exposes their content to external AI systems.

4. **Open Source + Self-Hosted** — The only DAP that can be self-hosted. Regulated industries (healthcare, finance, government) need this.

5. **DOM Snapshots** — Full page state captured with every recording. Enables sandbox mode AND visual diffing for change detection. WalkMe doesn't capture full DOM.

6. **Community Workflow Potential** — Neither WalkMe nor Whatfix has a public workflow repository. Shared walkthroughs for common apps (Salesforce, Workday, SAP) would be a massive distribution advantage.

---

## Priority for Enterprise Sales (what makes CIOs buy)

The order that matters for SELLING, not building:

1. **Self-healing** (Phase 1) — "Never fix a broken walkthrough again" ← this is the #1 pain point
2. **JS snippet** (Phase 3) — "Deploy in 5 minutes, no extension needed" ← removes adoption barrier
3. **Analytics** (Phase 4) — "See if your training is working" ← CIO needs metrics
4. **Targeting** (Phase 5) — "Right content to right users" ← required for org-wide rollout
5. **Widget suite** (Phase 2) — "Tooltips, beacons, help widget" ← feature checklist items
6. **Automation** (Phase 6) — "Do it for them when needed" ← upsell
7. **Visual match** (Phase 7) — "Works even on heavily customized apps" ← edge case solver
8. **Friction detection** (Phase 8) — "Find problems before users report them" ← premium

Build in this priority order if optimizing for revenue. Build in the phase order above if optimizing for technical coherence.
