# Stept Engine — Technical Implementation Spec

## browser-use Codebase Map (62K lines)

### What they have vs what you need

```
browser_use/                   YOU NEED?  WHY
├── agent/
│   ├── service.py (4091)      REWRITE    Their agent loop. You replace with recording-first loop.
│   ├── prompts.py (584)       STUDY      System prompts. Study patterns, write your own.
│   ├── views.py (1009)        ADAPT      Data models (AgentOutput, ActionResult). Simplify.
│   ├── message_manager/ (800) SKIP       LLM conversation management. Overkill for v1.
│   ├── judge.py (150)         LATER      Post-step validation. Add in v2.
│   └── gif.py (120)           SKIP       Demo GIF creation. Nice-to-have later.
│
├── dom/
│   ├── service.py (1153)      STUDY      CDP-based DOM extraction. Complex but battle-tested.
│   ├── serializer/
│   │   ├── serializer.py(1290)STUDY+SLIM Their DOM-to-LLM text. You need ~500 lines of this.
│   │   ├── clickable_elements.py(246) STUDY  Element detection heuristics. Gold.
│   │   └── paint_order.py     SKIP       Visual overlap detection. v2.
│   ├── views.py (1041)        ADAPT      DOM node types. Simplify to what you need.
│   └── enhanced_snapshot.py   SKIP       CDP snapshot enrichment. Complex, v2.
│
├── browser/
│   ├── session.py (3969)      BUILD OWN  Playwright browser management. You need ~300 lines.
│   ├── watchdogs/
│   │   ├── default_action_watchdog.py (3690)  STUDY  Click/type/scroll execution
│   │   ├── dom_watchdog.py (861)   SKIP    CDP DOM monitoring
│   │   ├── downloads_watchdog.py   SKIP    File download handling
│   │   └── har_recording_watchdog.py SKIP  Network recording
│   ├── profile.py (1237)      SKIP       Browser fingerprinting. Cloud feature.
│   ├── session_manager.py     SKIP       Multi-session management. v2.
│   ├── demo_mode.py (922)     SKIP       Visual demo mode. Nice-to-have.
│   └── cloud/                 SKIP       Cloud browser integration.
│
├── actor/
│   ├── element.py (1175)      STUDY      Element interaction (click, type, scroll).
│   ├── mouse.py (240)         STUDY      Coordinate-based clicking. Useful for vision models.
│   └── page.py (700)          STUDY      Page-level actions (navigate, extract).
│
├── tools/
│   ├── service.py (2160)      SLIM DOWN  Action definitions. You need ~800 lines.
│   ├── views.py (181)         ADAPT      Action parameter schemas.
│   └── registry/ (400)        SKIP       Custom action plugin system. v2.
│
├── llm/ (9144 total)          SKIP ALL   13 LLM providers. You have llm_service already.
├── mcp/ (1275)                SKIP       MCP server. You have yours.
├── cli.py (2362)              BUILD OWN  CLI. You need your own with recording commands.
├── filesystem/ (941)          SKIP       File management for agent.
├── skills/ (500)              SKIP       Plugin system. v2.
├── telemetry/ (400)           SKIP       Usage tracking.
└── tokens/ (300)              SKIP       Token counting.
```

### Lines of their code worth studying deeply: ~8,000
### Lines you actually write: ~3,000-4,000
### Lines of theirs you skip entirely: ~54,000

---

## Your Architecture (recording-first)

```
stept-engine/                  # New Python package: pip install stept
├── __init__.py                # Public API: Agent, ReplayEngine
├── agent.py                   # ~600 lines — Recording-first agent loop
├── replay.py                  # ~400 lines — Deterministic replay from recordings
├── finder.py                  # ~300 lines — 6-level element finder (port from your TS)
├── dom.py                     # ~400 lines — DOM extraction + serialization for LLM
├── actions.py                 # ~500 lines — Playwright action execution
├── capture.py                 # ~300 lines — Capture agent run as recording
├── router.py                  # ~200 lines — Decide: replay vs agent vs hybrid
├── prompts.py                 # ~200 lines — System prompts (yours, not theirs)
├── models.py                  # ~300 lines — Data types (Step, Recording, Action, etc.)
├── storage/
│   ├── local.py               # ~150 lines — JSON files in ~/.stept/
│   └── remote.py              # ~150 lines — Stept platform API client
├── browser.py                 # ~300 lines — Playwright browser management
└── cli.py                     # ~400 lines — stept run / stept replay / stept agent
                               # ≈ 4,200 lines total
```

