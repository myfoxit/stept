# Guide Replay — Remaining Implementation Plan

Generated 2026-03-24. Based on deep analysis of VISION-ARCHITECTURE.md, current codebase, and Tango reverse engineering.

---

## What's Been Done (Phase 1+2)

- Recovery API routed through background script (was hitting wrong server)
- Guide panel takes over full sidepanel when active (no dashboard clutter)
- Backdrop dimming removed (Tango-style: highlight ring + tooltip only)
- Light theme tooltip/overlay (white bg, coral #FF6B52 accent)
- Screenshots zoom 2x to click area with click markers
- Click-to-expand opens full-size modal on the page via shadow DOM
- Smooth scrolling with fixed header detection + rAF position tracking
- Mark as complete / step jumping fixes
- Step circles show numbers (completed = green checkmark)

---

## Phase 3: Runtime Core Rewrite (1-2 weeks)

Replace the monolithic polling-based GuideRunner with the vision's component architecture.

### 3.1 ElementWatcher Class

Replace `_startElementPolling` (setInterval 150ms) with an event-driven watcher.

```typescript
class ElementWatcher extends EventEmitter {
  // Events: 'found' | 'changed' | 'timeout'
  
  constructor(step: GuideStep, options: { timeoutMs: number }) {}
  
  start(): void {
    // Use MutationObserver on document.body for DOM changes
    // On mutation: check if target element appeared/changed
    // Use setTimeout retries (Usertour pattern), NOT setInterval
    // First check immediately, then 100ms, 200ms, 400ms (exponential backoff)
    // Emit 'found' with FindResult when element located
    // Emit 'changed' if element moves/resizes (via ResizeObserver)
    // Emit 'timeout' after timeoutMs if not found
  }
  
  destroy(): void {
    // Disconnect all observers
    // Clear all timeouts
    // Remove all listeners
  }
}
```

**Why**: Current polling calls `collectSearchRoots()` every 150ms which does `querySelectorAll("*")` on the entire DOM. On complex pages this is O(n) per tick. MutationObserver is event-driven — only fires when DOM actually changes.

**Files**: `extension/src/guide-runtime/index.ts`

### 3.2 StepExecutor Class

Owns one step's complete lifecycle. Clean separation of concerns.

```typescript
class StepExecutor {
  private watcher: ElementWatcher;
  private clickHandler: (() => void) | null;
  private completionCleanup: (() => void) | null;
  
  constructor(step: GuideStep, index: number, renderer: OverlayRenderer) {}
  
  start(): Promise<'completed' | 'skipped' | 'timeout'> {
    // Create ElementWatcher for this step
    // On 'found': render overlay, setup click handler, setup completion detection
    // On 'changed': update overlay position
    // On 'timeout': try LLM recovery, then show roadblock
    // On user click target: resolve promise with 'completed'
    // On skip button: resolve with 'skipped'
  }
  
  destroy(): void {
    // Destroy watcher
    // Remove ALL event listeners (click, keyboard, mutation)
    // Clear overlay
    // This is the KEY fix for event listener race conditions
  }
}
```

**Why**: Currently, click handlers, completion detection, position tracking, and overlay rendering are all mixed into GuideRunner. When transitioning between steps, cleanup is incomplete — old handlers leak.

### 3.3 OverlayRenderer Class (separate from GuideRunner)

```typescript
class OverlayRenderer {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private highlight: HTMLDivElement | null;
  private tooltip: HTMLDivElement | null;
  private positionFrame: number | null;
  
  showHighlight(element: Element, iframeOffset?: IframeOffset): void {}
  showTooltip(step: GuideStep, index: number, total: number, rect: AdjustedRect): void {}
  hideAll(): void {}
  
  // Position tracking via requestAnimationFrame
  startTracking(element: Element): void {}
  stopTracking(): void {}
  
  // Image modal
  showImageModal(imageUrl: string): void {}
  hideImageModal(): void {}
}
```

### 3.4 Formal State Machine

```typescript
enum GuideState {
  IDLE = 'idle',
  SEARCHING = 'searching',     // ElementWatcher looking for element
  ACTIVE = 'active',           // Element found, highlight shown
  NOT_FOUND = 'notfound',      // Timeout, showing roadblock
  RECOVERING = 'recovering',   // LLM recovery in progress
  ADVANCING = 'advancing',     // User acted, transitioning to next step
  COMPLETED = 'completed',     // All steps done
}

class GuideRunner {
  private state: GuideState = GuideState.IDLE;
  private currentExecutor: StepExecutor | null = null;
  private renderer: OverlayRenderer;
  
  async start(startIndex: number = 0): Promise<void> {
    this.transition(GuideState.IDLE);
    this.renderer = new OverlayRenderer();
    await this.runStep(startIndex);
  }
  
  private async runStep(index: number): Promise<void> {
    // Destroy previous executor completely
    this.currentExecutor?.destroy();
    
    this.transition(GuideState.SEARCHING);
    this.currentExecutor = new StepExecutor(this.steps[index], index, this.renderer);
    
    const result = await this.currentExecutor.start();
    this.currentExecutor.destroy();
    
    if (result === 'completed' || result === 'skipped') {
      if (index + 1 < this.steps.length) {
        this.transition(GuideState.ADVANCING);
        await this.runStep(index + 1);
      } else {
        this.transition(GuideState.COMPLETED);
        this.stop();
      }
    }
  }
  
  private transition(newState: GuideState): void {
    // Validate transition is legal
    // Update state
    // Notify sidepanel
  }
}
```

**Why**: Currently state is spread across 6+ properties (`_pollInterval`, `currentIndex`, `_stepSeq`, `lastStatus`, `_replacing`, `_clickHandler`). Impossible to know "what state is the runner in?" without checking them all. Race conditions happen because there are no transition guards.

---

## Phase 4: SPA Resilience (3-5 days)

### 4.1 MutationObserver for Element Re-renders

When a SPA re-renders the target element (React/Vue virtual DOM reconciliation), the element reference becomes stale (`isConnected === false`). Current code detects this in position tracking but doesn't re-attach click handlers.

Fix:
```typescript
// In StepExecutor, when element is found:
const parentObserver = new MutationObserver(() => {
  if (!element.isConnected) {
    // Element was removed — likely SPA re-render
    // Re-find element
    const newResult = findGuideElement(step);
    if (newResult) {
      // Re-attach click handler to new element
      this.removeClickHandler();
      this.setupClickHandler(newResult.element);
      // Update overlay position
      this.renderer.showHighlight(newResult.element);
    }
  }
});
parentObserver.observe(element.parentElement, { childList: true, subtree: true });
```

### 4.2 Improved Multi-Page Handling

Current `_injectGuideAfterLoad` uses a hardcoded 1500ms delay. Replace with:

```typescript
// In background/guides.ts
export function _injectGuideAfterLoad(tabId: number, guide: any, startIndex: number): void {
  const onCompleted = (details) => {
    if (details.tabId !== tabId || details.frameId !== 0) return;
    chrome.webNavigation.onCompleted.removeListener(onCompleted);
    
    // Wait for DOM to be ready, not a fixed delay
    const checkReady = async (attempts = 0) => {
      if (attempts > 20) return; // 10 seconds max
      try {
        // Ping the tab to see if content script is responsive
        const resp = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        if (resp) {
          await _injectGuideNow(tabId, guide, startIndex);
          return;
        }
      } catch {}
      setTimeout(() => checkReady(attempts + 1), 500);
    };
    checkReady();
  };
  chrome.webNavigation.onCompleted.addListener(onCompleted);
}
```

### 4.3 URL Change Detection Improvements

Add `Navigation API` support (modern browsers) alongside existing popstate/hashchange:

```typescript
// In URLWatcher
if ('navigation' in window) {
  (window as any).navigation.addEventListener('navigate', (e) => {
    // Fires for ALL navigations including pushState
    this._checkUrlChange();
  });
}
```

---

## Phase 5: Self-Healing (3-5 days)

### 5.1 Implement update_workflow_step_selectors

Currently commented out as TODO in `api/app/routers/guide_recovery.py:164-181`.

```python
async def update_workflow_step_selectors(
    workflow_id: str,
    step_index: int,
    new_selectors: list[str],
    db: AsyncSession,
):
    """Persist new selectors back to the workflow recording when LLM recovery succeeds."""
    workflow = await db.get(Workflow, workflow_id)
    if not workflow or not workflow.steps:
        return
    
    step = workflow.steps[step_index]
    if 'element_info' not in step:
        step['element_info'] = {}
    
    # Add new selectors to the selectorTree
    existing = step['element_info'].get('selectorTree', {}).get('selectors', [])
    merged = list(dict.fromkeys(existing + new_selectors))  # deduplicate, preserve order
    
    if 'selectorTree' not in step['element_info']:
        step['element_info']['selectorTree'] = {'selectors': merged, 'parent': None}
    else:
        step['element_info']['selectorTree']['selectors'] = merged
    
    # Also update flat selectorSet for backward compatibility
    step['element_info']['selectorSet'] = merged
    
    workflow.steps[step_index] = step
    await db.commit()
```

### 5.2 Wire into Recovery Response Flow

In `api/app/routers/guide_recovery.py`, after successful LLM recovery:

```python
if result.found and result.new_selectors:
    # Fire-and-forget: update the recording for next time
    asyncio.create_task(
        update_workflow_step_selectors(
            workflow_id=request.workflow_id,
            step_index=request.step_index,
            new_selectors=result.new_selectors,
            db=db,
        )
    )
```

### 5.3 Test Self-Healing

1. Record a workflow on a page
2. Change the page's CSS (break selectors)
3. Replay the workflow
4. Verify: Layer 1 fails → Layer 2 (LLM) finds element → recording updated
5. Replay again: Layer 1 now succeeds (self-healed)

---

## Phase 6: Mode 1 — AI-Guided Teaching (2-4 weeks)

This is the killer differentiator. No implementation exists yet.

### 6.1 Task Planner

New endpoint: `POST /api/v1/guide/plan`

```python
@router.post("/plan")
async def plan_guide(request: PlanRequest):
    """Generate a step-by-step guide from a task description using LLM."""
    
    prompt = f"""You are helping a user navigate a web application.
    Task: "{request.task}"
    Current page URL: {request.current_url}
    
    Generate step-by-step instructions. For each step, provide:
    - instruction: what the user should do
    - action_type: click | type | select | navigate
    - target_text: text of the element to interact with
    - target_role: expected ARIA role (button, link, textbox, etc.)
    - expected_url: URL where this step should occur (if different from current)
    
    Return JSON array of steps."""
    
    steps = await llm.generate(prompt)
    return {"steps": steps, "source": "ai_planned"}
```

### 6.2 Live Element Matching

New endpoint: `POST /api/v1/guide/match-element`

For each planned step, the extension:
1. Extracts current page elements (reuse `_collectInteractiveElements()` from guide-runtime)
2. Sends to backend with the step's target description
3. Backend uses LLM to match: "Which element matches 'Click on API keys in sidebar'?"
4. Returns element index + confidence

### 6.3 Extension Integration

In guide-runtime, add `AIGuideEngine`:

```typescript
class AIGuideEngine {
  async planFromTask(task: string, pageUrl: string): Promise<GuideStep[]> {
    const response = await chrome.runtime.sendMessage({
      type: 'GUIDE_AI_PLAN',
      task,
      currentUrl: pageUrl,
    });
    return response.steps;
  }
  
  async findElementForStep(step: GuideStep, pageElements: any[]): Promise<number | null> {
    const response = await chrome.runtime.sendMessage({
      type: 'GUIDE_AI_MATCH',
      step,
      pageElements,
    });
    return response.found ? response.elementIndex : null;
  }
}
```

### 6.4 Recording Capture During AI-Guided Session

When the user completes an AI-guided step:
1. Capture element info (selectorTree, text, position)
2. Capture screenshot
3. Save as a recorded step
4. After all steps: save as a verified workflow
5. Next time same task is asked → Mode 2 replay (free, instant)

This is the flywheel: AI-guided → recording → replay → no AI needed.

### 6.5 Documentation Fetching Pipeline

Optional enhancement for unknown tasks:

```python
@router.post("/guide/from-docs")
async def guide_from_docs(request: DocsRequest):
    """Fetch documentation URL, extract steps, create guide plan."""
    
    # 1. Fetch the docs page
    content = await fetch_url(request.docs_url)
    
    # 2. Extract steps via LLM
    steps = await llm.extract_steps(content)
    
    # 3. Cache for future use
    await cache_guide_plan(request.docs_url, steps)
    
    return {"steps": steps, "source": "documentation"}
```

---

## Phase 7: Polish & Extras

### 7.1 Page-Context Grouping in Side Panel

Tango groups steps by the page/URL they occur on, showing page headers (with globe icon) between step groups.

```typescript
// Group steps by URL
const stepGroups = groupBy(guide.steps, step => {
  try { return new URL(step.expected_url || step.url || '').hostname; }
  catch { return 'unknown'; }
});

// Render with page headers between groups
{Object.entries(stepGroups).map(([hostname, steps]) => (
  <>
    <div className="guide-page-header">
      <span className="guide-page-icon">🌐</span>
      <span className="guide-page-url">{hostname}</span>
    </div>
    {steps.map(step => <GuideStepItem ... />)}
  </>
))}
```

### 7.2 Knowledge Base Search

Enable searching existing recordings before invoking AI:

```python
@router.get("/guide/search")
async def search_guides(query: str, project_id: str):
    """Search existing workflows/recordings that match the task."""
    # Full-text search on workflow titles, descriptions, step text
    # Return ranked results
    # If found: skip AI, go straight to replay
```

### 7.3 Cross-Origin Iframe Full Support

Current implementation discards cross-origin results. Fix:
- Use `chrome.scripting.executeScript` to inject guide-runtime into cross-origin frames
- Communicate via `chrome.runtime.sendMessage` instead of `window.postMessage`
- Render highlight in the frame's own overlay (can't render cross-origin from top frame)

