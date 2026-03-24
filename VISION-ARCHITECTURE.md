# stept Vision Architecture — AI-Guided Process Learning

## The Vision (One Sentence)

**An AI that teaches you how to use any software by reading documentation, looking at your screen, and showing you exactly where to click — then remembers for everyone else.**

---

## The Killer Idea

### What exists today:
- **browser-use / AI agents**: Click buttons FOR you (expensive, unreliable, risky, no learning)
- **WalkMe / Tango / Usertour**: Pre-recorded guides (brittle, breaks when UI changes, someone has to record)
- **Documentation**: Static text/video (users don't read it, doesn't adapt to their screen)

### What stept does (nobody else):
1. User asks: "How do I create an S3 bucket?"
2. stept reads AWS documentation + existing knowledge base
3. stept opens the AWS console (user is already logged in via their browser)
4. AI looks at the live page (DOM extraction, same as browser-use)
5. AI maps documentation steps to actual UI elements on the screen
6. Instead of clicking: **highlights the element + shows a hint** ("👆 Click Services menu")
7. User clicks it themselves
8. AI sees the page changed, adapts — finds the next element
9. Continues step by step, adapting to whatever UI version/language/layout the user has
10. Records every step as the user goes
11. When completed and validated: saved as a workflow
12. Next person asks the same question: instant replay guide, no AI needed
13. If UI changes later: AI adapts on the fly, updates the recording

### Why this is a billion-dollar idea:
- **First run**: AI + docs → real-time adaptive guidance (~$0.10 in LLM costs)
- **Second run**: recorded replay → instant, free, 100% reliable
- **The flywheel**: every user interaction trains the system. More users = more recorded workflows = less AI needed = cheaper + faster

---

## Architecture Deep Dive

### Three Modes of Operation

```
MODE 1: AI-GUIDED (first time, no recording exists)
  Documentation + LLM + Live DOM → Real-time step hints
  Cost: $0.05-0.15 per task | Speed: User pace | Reliability: 70-85%

MODE 2: RECORDED REPLAY (recording exists, verified)
  Recorded steps + Multi-selector finder → Deterministic hints  
  Cost: $0.00 | Speed: Instant | Reliability: 95-99%

MODE 3: HYBRID (recording exists but UI changed)
  Try recorded selectors first → If fail, AI finds element → Update recording
  Cost: $0.01-0.05 | Speed: Near-instant | Reliability: 90-95%
```

### Mode 1: AI-Guided (The Innovation)

This is the new thing nobody has built. The flow:

```
User asks: "How do I create an API key in OpenAI?"

Step 1: Knowledge Assembly
├── Search stept knowledge base (existing workflows, documents)
├── If found: convert to guide steps → use Mode 2
├── If partial: use as context for AI
├── If nothing: fetch documentation from web

Step 2: Documentation Understanding  
├── Option A: URL provided → fetch page, extract steps
├── Option B: LLM already trained on the topic → generate steps from knowledge
├── Option C: Search web for tutorial → extract steps
├── Output: ordered list of abstract steps:
│   1. "Navigate to platform.openai.com"
│   2. "Click on 'API keys' in the sidebar"  
│   3. "Click 'Create new secret key'"
│   4. "Name the key"
│   5. "Copy the key"

Step 3: Live Page Analysis (per step)
├── Get current page URL
├── Check: does this step's expected URL match?
│   ├── YES → extract interactive elements from DOM
│   └── NO → show navigation hint: "Navigate to platform.openai.com"
├── Extract interactive elements (same as browser-use):
│   [{index: 0, tag: "a", text: "API keys", role: "link", ...}, ...]
├── Send to LLM: "Which element matches step: 'Click on API keys in sidebar'?"
├── LLM responds: {index: 3, confidence: 0.92}
├── Show highlight on element + hint pill: "👆 Click API keys"

Step 4: User Action Detection
├── User clicks the highlighted element
├── Detect click via event listener
├── Record: element info (selectorSet, text, position, screenshot)
├── Wait for page to settle (MutationObserver / URL change)
├── Move to next step → back to Step 3

Step 5: Completion & Recording
├── All steps completed
├── Save as verified workflow recording
├── Index for search
├── Next time: Mode 2 (instant replay)
```

### Key Technical Decisions for Mode 1