---

## Component-by-Component Implementation

### 1. `models.py` — Data Types

```python
from pydantic import BaseModel
from typing import Optional
from enum import Enum

class ActionType(str, Enum):
    CLICK = "click"
    TYPE = "type"
    SELECT = "select"
    NAVIGATE = "navigate"
    SCROLL = "scroll"
    WAIT = "wait"
    DONE = "done"

class ElementInfo(BaseModel):
    """Rich element data — same schema as your Chrome extension captures."""
    index: Optional[int] = None           # Index on current page (for agent mode)
    selector: Optional[str] = None         # CSS selector
    testId: Optional[str] = None           # data-testid
    tagName: Optional[str] = None
    text: Optional[str] = None
    ariaLabel: Optional[str] = None
    role: Optional[str] = None
    id: Optional[str] = None
    className: Optional[str] = None
    type: Optional[str] = None             # input type
    placeholder: Optional[str] = None
    href: Optional[str] = None
    rect: Optional[dict] = None            # {x, y, w, h}
    parentText: Optional[str] = None       # context from parent elements

class StepAction(BaseModel):
    """A single action to perform."""
    action: ActionType
    element: Optional[ElementInfo] = None
    value: Optional[str] = None            # text to type, URL to navigate to
    description: Optional[str] = None      # human-readable description

class StepResult(BaseModel):
    """Result of executing a step."""
    success: bool
    action: StepAction
    url_before: str
    url_after: str
    screenshot_path: Optional[str] = None
    element_found_by: Optional[str] = None  # "selector", "testid", "role", "llm_recovery"
    error: Optional[str] = None
    duration_ms: int = 0
    llm_cost: float = 0.0                   # $ spent on LLM for this step

class Recording(BaseModel):
    """A recorded workflow — can come from Chrome extension, desktop app, or agent run."""
    id: str
    name: str
    url_pattern: Optional[str] = None       # e.g., "*.salesforce.com*"
    steps: list[StepAction]
    source: str = "manual"                  # "manual" | "agent" | "imported"
    success_count: int = 0
    fail_count: int = 0
    last_run_at: Optional[str] = None

class RunMode(str, Enum):
    REPLAY = "replay"     # Full recording exists
    AGENT = "agent"       # No recording, explore
    HYBRID = "hybrid"     # Partial recording + agent for gaps

class RunResult(BaseModel):
    mode: RunMode
    success: bool
    steps: list[StepResult]
    total_time_ms: int
    total_llm_cost: float
    recording_id: Optional[str] = None      # If saved as recording
    recording_reuse_rate: float = 0.0       # % of steps from recording vs LLM
```

### 2. `finder.py` — Element Finder (port from your guide-runtime)

Port your 6-level cascade from `extension/src/guide-runtime/index.ts` to Playwright Python.