### 7.4 Manifest Updates for Better Iframe Support

```json
{
  "content_scripts": [{
    "all_frames": true,
    "match_about_blank": true,
    "match_origin_as_fallback": true,
    "matches": ["<all_urls>"]
  }]
}
```

### 7.5 Light/Dark Theme Toggle

Detect page theme and switch overlay styling:
```typescript
const isDarkPage = window.matchMedia('(prefers-color-scheme: dark)').matches ||
  getComputedStyle(document.body).backgroundColor // check luminance
```

---

## Tango Techniques Reference

From reverse engineering Tango v8.6.6:

1. **Backdrop blur**: `backdrop-filter: blur(4px)` — if you add back a subtle backdrop
2. **Multi-layer shadows**: `0 0 0 1px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.08), 0 8px 26px rgba(0,0,0,0.12)`
3. **Double-RAF for layout stability**: `requestAnimationFrame(() => { requestAnimationFrame(() => { /* safe to measure */ }); });`
4. **visualViewport API for zoom**: `(window.visualViewport?.scale ?? 1) * window.devicePixelRatio`
5. **Fixed header detection**: Scan for `position: fixed/sticky` elements, calculate total offset
6. **300ms pre-click delay**: Let page settle before executing click actions
7. **Capture-phase event listeners**: `addEventListener(type, handler, true)`
8. **Inert attribute protection**: MutationObserver removes `inert` from overlay when modals try to hide it
9. **Lazy-load recorders**: `const { DomRecorder } = await import('./dom-recorder');`
10. **Event merging**: Merge rapid sequential events on nearby elements (up to 6)