**Q: How does the AI know what steps to show?**

Three sources, tried in order:
1. **Existing recordings** in stept knowledge base (instant, free)
2. **LLM's trained knowledge** about common software (fast, cheap)
3. **Documentation URL** provided by user or fetched from web (accurate but slower)

For option 2, the prompt is:
```
You are helping a user navigate a web application.
Task: "Create an API key in OpenAI"
Current page URL: https://platform.openai.com/
Interactive elements on the page: [list from DOM extraction]

What should the user do next? Respond with:
{
  "instruction": "Click on 'API keys' in the left sidebar",
  "element_index": 3,
  "confidence": 0.92,
  "done": false
}
```

For option 3 (documentation), the flow is:
```
1. Fetch docs URL in background tab
2. Extract steps using LLM: "Extract step-by-step instructions from this page"
3. Cache the extracted steps
4. Use them as the guide plan
```

**Q: Should the AI call the LLM every step or plan ahead?**

PLAN AHEAD. Call the LLM ONCE to generate a full plan (5-15 steps), then for each step only call the LLM if the element finder can't match the planned step to a visible element. This minimizes cost:
- Plan: 1 LLM call ($0.02)
- Per step: element matching via DOM (free), LLM only if confused ($0.01)
- Total: $0.02-0.15 instead of $0.15+ if calling every step

**Q: What happens when the AI plan doesn't match the actual UI?**

The AI should be adaptive:
1. If element not found → scroll, wait for SPA, try again
2. If page layout is different → re-extract DOM, ask LLM "which element matches this step?"
3. If step doesn't apply (e.g., user already logged in) → skip ahead
4. If completely lost → show the documentation text and let user proceed manually

**Q: How does this work in the extension vs headless?**

Extension ONLY for Mode 1. The AI needs to see the user's actual browser (their auth, their language, their custom UI). Headless doesn't work here — this is about teaching the HUMAN, not automating a bot.

### Mode 2: Recorded Replay (Battle-Tested Reliability)

This is what needs to work 99.9% of the time. Based on analysis of Usertour, Tango, and browser-use:

**Element Finding (priority order):**
```
1. selectorSet (6-9 CSS selectors recorded at capture time)
   → Try ALL of them. If ANY resolves to a unique visible element, use it.
   → This is our biggest advantage over Tango (1 selector) and Usertour (1 selector + parent chain)

2. Primary selector (backward compatible with old recordings)

3. data-testid variants (data-testid, data-test, data-cy, data-qa, data-e2e, data-hook, data-automation-id)

4. Semantic match: role + text (aria-label, innerText, title)

5. Tag + text (fuzzy matching with normalized whitespace)

6. XPath (recorded at capture time)

7. Parent chain context (parent's id/testid/role → child element)

8. Title hint extraction (parse step title for element text hints)
```

**Step Execution (event-driven, NOT polling):**
```
Based on Usertour's ElementWatcher pattern:

1. Start: create watcher for step's element
2. Watcher uses setTimeout retry (200ms intervals), NOT setInterval
3. On found → emit event → show highlight + hint
4. On timeout (2-3s) → emit timeout → show fallback UI
5. On DOM change → re-validate element → emit changed if different
6. On step complete (user clicks) → destroy watcher → create next step's watcher
7. Clean transition: ALL handlers removed before next step starts
```