```python
from playwright.async_api import Page, Locator
from .models import ElementInfo
import logging

logger = logging.getLogger(__name__)

class FindResult:
    def __init__(self, locator: Locator, confidence: float, method: str):
        self.locator = locator
        self.confidence = confidence
        self.method = method

async def find_element(page: Page, target: ElementInfo) -> FindResult | None:
    """
    6-level element finder. Same cascade as guide-runtime/index.ts.
    Returns best match or None.
    """
    # Level 1: CSS selector (confidence 1.0)
    if target.selector:
        try:
            loc = page.locator(target.selector)
            if await loc.count() == 1 and await _is_visible(loc):
                return FindResult(loc, 1.0, "selector")
        except Exception:
            pass

    # Level 2: data-testid (confidence 0.95)
    if target.testId:
        loc = page.locator(f'[data-testid="{target.testId}"]')
        if await loc.count() == 1 and await _is_visible(loc):
            return FindResult(loc, 0.95, "testid")

    # Level 3: ARIA role + name (confidence 0.85)
    if target.role and (target.text or target.ariaLabel):
        name = target.ariaLabel or target.text
        try:
            loc = page.get_by_role(target.role, name=name, exact=False)
            if await loc.count() >= 1:
                loc = loc.first
                if await _is_visible(loc):
                    return FindResult(loc, 0.85, "role+name")
        except Exception:
            pass

    # Level 4: tag + text (confidence 0.70)
    if target.tagName and target.text:
        text_short = target.text[:50]  # Avoid overly long text matches
        try:
            loc = page.locator(f'{target.tagName}:has-text("{text_short}")')
            if await loc.count() >= 1:
                loc = loc.first
                if await _is_visible(loc):
                    return FindResult(loc, 0.70, "tag+text")
        except Exception:
            pass

    # Level 5: ID (confidence 0.65)
    if target.id:
        loc = page.locator(f'#{target.id}')
        if await loc.count() == 1 and await _is_visible(loc):
            return FindResult(loc, 0.65, "id")

    # Level 6: Placeholder/label text (confidence 0.50)
    if target.placeholder:
        loc = page.get_by_placeholder(target.placeholder, exact=False)
        if await loc.count() >= 1:
            loc = loc.first
            if await _is_visible(loc):
                return FindResult(loc, 0.50, "placeholder")
    
    if target.ariaLabel:
        loc = page.get_by_label(target.ariaLabel, exact=False)
        if await loc.count() >= 1:
            loc = loc.first
            if await _is_visible(loc):
                return FindResult(loc, 0.50, "label")

    return None

async def _is_visible(locator: Locator) -> bool:
    try:
        return await locator.is_visible(timeout=2000)
    except Exception:
        return False
```

### 3. `dom.py` — DOM Extraction for LLM

This is where browser-use spent the most effort. You DON'T need their full CDP approach for v1.
Use JS injection via Playwright — simpler, fewer dependencies, works for 90% of sites.