---

## Files Reference

| File | Purpose |
|------|---------|
| `extension/src/guide-runtime/index.ts` | In-page overlay + element finding + step execution (2300+ lines, needs rewrite) |
| `extension/src/guide-runtime/index.rewrite-v2.ts.bak` | Abandoned event-driven rewrite attempt |
| `extension/src/background/guides.ts` | Guide injection into tabs |
| `extension/src/background/index.ts` | Message routing, guide state management |
| `extension/src/sidepanel/components/GuideStepsPanel.tsx` | Side panel step list UI |
| `extension/src/sidepanel/sidepanel.css` | Side panel styling |
| `extension/src/content/elements.ts` | Element capture (SelectorTree, selectorSet generation) |
| `api/app/routers/guide_recovery.py` | LLM element recovery endpoint |
| `api/app/services/element_recovery.py` | LLM recovery service logic |
| `packages/stept-engine/stept/dom.py` | DOM extraction for LLM (headless, not used by extension) |
| `packages/stept-engine/stept/agent.py` | Headless browser-use agent (not the extension teaching flow) |
| `packages/stept-engine/stept/prompts.py` | LLM system prompts |

---

## Analysis Reports

Full analysis reports from sub-agents saved at:
- `/tmp/stept-gap-analysis.md` — Vision vs Reality gap analysis
- `/tmp/tango-analysis.md` — Tango reverse engineering report