**Reliability guarantees:**
- selectorSet alone gets us 95%+ (if ANY of 6-9 selectors works, we're good)
- Semantic fallbacks get another 3-4%
- Title hint gets the last 1-2%
- Manual "mark complete" covers the 0.1% edge cases
- Total: 99%+ for recorded workflows on unchanged UIs

### Mode 3: Hybrid (Self-Healing)

When Mode 2's selector cascade fails (UI changed):
```
1. All 8 finder levels failed
2. Take screenshot + extract current page elements
3. Send to LLM: "I'm looking for [element_info from recording]. Here are current elements. Which one?"
4. LLM identifies the element (same prompt as browser-use)
5. Use the found element
6. UPDATE the recording's selectorSet with the new element's selectors
7. Next time: Mode 2 works again (self-healed)
```

Cost: $0.01-0.05 per self-healing event (only when selectors break)

---

## The Guide Runtime Architecture

Based on the deep analysis of Usertour, Tango, browser-use, and our current code:

### Core Components

```typescript
// 1. ElementFinder — Pure function, no state
// Tries all strategies in order, returns element + confidence
interface FindResult {
  element: Element;
  confidence: number;  // 0-1
  method: string;      // which strategy found it
}

// 2. ElementWatcher — Event emitter, manages search lifecycle
// Uses setTimeout retries (Usertour pattern)
class ElementWatcher extends EventEmitter {
  events: 'found' | 'changed' | 'timeout'
  // NOT setInterval — controlled setTimeout retries
  // Validates element is still correct after SPA re-renders
}

// 3. StepExecutor — Manages one step's lifecycle
// Owns: watcher, click handler, hint UI
// Clean destruction before next step
class StepExecutor {
  start(step) → creates watcher, subscribes to events
  destroy() → removes ALL handlers, destroys watcher
}

// 4. OverlayRenderer — Pure UI rendering
// Light mode: dashed border + hint pill (Tango style)
// Positioned relative to element with viewport awareness
class OverlayRenderer {
  showHighlight(element)
  showHint(text, element)
  hideAll()
}

// 5. GuideRunner — Orchestrates the full guide
// State machine: idle → running → paused → completed
class GuideRunner {
  start(guide, mode) → starts first step
  nextStep() → cleans current, starts next
  stop() → cleans everything
}

// 6. AIGuideEngine — Mode 1 only
// Generates steps from documentation/LLM
// Maps abstract steps to live UI elements
class AIGuideEngine {
  planFromTask(task, pageUrl) → Step[]
  findElementForStep(step, pageElements) → element index
  adaptToPageChange(currentPlan, newPage) → updated plan
}
```

### State Machine

```
                    START_GUIDE
                        │
                        ▼
    ┌──────────── IDLE ◄──────────────┐
    │                │                 │
    │           start(guide)           │
    │                │                 │
    │                ▼                 │
    │         ┌─ SEARCHING ──┐        │
    │         │  (watcher     │        │
    │         │   looking)    │        │
    │         └──────┬───────┘        │
    │                │                 │
    │        found   │  timeout        │
    │                │                 │
    │       ┌────────┴────────┐       │
    │       ▼                 ▼       │
    │    ACTIVE          NOT_FOUND    │
    │  (highlight         (fallback   │
    │   shown)            UI shown)   │
    │       │                 │       │
    │   user clicks    mark complete  │
    │       │                 │       │
    │       ▼                 ▼       │
    │    ADVANCING ───────────┘       │
    │       │                         │
    │  next step exists?              │
    │       │                         │
    │   YES → back to SEARCHING      │
    │   NO  → COMPLETED ─────────────┘
    │
    │  STOP_GUIDE at any point
    └──────────────────────────────────
```

### What Gets Recorded (per step)

During Mode 1 (AI-guided) or user recording:
```json
{
  "step_number": 1,
  "action_type": "click",
  "url": "https://platform.openai.com/",
  "expected_url": "https://platform.openai.com/",
  
  "element_info": {
    "tagName": "a",
    "text": "API keys",
    "ariaLabel": "API keys",
    "role": "link",
    "testId": null,
    "id": "nav-api-keys",
    "className": "nav-link active",
    "href": "/api-keys",
    "placeholder": null,
    "parentChain": [
      {"tag": "nav", "role": "navigation", "ariaLabel": "Sidebar"},
      {"tag": "div", "id": "app-sidebar"}
    ]
  },
  
  "selector": "#nav-api-keys",
  "selectorSet": [
    "#nav-api-keys",
    "a[href=\"/api-keys\"]",
    "nav a:has-text(\"API keys\")",
    "[role=\"navigation\"] a[aria-label=\"API keys\"]",
    "a.nav-link:nth-of-type(3)"
  ],
  
  "xpath": "/html/body/div/nav/a[3]",
  
  "title": "Click on API keys",
  "description": "Navigate to the API keys section in the sidebar",
  
  "screenshot_key": "step_1_screenshot.png",
  "screenshot_relative_position": {"x": 45, "y": 312},
  "screenshot_size": {"width": 1920, "height": 1080}
}
```

---

## Documentation-to-Guide Pipeline (Mode 1 Detail)

### Option A: LLM Already Knows

For common software (AWS, Salesforce, OpenAI, Google Workspace, etc.), the LLM already knows the steps. This is the fastest and cheapest path.

```
User: "How do I create an S3 bucket?"

LLM generates plan (1 call, ~$0.02):
[
  {"instruction": "Navigate to s3.console.aws.amazon.com", "type": "navigate"},
  {"instruction": "Click 'Create bucket'", "type": "click", "target_text": "Create bucket"},
  {"instruction": "Enter bucket name", "type": "type", "target_placeholder": "Bucket name"},
  {"instruction": "Select AWS Region", "type": "select"},
  {"instruction": "Click 'Create bucket' button", "type": "click", "target_text": "Create bucket"}
]

For each step, the element matcher finds the target on the live page.
No documentation fetch needed.
```

### Option B: Documentation URL

User provides a docs URL, or stept searches for one.

```
User: "How do I set up CORS in CloudFront?" 
User: (optionally provides: https://docs.aws.amazon.com/cloudfront/latest/APIReference/...)

stept:
1. Fetch the docs page (or search for it)
2. Extract text content
3. Send to LLM: "Extract step-by-step UI instructions from this documentation"
4. LLM returns structured steps
5. Cache for future use
6. Guide user through steps on the live page
```

### Option C: Hybrid — LLM + Docs

```
LLM generates initial plan from training knowledge
→ For uncertain steps, fetch specific docs section for verification
→ Merge: LLM's UI awareness + docs' accuracy
```

### The Balance (your question about "not always pulling docs")

```
Decision tree:
1. Check stept knowledge base → found verified recording? → Mode 2 (replay, free)
2. Check stept knowledge base → found unverified/partial? → Mode 3 (hybrid)
3. LLM confident about this software? → Mode 1A (LLM-only plan, cheap)
4. Docs URL provided? → Mode 1B (fetch + extract, accurate)
5. Nothing available? → Search web → extract → Mode 1B

For 80% of common software tasks, option 3 (LLM-only) works.
Documentation fetch is only needed for:
- Obscure/niche software
- Very recent features (post-training cutoff)
- Complex multi-step procedures where accuracy matters
```

---

## What Makes This Beat Everything Else

### vs browser-use (AI agents)
| | browser-use | stept |
|---|---|---|
| Approach | Does it FOR you | TEACHES you |
| Cost per run | $0.15-2.00 | $0.00-0.10 |
| Second run | Same cost | FREE (replay) |
| User learns | No | Yes |
| Needs auth | Complex | None (user's browser) |
| Compliance | Risky (unsupervised) | Safe (human in loop) |
| Error handling | Agent gets stuck | User can adapt |

### vs WalkMe/Tango/Usertour (DAPs)
| | Traditional DAP | stept |
|---|---|---|
| Guide creation | Manual recording | AI generates from docs/knowledge |
| UI changes | Breaks until re-recorded | Self-healing via AI |
| New software | Someone must record first | AI teaches immediately |
| Coverage | Only what's recorded | Everything the AI knows |
| Cost | $200K+/year | Open source / free |

### The moat
1. **Network effect**: Every AI-guided session creates a recording. More users = more recordings = less AI needed.
2. **Knowledge accumulation**: Over time, stept knows how to navigate every common SaaS — for free.
3. **Self-healing**: Recordings auto-update when UI changes. No maintenance burden.
4. **Open source**: Community contributes recordings. "Stept knows how to use Salesforce" becomes a community asset.

---

## Implementation Plan (not for today — for reference)

### Phase 1: Reliable Replay (Mode 2) — THE FOUNDATION
Make recorded guides work 99.9%. Everything else depends on this.
- Event-driven step execution (Usertour pattern)
- Multi-selector finder cascade
- Light overlay UI
- Proper testing on real sites

### Phase 2: Self-Healing (Mode 3)
When replay fails, AI fixes it.
- LLM element recovery endpoint
- Recording auto-update
- Confidence scoring

### Phase 3: AI-Guided Teaching (Mode 1) — THE KILLER FEATURE
AI teaches from documentation/knowledge.
- Task planning from LLM knowledge
- Live DOM → element matching
- Step-by-step adaptive guidance
- Recording capture during guided session

### Phase 4: Documentation Pipeline
Fetch, parse, and cache documentation.
- URL → structured steps extraction
- Knowledge base integration
- Community workflow library

---

## Open Questions (need your input)

1. **Should Mode 1 work WITHOUT the extension?** (via the embed widget on customer's own app vs via the extension on any app)

2. **Should the AI plan be visible to the user?** ("Here's what we'll do: 5 steps to create an S3 bucket") or hidden?

3. **What happens when the AI is wrong?** (highlights wrong element) — should user be able to correct it?

4. **Should completed AI-guided workflows auto-publish** to the knowledge base, or require admin review?

5. **Pricing for Mode 1**: The AI calls cost money. Who pays? Is it metered per-guide, per-user, or flat rate?

---

## Appendix: Three-Layer Element Finding Architecture

### The Core Insight

No single approach is bullet-proof. The answer is three layers, each handling a different failure mode:

```
Layer 1: Deterministic (Usertour approach) — 95% of cases
  Multi-selector tree + parent chain + sibling verification
  Instant, free, handles minor UI changes

Layer 2: AI-Assisted (browser-use approach) — 4% of cases  
  Extract all page elements → LLM matches to target description
  2-3 seconds, $0.01, handles major UI changes
  → Self-heals: updates Layer 1's selectors for next time

Layer 3: Human Fallback (Tango approach) — 1% of cases
  Show screenshot with click marker
  "We couldn't find the element. Do what's shown here."
  → "Mark as complete" to proceed
```

### Layer 1: Deterministic Finder (REWRITE recording capture + guide finder)

**At CAPTURE TIME** — upgrade `extension/src/content/elements.ts`:

Currently we capture `selectorSet` (6-9 flat selectors). Upgrade to Usertour's tree structure:

```typescript
interface SelectorTree {
  // Multiple selectors for THIS element (6-9 strategies)
  selectors: string[];
  // Multiple selectors for previous sibling
  prevSiblingSelectors: string[];
  // Multiple selectors for next sibling
  nextSiblingSelectors: string[];
  // Depth in the tree (0 = target element)
  depth: number;
  // Parent's selector tree (recursive)
  parent: SelectorTree | null;
}

// At capture time:
function captureElementFingerprint(el: Element): {
  selectorTree: SelectorTree;   // Full tree structure for reliable finding
  selectorSet: string[];        // Flat list (backward compatible)
  content: string;              // innerText for verification
  elementInfo: ElementInfo;     // Existing rich element data
}
```

Key: we use `@medv/finder` library (same as Usertour) — it generates optimal CSS selectors with configurable strategies. We run it 6 times with different configs to get 6 different selectors.

**At REPLAY TIME** — rewrite guide-runtime finder:

```typescript
function findElement(target: CapturedElement): Element | null {
  // Step 1: Try all selectors, collect candidates
  const candidates = new Map<Element, number>(); // element → vote count
  for (const sel of target.selectorTree.selectors) {
    try {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) {
        candidates.set(el, (candidates.get(el) || 0) + 1);
      }
    } catch {}
  }
  
  // Step 2: If one element got ALL votes → it's definitely right
  if (candidates.size === 1) return [...candidates.keys()][0];
  
  // Step 3: If multiple candidates → disambiguate with parent chain
  if (candidates.size > 1) {
    return disambiguateByParentChain(
      [...candidates.keys()], 
      target.selectorTree
    );
  }
  
  // Step 4: No candidates from selectors → try content/text match
  // (uses our existing role+text, tag+text, title-hint fallbacks)
  return findByContent(target);
}

function disambiguateByParentChain(candidates: Element[], tree: SelectorTree): Element | null {
  let bestEl: Element | null = null;
  let bestScore = -1;
  
  for (const candidate of candidates) {
    let score = 0;
    let parentNode = tree.parent;
    let parentEl = candidate.parentElement;
    
    // Walk up the tree comparing parents
    while (parentNode && parentEl) {
      const parentMatches = parentNode.selectors.some(sel => {
        try { return parentEl === document.querySelector(sel); } catch { return false; }
      });
      if (parentMatches) score++;
      
      // Also check siblings for bonus points
      if (parentNode.prevSiblingSelectors?.length) {
        const prevMatch = parentNode.prevSiblingSelectors.some(sel => {
          try { return parentEl.previousElementSibling === document.querySelector(sel); } catch { return false; }
        });
        if (prevMatch) score += 0.5;
      }
      
      parentNode = parentNode.parent;
      parentEl = parentEl.parentElement;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestEl = candidate;
    }
  }
  
  return bestEl;
}
```

### Layer 2: AI-Assisted Recovery (REUSE existing Python SDK code)

We already built this in `packages/stept-engine/stept/`:
- `dom.py` → `get_interactive_elements()` extracts all page elements
- `dom.py` → `serialize_elements_for_llm()` formats for LLM
- `agent.py` → LLM prompt for element matching
- `prompts.py` → System prompt

For the extension, we need a BACKEND ENDPOINT that the guide-runtime calls:

```
POST /api/v1/guide/recover-element
Body: {
  "target": { elementInfo, selectorTree, content },
  "page_elements": [{ tag, text, role, ariaLabel, ... }],  
  "page_url": "https://..."
}
Response: {
  "found": true,
  "element_index": 5,
  "confidence": 0.87,
  "new_selectors": ["#new-id", "button[aria-label='Save']"]
}
```

The extension's guide-runtime:
1. Calls this endpoint when Layer 1 fails
2. Backend uses existing `serialize_elements_for_llm()` + LLM to find the match
3. Returns the matching element index + new selectors
4. Guide-runtime highlights element index 5
5. **Self-healing**: backend updates the recording's selectorTree with new_selectors

### Layer 3: Human Fallback (KEEP existing sidepanel)

Already built in `GuideStepsPanel.tsx`:
- Shows screenshot with click marker ✅
- "Mark as complete" button ✅
- Step list with progress ✅

Just need the guide-runtime to properly communicate "not found" to the sidepanel so it shows the screenshot.

### Multi-Page Handling (NEEDS IMPLEMENTATION)

Tango handles this via their service worker. We need:

1. **URL watcher in guide-runtime**: popstate + hashchange + 500ms SPA polling
2. **Step-URL matching in background script**: when URL changes, find which step expects this URL
3. **Re-injection**: when full page navigation happens, background re-injects guide-runtime at the correct step
4. **Auto-skip**: if user navigates ahead of the current step, jump to the matching step

This is partially implemented in `extension/src/background/guides.ts` but needs to be more robust.

### What We REWRITE vs REUSE vs KEEP

```
REWRITE (from scratch, properly):
├── extension/src/guide-runtime/index.ts 
│   New architecture: ElementFinder (Usertour tree) + ElementWatcher (events) 
│   + OverlayRenderer (light) + GuideRunner (state machine)
│
├── extension/src/content/elements.ts (UPGRADE capture)
│   Add: SelectorTree capture (parents + siblings)
│   Add: @medv/finder for optimal selector generation
│   Keep: existing ElementInfo, selectorSet (backward compatible)

REUSE (already built):
├── packages/stept-engine/stept/dom.py → page element extraction for Layer 2
├── packages/stept-engine/stept/prompts.py → LLM prompts for Layer 2
├── packages/stept-engine/stept/agent.py → LLM decision logic for Layer 2
├── api/app/services/llm.py → LLM gateway for Layer 2 backend endpoint

KEEP (don't touch):
├── extension/src/sidepanel/components/GuideStepsPanel.tsx → step list UI
├── extension/src/sidepanel/components/StepCard.tsx → step card with screenshot
├── extension/src/background/guides.ts → guide loading + injection
├── extension/src/content/capture.ts → recording capture flow
├── All API routes, models, frontend
```

### Implementation Order

```
Step 1: Upgrade element CAPTURE (elements.ts)
  Add SelectorTree recording with parent chain + siblings
  Add @medv/finder integration
  Test: record a workflow, verify selectorTree is populated

Step 2: Rewrite element FINDER (guide-runtime)
  Implement Usertour-style finderX with parent disambiguation
  Use event-driven watcher (not setInterval)
  Test: replay a recorded workflow, verify elements found reliably

Step 3: Add Layer 2 backend endpoint
  POST /api/v1/guide/recover-element
  Reuse existing SDK dom extraction + LLM code
  Test: break a selector manually, verify LLM recovery works

Step 4: Wire Layer 2 into guide-runtime
  When finder fails → call recovery endpoint → self-heal
  Test: change a page's CSS, verify guide still works

Step 5: Multi-page handling
  URL watcher + step-URL matching + re-injection
  Test: record a multi-page workflow, replay across navigations
```