```python
async def get_interactive_elements(page: Page) -> list[dict]:
    """Extract all interactive elements from the page via JS injection."""
    return await page.evaluate("""() => {
        const INTERACTIVE = 'a, button, input, select, textarea, ' +
            '[role="button"], [role="link"], [role="textbox"], [role="combobox"], ' +
            '[role="checkbox"], [role="radio"], [role="tab"], [role="menuitem"], ' +
            '[onclick], [tabindex]:not([tabindex="-1"])';
        
        const elements = [];
        const seen = new Set();
        
        document.querySelectorAll(INTERACTIVE).forEach((el, i) => {
            // Skip invisible elements
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            if (rect.width === 0 || rect.height === 0) return;
            if (style.display === 'none' || style.visibility === 'hidden') return;
            if (parseFloat(style.opacity) === 0) return;
            
            // Skip duplicates (same position + text)
            const key = `${Math.round(rect.x)},${Math.round(rect.y)},${el.textContent?.trim().slice(0,20)}`;
            if (seen.has(key)) return;
            seen.add(key);
            
            elements.push({
                index: elements.length,
                tag: el.tagName.toLowerCase(),
                text: (el.textContent || '').trim().slice(0, 100),
                role: el.getAttribute('role'),
                ariaLabel: el.getAttribute('aria-label'),
                type: el.getAttribute('type'),
                name: el.getAttribute('name'),
                placeholder: el.getAttribute('placeholder'),
                id: el.id || null,
                testId: el.getAttribute('data-testid'),
                href: el.tagName === 'A' ? el.href : null,
                value: el.value || null,
                checked: el.checked !== undefined ? el.checked : null,
                disabled: el.disabled || false,
                rect: {
                    x: Math.round(rect.x),
                    y: Math.round(rect.y),
                    w: Math.round(rect.width),
                    h: Math.round(rect.height)
                },
                // Parent context for disambiguation
                parentText: el.parentElement?.textContent?.trim().slice(0, 60) || null,
                // CSS selector for later replay
                selector: _getSelector(el)
            });
        });
        
        return elements;
        
        function _getSelector(el) {
            if (el.id) return '#' + CSS.escape(el.id);
            if (el.getAttribute('data-testid')) 
                return '[data-testid="' + el.getAttribute('data-testid') + '"]';
            
            // Build a reasonable selector
            let path = el.tagName.toLowerCase();
            if (el.className && typeof el.className === 'string') {
                const cls = el.className.trim().split(/\\s+/).slice(0, 2);
                if (cls.length) path += '.' + cls.map(c => CSS.escape(c)).join('.');
            }
            
            // Add nth-child if not unique
            const parent = el.parentElement;
            if (parent) {
                const siblings = parent.querySelectorAll(':scope > ' + el.tagName.toLowerCase());
                if (siblings.length > 1) {
                    const idx = Array.from(siblings).indexOf(el);
                    path += ':nth-child(' + (idx + 1) + ')';
                }
            }
            
            return path;
        }
    }""")


def serialize_elements_for_llm(elements: list[dict], max_length: int = 30000) -> str:
    """Convert elements to text format the LLM can reason about."""
    lines = []
    for el in elements:
        parts = [f'[{el["index"]}]']
        parts.append(f'<{el["tag"]}>')
        
        if el.get("role"):
            parts.append(f'role="{el["role"]}"')
        if el.get("text"):
            text = el["text"][:60]
            parts.append(f'"{text}"')
        if el.get("ariaLabel"):
            parts.append(f'aria-label="{el["ariaLabel"]}"')
        if el.get("placeholder"):
            parts.append(f'placeholder="{el["placeholder"]}"')
        if el.get("type"):
            parts.append(f'type={el["type"]}')
        if el.get("href"):
            parts.append(f'href="{el["href"][:80]}"')
        if el.get("value"):
            parts.append(f'value="{el["value"][:40]}"')
        if el.get("disabled"):
            parts.append("(disabled)")
        
        line = " ".join(parts)
        lines.append(line)
        
        if sum(len(l) for l in lines) > max_length:
            lines.append(f"... ({len(elements) - len(lines)} more elements)")
            break
    
    return "\n".join(lines)
```

### 4. `actions.py` — Action Execution

Study `browser_use/tools/service.py` and `browser_use/browser/watchdogs/default_action_watchdog.py`
for edge cases, but write your own clean implementation:

```python
async def execute_action(page: Page, action: StepAction, elements: list[dict]) -> StepResult:
    """Execute a single action on the page."""
    url_before = page.url
    start = time.time()
    
    try:
        if action.action == ActionType.CLICK:
            await _execute_click(page, action, elements)
        elif action.action == ActionType.TYPE:
            await _execute_type(page, action, elements)
        elif action.action == ActionType.NAVIGATE:
            await page.goto(action.value, wait_until="domcontentloaded", timeout=30000)
        elif action.action == ActionType.SCROLL:
            direction = action.value or "down"
            delta = 500 if direction == "down" else -500
            await page.mouse.wheel(0, delta)
            await page.wait_for_timeout(500)
        elif action.action == ActionType.SELECT:
            await _execute_select(page, action, elements)
        elif action.action == ActionType.WAIT:
            await page.wait_for_timeout(int(action.value or 1000))
        
        return StepResult(
            success=True, action=action,
            url_before=url_before, url_after=page.url,
            duration_ms=int((time.time() - start) * 1000)
        )
    except Exception as e:
        return StepResult(
            success=False, action=action,
            url_before=url_before, url_after=page.url,
            error=str(e), duration_ms=int((time.time() - start) * 1000)
        )

async def _execute_click(page: Page, action: StepAction, elements: list[dict]):
    """Click with multiple strategies."""
    el = action.element
    if not el:
        raise ValueError("Click action requires element info")
    
    # Strategy 1: Use finder cascade (for replay mode)
    from .finder import find_element
    result = await find_element(page, el)
    if result:
        await result.locator.click(timeout=5000)
        return
    
    # Strategy 2: Use index from DOM extraction (for agent mode)
    if el.index is not None and elements:
        target = elements[el.index]
        if target.get("selector"):
            await page.locator(target["selector"]).click(timeout=5000)
            return
        # Fallback: click by coordinates
        rect = target.get("rect", {})
        if rect:
            x = rect["x"] + rect["w"] // 2
            y = rect["y"] + rect["h"] // 2
            await page.mouse.click(x, y)
            return
    
    raise ValueError(f"Could not find element to click: {el}")

async def _execute_type(page: Page, action: StepAction, elements: list[dict]):
    """Type text into an element."""
    # Same finder logic as click
    el = action.element
    from .finder import find_element
    result = await find_element(page, el)
    if result:
        await result.locator.fill(action.value or "")
        return
    
    if el and el.index is not None and elements:
        target = elements[el.index]
        if target.get("selector"):
            await page.locator(target["selector"]).fill(action.value or "")
            return
    
    raise ValueError(f"Could not find element to type into: {el}")
```

