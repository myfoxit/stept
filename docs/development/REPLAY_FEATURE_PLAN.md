# Ondoki Replay & Automation — Feature Plan

## Overview

Turn recorded workflows into **replayable automations**. Capture rich UI element trees during recording, store them persistently, and use a combination of element matching + OCR + LLM fallback to re-execute workflows on demand.

---

## Current State

### What we capture today
- **Screenshot** per step (stored in S3/local)
- **Click position** (global, relative, screenshot-relative)
- **Window title** + **owner app**
- **Element info** (flat): role, title, value, description, subrole, domId, confidence
- **Action type**: click, type, scroll, key press
- **Text typed / key pressed**
- **Spoken narration** (from audio transcription)

### What we throw away
- **Parent chain** (the native addon walks parents but doesn't store them)
- **Sibling elements** (context around the clicked element)
- **Element bounds/frame** (position and size of the AX element)
- **Full element path** (like a CSS selector but for accessibility tree)
- **Window element tree** (the full or partial AX hierarchy)
- **Element state** (enabled, focused, selected, expanded)

---

## Phase 1: Rich Element Capture (Desktop App)

**Goal**: Capture enough UI context to reliably re-find elements later.

### 1a. Extend native addon (`window-info.swift`)

Capture on each click/interaction:

```
clicked_element: {
  role, subrole, title, value, description, domId,
  frame: { x, y, width, height },       // AXFrame — element bounds
  enabled: bool,                          // AXEnabled
  focused: bool,                          // AXFocused
  identifier: string,                     // AXIdentifier (SwiftUI)
}

parent_chain: [                           // Walk up to 5 ancestors
  { role, subrole, title, frame, identifier },
  ...
]

siblings: [                               // Same-level elements
  { role, title, frame, identifier },
  ...
]

element_path: "AXApplication > AXWindow > AXGroup > AXButton"  // Role path
```

**Cost**: ~1-3ms extra per interaction (AX queries are fast).
**Storage**: ~500 bytes - 2KB JSON per step. Negligible.

### 1b. Store in DB

Already have `element_info = Column(JSON)` — just put richer data in it. **No migration needed.** The field is intentionally schema-free.

New shape:
```json
{
  "role": "AXButton",
  "title": "Submit",
  "frame": { "x": 450, "y": 320, "width": 120, "height": 36 },
  "domId": "submit-btn",
  "identifier": "submitButton",
  "enabled": true,
  "parent_chain": [
    { "role": "AXGroup", "title": "Form Actions", "identifier": "formActions" },
    { "role": "AXWindow", "title": "New Order — Chrome" }
  ],
  "siblings": [
    { "role": "AXButton", "title": "Cancel" },
    { "role": "AXButton", "title": "Save Draft" }
  ],
  "element_path": "AXApplication/AXWindow/AXWebArea/AXGroup/AXButton[Submit]"
}
```

### Estimated effort: 2-3 days

---

## Phase 2: OCR Layer

**Goal**: Extract visible text from screenshots as a fallback locator when AX elements aren't available or have changed.

### Approach

| Option | Cost | Quality | Latency |
|--------|------|---------|---------|
| **Tesseract (local)** | Free | Good for Latin text | 200-500ms/image |
| **Apple Vision (macOS)** | Free | Excellent | 50-100ms/image |
| **GPT-4o mini vision** | ~$0.001/image | Excellent | 1-2s/image |

**Recommendation**: 
- **During recording**: Use Apple Vision framework (VNRecognizeTextRequest) on macOS — it's free, fast, and already available. Capture text + bounding boxes.
- **During replay/fallback**: Use GPT-4o mini vision only when element matching fails. 

### What to capture per step
```json
{
  "ocr_texts": [
    { "text": "Submit Order", "bounds": { "x": 450, "y": 315, "width": 130, "height": 22 }, "confidence": 0.98 },
    { "text": "Cancel", "bounds": { "x": 300, "y": 315, "width": 60, "height": 22 }, "confidence": 0.97 }
  ]
}
```

### Storage
- Store in `element_info` JSON (alongside AX data)
- ~1-5KB per step depending on text density
- For a 15-step workflow: ~30-75KB total. Trivial.

### Estimated effort: 3-4 days (Apple Vision integration + storage)

---

## Phase 3: Replay Engine

**Goal**: Re-execute a recorded workflow step by step.

### Architecture

```
┌─────────────────────────────────────────────┐
│              Replay Controller               │
│  (Electron main process / new service)       │
├─────────────────────────────────────────────┤
│                                             │
│  For each step:                             │
│    1. Element Matcher (fast, free)          │
│    2. OCR Matcher (fast, free)              │
│    3. LLM Fallback (slow, costs money)      │
│    4. Human Intervention (last resort)       │
│                                             │
└─────────────────────────────────────────────┘
```

### 3a. Element Matching Strategy (Cascade)

**Level 1 — Exact Match (free, <10ms)**
- Find element by `identifier` or `domId` (most reliable)
- Verify `role` matches
- Verify `title` matches (fuzzy — UI text may change slightly)

**Level 2 — Path Match (free, <50ms)**  
- Walk AX tree using `element_path`
- Match by role chain + partial title matching
- Use `frame` position as tiebreaker when multiple candidates

**Level 3 — Sibling Context Match (free, <100ms)**
- Find the parent, then look for an element among siblings matching role+title
- Handles cases where element moved within the same container

**Level 4 — OCR Match (free, <500ms)**
- Take screenshot of current state
- Run OCR (Apple Vision)
- Find text matching the step's expected element title/text
- Use bounding box to click

**Level 5 — LLM Vision Match ($$, 1-3s)**
- Send current screenshot + target description to GPT-4o mini
- "Find the Submit button in this screenshot. Return coordinates."
- Last resort before asking the human

**Level 6 — Human Intervention**
- Show the screenshot with a highlight of where we expected the element
- "I can't find [Submit button]. Please click it or skip this step."

### 3b. Action Execution

```
click    → AXPerformAction(kAXPressAction) or CGEvent click at coordinates
type     → CGEvent key events (already have this in native addon)
scroll   → CGEvent scroll
key      → CGEvent key press
wait     → Check for expected state change (element appears/disappears)
```

### 3c. Step Validation

After each action, verify the step succeeded:
- Take screenshot, compare to expected next state (perceptual hash)
- Check if expected next element exists
- If mismatch → pause and offer: retry / skip / abort

### Estimated effort: 2-3 weeks

---

## Phase 4: LLM-Assisted Recovery

**Goal**: When element matching fails, use an LLM to figure out what to do.

### When to invoke LLM

1. **App not open** → LLM: "The workflow expects Google Chrome with 'New Order' page. Chrome is open but showing the homepage. Should I navigate to the URL?"
2. **Element gone** → LLM: "Expected 'Submit' button but found 'Confirm Order' button in the same position. Likely a UI update. Proceed?"
3. **Different tab/window** → LLM: "Expected window 'New Order' but active window is 'Email'. Switch to Chrome?"
4. **Multi-step navigation** → LLM: "The form now has a new 'Terms' checkbox before Submit. Should I check it?"

### Cost Control Strategy

| Action | Cost |
|--------|------|
| Element match (Level 1-3) | Free |
| OCR match (Level 4) | Free (Apple Vision) |
| LLM vision (Level 5) | ~$0.003 per step (GPT-4o mini) |
| LLM recovery decision | ~$0.001 per call (GPT-4o mini text) |

**For a 15-step workflow:**
- Best case (all elements found): **$0.00**
- Typical (2-3 LLM fallbacks): **$0.01**
- Worst case (every step needs LLM): **$0.05**

### Cost guardrails
- Set max LLM calls per replay (default: 10)
- Cache LLM decisions for identical situations
- User can choose: "Never use LLM" / "Use LLM as fallback" / "Always verify with LLM"

### Estimated effort: 1-2 weeks

---

## Phase 5: Replay UI

### Desktop App
- "Replay" button on each workflow
- Speed control: 0.5x, 1x, 2x, instant
- Step-by-step mode (pause after each step)
- Live overlay showing: current step, match confidence, action
- Abort / pause / skip controls

### Web App (monitoring)
- Replay status dashboard
- Step-by-step progress with screenshots
- Error log with LLM decisions made
- Cost tracking per replay

### Estimated effort: 1-2 weeks

---

## Cost Summary

### Storage costs (ongoing)
| Data | Per step | Per 15-step workflow | Per 1000 workflows |
|------|----------|---------------------|-------------------|
| Rich element JSON | ~2KB | ~30KB | ~30MB |
| OCR data | ~3KB | ~45KB | ~45MB |
| Screenshots (existing) | ~200KB | ~3MB | ~3GB |
| **Total incremental** | **~5KB** | **~75KB** | **~75MB** |

Negligible — S3 storage costs ~$0.023/GB/month.

### Runtime costs (per replay)
| Scenario | Cost |
|----------|------|
| All elements found (no LLM) | $0.00 |
| Typical (2-3 LLM calls) | $0.01 |
| Heavy LLM usage (10 calls) | $0.05 |
| Worst case cap | $0.10 |

### Development costs
| Phase | Effort | Dependencies |
|-------|--------|-------------|
| 1. Rich element capture | 2-3 days | Native addon changes |
| 2. OCR layer | 3-4 days | Apple Vision / Tesseract |
| 3. Replay engine | 2-3 weeks | Phase 1 + 2 |
| 4. LLM recovery | 1-2 weeks | Phase 3 |
| 5. Replay UI | 1-2 weeks | Phase 3 |
| **Total** | **6-9 weeks** | |

---

## Implementation Order

```
Week 1-2:  Phase 1 — Rich element capture (ship independently, no replay yet)
                      Just starts storing richer data. Zero risk, immediate value
                      for better AI annotations too.

Week 2-3:  Phase 2 — OCR during recording (Apple Vision)
                      Also ships independently — improves step descriptions
                      and search even without replay.

Week 3-5:  Phase 3 — Replay engine core (element matching cascade)
                      The hard part. Start with Level 1-3 (free matching).
                      Get basic replay working for simple workflows.

Week 5-7:  Phase 4 — LLM fallback + recovery
                      Add the intelligence layer. Handle edge cases.

Week 7-9:  Phase 5 — Replay UI (desktop + web monitoring)
                      Make it user-facing and polished.
```

### Key principle: Each phase ships independently and adds value on its own.
- Phase 1 → Better AI annotations, richer search
- Phase 2 → Better descriptions, text search in screenshots
- Phase 3+ → Full replay capability

---

## Open Questions

1. **Cross-platform**: macOS first (AX API), Windows later (UI Automation API)?
2. **Scheduling**: Should replays be schedulable (cron-like)? Or always manual?
3. **Variables**: Should users be able to parameterize steps? (e.g., "type {order_number}" instead of "type 12345")
4. **Branching**: Handle conditional flows? (e.g., "if error message appears, click Retry")
5. **Headless**: Could replay work without a visible screen? (Probably not for desktop apps, but possible for web-only workflows with Playwright)