### 5. `agent.py` — The Recording-First Agent Loop

THIS is where you differ from browser-use fundamentally.

```python
class SteptAgent:
    """
    Recording-first browser automation agent.
    
    Mode 1 (replay): Follow recording steps using selector cascade. 
                     Near-instant, zero LLM cost.
    Mode 2 (agent):  LLM explores like browser-use. Captures run as recording.
    Mode 3 (hybrid): Follow recording where possible, LLM for gaps.
    """
    
    def __init__(
        self,
        task: str,
        llm = None,              # Any LLM (OpenAI, Anthropic, Ollama, etc.)
        url: str | None = None,
        headless: bool = True,
        recordings_path: str | None = None,  # Local storage path
        server_url: str | None = None,       # Optional stept platform
        max_steps: int = 30,
    ):
        self.task = task
        self.llm = llm
        self.url = url
        self.headless = headless
        self.max_steps = max_steps
        self.storage = LocalStorage(recordings_path) if not server_url else RemoteStorage(server_url)
    
    async def run(self) -> RunResult:
        """Main entry point. Auto-selects mode based on available recordings."""
        # 1. Route: find matching recording
        plan = await self.router.route(self.task, self.url)
        
        async with self._launch_browser() as page:
            # 2. Navigate to starting URL
            if self.url:
                await page.goto(self.url, wait_until="domcontentloaded")
            
            # 3. Execute based on mode
            if plan.mode == RunMode.REPLAY:
                result = await self._run_replay(page, plan.recording)
            elif plan.mode == RunMode.HYBRID:
                result = await self._run_hybrid(page, plan.recording)
            else:
                result = await self._run_agent(page, plan.context)
            
            # 4. On success: save/update recording
            if result.success:
                recording_id = await self._save_run_as_recording(result)
                result.recording_id = recording_id
            
            return result
    
    async def _run_replay(self, page: Page, recording: Recording) -> RunResult:
        """Mode 1: Deterministic replay from recording."""
        steps_results = []
        
        for step in recording.steps:
            # Navigate if URL changed
            if step.element and step.element.href and step.action == ActionType.NAVIGATE:
                await page.goto(step.value, wait_until="domcontentloaded")
            
            # Find element using selector cascade
            from .finder import find_element
            found = await find_element(page, step.element)
            
            if found:
                # Execute from recording — NO LLM CALL
                result = await execute_action(page, step, [])
                result.element_found_by = found.method
                steps_results.append(result)
            else:
                # Element not found — LLM recovery
                if self.llm:
                    recovery_result = await self._llm_recovery(page, step)
                    steps_results.append(recovery_result)
                else:
                    steps_results.append(StepResult(
                        success=False, action=step,
                        url_before=page.url, url_after=page.url,
                        error=f"Element not found and no LLM configured for recovery"
                    ))
                    break
            
            await page.wait_for_timeout(300)  # Brief pause between steps
        
        return RunResult(
            mode=RunMode.REPLAY,
            success=all(s.success for s in steps_results),
            steps=steps_results,
            total_time_ms=sum(s.duration_ms for s in steps_results),
            total_llm_cost=sum(s.llm_cost for s in steps_results),
            recording_reuse_rate=len([s for s in steps_results if s.llm_cost == 0]) / max(len(steps_results), 1)
        )
    
    async def _run_agent(self, page: Page, context: dict | None) -> RunResult:
        """Mode 2: LLM agent explores from scratch."""
        if not self.llm:
            raise ValueError("Agent mode requires an LLM. Pass llm= parameter.")
        
        steps_results = []
        
        for step_num in range(self.max_steps):
            # 1. Get page state
            elements = await get_interactive_elements(page)
            elements_text = serialize_elements_for_llm(elements)
            screenshot_b64 = base64.b64encode(await page.screenshot()).decode()
            
            # 2. Build prompt (with recording context if available!)
            prompt = self._build_agent_prompt(
                elements_text=elements_text,
                steps_so_far=steps_results,
                context=context,   # <-- YOUR ADVANTAGE: recordings as context
            )
            
            # 3. Get LLM decision
            action, cost = await self._get_llm_decision(prompt, screenshot_b64)
            
            # 4. Check if done
            if action.action == ActionType.DONE:
                steps_results.append(StepResult(
                    success=True, action=action,
                    url_before=page.url, url_after=page.url,
                    llm_cost=cost
                ))
                break
            
            # 5. Execute action
            result = await execute_action(page, action, elements)
            result.llm_cost = cost
            
            # 6. Capture element info for recording
            # (The element the LLM chose — save its selector for future replay)
            if action.element and action.element.index is not None:
                target_el = elements[action.element.index]
                action.element.selector = target_el.get("selector")
                action.element.testId = target_el.get("testId")
                action.element.id = target_el.get("id")
            
            steps_results.append(result)
            await page.wait_for_timeout(500)
        
        all_success = all(s.success for s in steps_results) and any(
            s.action.action == ActionType.DONE for s in steps_results
        )
        
        return RunResult(
            mode=RunMode.AGENT,
            success=all_success,
            steps=steps_results,
            total_time_ms=sum(s.duration_ms for s in steps_results),
            total_llm_cost=sum(s.llm_cost for s in steps_results),
            recording_reuse_rate=0.0  # Pure agent, no recording reuse
        )
    
    async def _run_hybrid(self, page: Page, recording: Recording) -> RunResult:
        """Mode 3: Follow recording, switch to agent when stuck."""
        # Try replay first
        replay_result = await self._run_replay(page, recording)
        
        if replay_result.success:
            return replay_result
        
        # Find where replay failed
        failed_step_idx = next(
            (i for i, s in enumerate(replay_result.steps) if not s.success),
            len(replay_result.steps)
        )
        
        # Continue from failure point with agent
        remaining_task = f"""
        I was following a recorded workflow: "{recording.name}"
        I completed {failed_step_idx} of {len(recording.steps)} steps successfully.
        The remaining steps should be:
        {self._format_remaining_steps(recording.steps[failed_step_idx:])}
        Continue from where I left off.
        """
        
        agent_result = await self._run_agent(page, {"remaining_task": remaining_task})
        
        # Combine results
        combined_steps = replay_result.steps[:failed_step_idx] + agent_result.steps
        return RunResult(
            mode=RunMode.HYBRID,
            success=agent_result.success,
            steps=combined_steps,
            total_time_ms=sum(s.duration_ms for s in combined_steps),
            total_llm_cost=sum(s.llm_cost for s in combined_steps),
            recording_reuse_rate=failed_step_idx / max(len(combined_steps), 1)
        )
```

### 6. `cli.py` — The User Interface

```
stept run "Create a new Salesforce opportunity"  # Auto-picks mode
stept replay abc123                               # Replay recording by ID
stept agent "Search for flights" --url https://google.com/travel
stept recordings list                             # Show all recordings
stept recordings export abc123 --format playwright # Export as Playwright test
stept bench --task "Add to cart on Amazon" --runs 10  # Benchmark
```

### 7. `capture.py` — Save Agent Runs as Recordings

```python
async def save_run_as_recording(result: RunResult, task: str, storage) -> str:
    """Convert a successful agent run into a reusable recording."""
    steps = []
    for step_result in result.steps:
        if step_result.action.action == ActionType.DONE:
            continue
        steps.append(step_result.action)
    
    recording = Recording(
        id=generate_id(),
        name=task,
        url_pattern=_derive_url_pattern(result.steps[0].url_before) if result.steps else None,
        steps=steps,
        source="agent",
        success_count=1,
    )
    
    await storage.save_recording(recording)
    return recording.id
```

---

## What You Study From browser-use (knowledge, not code)

### From `default_action_watchdog.py` (3690 lines):
- How they handle autocomplete/combobox fields (type → wait → select from dropdown)
- How they detect SPAs that haven't finished rendering (wait strategies)
- How they handle file upload inputs (real file path vs fake wrapper)
- Cookie consent banner auto-dismissal patterns
- How they deal with elements that disappear after click (modals, overlays)

### From `dom/serializer/serializer.py` (1290 lines):
- How they filter out non-interactive elements
- Paint order handling (element X visually covers element Y)
- Bounding box containment filtering (child inside parent)
- How they serialize compound elements (date pickers, sliders)
- SVG and form element special handling

### From `dom/serializer/clickable_elements.py` (246 lines):
- JS click listener detection heuristic
- Label-as-wrapper pattern (label > span > input)
- Search element detection by class/id patterns
- ARIA property checks for disabled/hidden state

### From `agent/prompts.py` (584 lines):
- Their system prompt structure
- How they present DOM state to the LLM
- Page statistics they include (links count, interactive count, scroll position)
- How they handle PDF viewers, empty pages, skeleton screens
- Their action schema format

### From `actor/element.py` (1175 lines):
- Coordinate clicking implementation
- Scroll-into-view before click
- How they handle elements inside iframes
- Triple-click for text selection
- Focus management for input fields

---

## Edge Cases to Handle (learned from their bug reports / code)

1. **SPA wait**: After navigation, wait for DOM stability (mutation observer or fixed 2s wait)
2. **Autocomplete**: Type text → wait 500ms → check for dropdown → select option
3. **Cookie banners**: Check for common selectors (#onetrust-accept, .cookie-accept, etc.)
4. **Shadow DOM**: For v1, skip. Add later via CDP.
5. **iframes**: page.frames() + recursive element search. Add in v2.
6. **File uploads**: Detect input[type=file] and use set_input_files()
7. **Dropdowns**: Detect select vs custom dropdown (div with options)
8. **New tabs**: Handle via page.context.on("page") event
9. **Alerts/confirms**: Auto-dismiss via page.on("dialog")
10. **Loading states**: Wait for network idle or specific element appearance

---

## SDK Public API

```python
# Minimal usage (no server, local storage)
from stept import Agent

agent = Agent(task="Create opportunity in Salesforce")
result = await agent.run()
print(f"Mode: {result.mode}, Cost: ${result.total_llm_cost:.2f}, Time: {result.total_time_ms}ms")

# With recordings server
from stept import Agent

agent = Agent(
    task="Create opportunity in Salesforce",
    server_url="https://stept.mycompany.com",
    api_key="sk-..."
)
result = await agent.run()  # Checks server for recordings first

# Export as Playwright test
from stept import export_playwright

export_playwright(recording_id="abc123", output="test_salesforce.py")

# Use as library in another agent
from stept import find_recording, replay

recording = await find_recording("Create Salesforce opportunity")
if recording:
    result = await replay(recording, browser=my_playwright_page)
```
