# Stept Agent Engine — Detailed Implementation Plan

## Vision

"Give the AI a task. It checks if it already knows how. If yes: instant replay. If no: it figures it out, then remembers for next time."

The only browser automation tool that gets smarter every time it runs.

---

## Architecture Overview

```
User: "Create a new opportunity in Salesforce"
        │
        ▼
┌─────────────────────────────────────┐
│          TASK ROUTER                │
│                                     │
│  1. Search recordings DB            │
│     - URL patterns (*.salesforce.*)  │
│     - Semantic search on task text  │
│     - Public workflow repository    │
│                                     │
│  2. Match found?                    │
│     YES ──► REPLAY ENGINE (Mode 1)  │
│     PARTIAL ──► HYBRID (Mode 3)     │
│     NO ──► AGENT ENGINE (Mode 2)    │
└─────────────────────────────────────┘

Mode 1: REPLAY (has full recording)
  Recording steps → selector cascade → Playwright actions
  Speed: 1-5 seconds | Cost: $0.00 | Reliability: 99%+

Mode 2: AGENT (no recording, explore from scratch)
  Screenshot + DOM → LLM reasoning → Playwright action → repeat
  Speed: 30-120 seconds | Cost: $0.10-2.00 | Reliability: 70-85%
  *** Captures run as new recording when successful ***

Mode 3: HYBRID (partial knowledge)
  Follow recording where it matches → agent for divergent steps
  Speed: 5-30 seconds | Cost: $0.01-0.50 | Reliability: 90%+
  *** Updates recording with new/changed steps ***
```

---

## Component Breakdown

### Component 1: Task Router (`api/app/services/agent/router.py`)

The brain that decides which mode to use.

```python
class TaskRouter:
    async def route(self, task: str, target_url: str | None, project_id: str | None) -> TaskPlan:
        """
        1. Search context links for URL pattern matches
        2. Semantic search across workflows for task description match
        3. Search public workflow repository
        4. Score matches by relevance + recency + reliability
        5. Return: full_recording | partial_recording | no_match
        """
```

**Match scoring:**
- URL pattern match (context links): weight 0.8
- Semantic similarity to workflow name/summary: weight 0.6
- Step count overlap (target URL appears in step URLs): weight 0.4
- Recency boost (recently successful runs rank higher): weight 0.2
- Reliability score (success rate of past replays): weight 0.3

**Output:** `TaskPlan` with:
- `mode`: "replay" | "agent" | "hybrid"
- `recording_id`: if replay/hybrid
- `recording_steps`: ordered step data
- `divergence_point`: step number where hybrid should switch to agent
- `context`: any partial knowledge (URL patterns, element patterns, nav structure)

### Component 2: Replay Engine (`api/app/services/agent/replay.py`)

Deterministic execution from recordings. This is your UNFAIR ADVANTAGE.

```python
class ReplayEngine:
    async def execute(self, plan: TaskPlan, browser: PlaywrightBrowser) -> ReplayResult:
        """
        For each step in recording:
        1. Navigate to step URL if different from current
        2. Find target element using 6-level cascade:
           a. CSS selector (confidence 1.0)
           b. data-testid (0.95)
           c. ARIA role + text (0.85)
           d. tag + text (0.70)
           e. XPath (0.60)
           f. Parent chain context (0.50)
        3. If found (confidence > threshold): execute action
        4. If NOT found: enter recovery mode
           - Take screenshot
           - Send to LLM: "Looking for [element_info]. Page has changed."
           - LLM suggests new selector
           - Execute with new selector
           - UPDATE recording with new selector (self-healing)
        5. Verify step completed (check URL change, element state)
        """
```

**Element finder (port from extension guide-runtime):**
Already built in TypeScript at `extension/src/guide-runtime/index.ts`. Port the core logic to Python using Playwright's locator API:

```python
async def find_element(page: Page, step: StepData) -> ElementHandle | None:
    # Level 1: CSS selector
    if step.selector:
        try:
            el = page.locator(step.selector)
            if await el.count() == 1 and await el.is_visible():
                return el
        except: pass

    # Level 2: data-testid
    ei = step.element_info or {}
    if ei.get("testId"):
        el = page.locator(f'[data-testid="{ei["testId"]}"]')
        if await el.count() == 1:
            return el

    # Level 3: ARIA role + text
    if ei.get("role") and ei.get("text"):
        el = page.get_by_role(ei["role"], name=ei["text"])
        if await el.count() == 1:
            return el

    # Level 4: tag + text
    if ei.get("tagName") and ei.get("text"):
        el = page.locator(f'{ei["tagName"]}:has-text("{ei["text"]}")')
        if await el.count() == 1:
            return el

    # Level 5: Explicit XPath (if stored)
    # Level 6: Parent chain context matching

    return None  # Triggers recovery mode
```

**Self-healing flow:**
```python
async def recover_element(page: Page, step: StepData) -> ElementHandle | None:
    """LLM-assisted element recovery when selectors fail."""
    screenshot = await page.screenshot(type="png")
    
    # Get all interactive elements on current page
    elements = await self._get_interactive_elements(page)
    
    prompt = f"""
    I'm trying to find an element on this page.
    
    What I'm looking for:
    - Tag: {step.element_info.get('tagName')}
    - Text: {step.element_info.get('text')}
    - ARIA label: {step.element_info.get('ariaLabel')}
    - Role: {step.element_info.get('role')}
    - Previous CSS selector: {step.selector}
    - Action to perform: {step.action_type}
    
    Available interactive elements on the page:
    {self._format_elements_for_llm(elements)}
    
    Which element index matches what I'm looking for?
    Return ONLY the index number, or -1 if not found.
    """
    
    # One cheap LLM call — not a full agent loop
    response = await llm_service.chat_completion(messages=[...], ...)
    index = int(response)
    
    if index >= 0:
        element = elements[index]
        # Update the recording with new selector (self-healing!)
        await self._update_step_selector(step.id, element.selector)
        return element
    
    return None
```

### Component 3: Agent Engine (`api/app/services/agent/engine.py`)

For when there's no recording. Build your own — don't use browser-use.

**What browser-use does per step (that you need to replicate):**
1. Get DOM state via CDP (Chrome DevTools Protocol)
2. Detect interactive elements
3. Serialize DOM to text for LLM
4. Take screenshot
5. Send to LLM: "Here's the page. Here's the task. What do you do?"
6. Parse LLM response into an action
7. Execute action via Playwright
8. Validate result

**Your implementation — same loop but with stept's advantages:**

```python
class AgentEngine:
    async def execute(self, task: str, context: AgentContext, browser: PlaywrightBrowser) -> AgentResult:
        """
        Main agent loop. Same as browser-use but with:
        - Recording knowledge injected into prompts
        - Captured steps saved as recording on success
        - Partial recordings used for early steps
        """
        page = browser.current_page
        steps_taken = []
        
        for step_num in range(self.max_steps):
            # 1. Get page state
            state = await self._get_page_state(page)
            
            # 2. Build LLM prompt with context
            prompt = self._build_prompt(
                task=task,
                page_state=state,
                steps_taken=steps_taken,
                # YOUR ADVANTAGE: inject recording context
                known_workflows=context.related_recordings,
                known_elements=context.element_patterns,
                known_navigation=context.url_patterns,
            )
            
            # 3. LLM decides action
            action = await self._get_llm_action(prompt, state.screenshot)
            
            # 4. Execute action
            result = await self._execute_action(page, action)
            
            # 5. Capture step data (for recording)
            step_data = await self._capture_step(page, action, result)
            steps_taken.append(step_data)
            
            # 6. Check if done
            if action.type == "done":
                # Save as new recording!
                await self._save_as_recording(task, steps_taken, context.project_id)
                return AgentResult(success=True, steps=steps_taken)
        
        return AgentResult(success=False, steps=steps_taken, error="Max steps reached")
```

**DOM Serialization (the expensive part browser-use spent months on):**

You DON'T need to replicate their full CDP-based DOM service. Use Playwright's built-in:

```python
async def _get_page_state(self, page: Page) -> PageState:
    # Get all interactive elements using JS injection
    elements = await page.evaluate("""() => {
        const interactiveSelectors = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="textbox"], [onclick], [tabindex]';
        const elements = document.querySelectorAll(interactiveSelectors);
        return Array.from(elements).filter(el => {
            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            return rect.width > 0 && rect.height > 0 
                && style.display !== 'none' 
                && style.visibility !== 'hidden';
        }).map((el, i) => ({
            index: i,
            tag: el.tagName.toLowerCase(),
            text: (el.textContent || '').trim().slice(0, 100),
            role: el.getAttribute('role'),
            ariaLabel: el.getAttribute('aria-label'),
            type: el.getAttribute('type'),
            placeholder: el.getAttribute('placeholder'),
            id: el.id,
            testId: el.getAttribute('data-testid'),
            href: el.getAttribute('href'),
            rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                w: Math.round(rect.width),
                h: Math.round(rect.height)
            }
        }));
    }""")
    
    screenshot = await page.screenshot(type="png")
    url = page.url
    title = await page.title()
    
    return PageState(
        elements=elements,
        screenshot=screenshot,
        url=url,
        title=title,
        element_text=self._serialize_elements(elements)
    )
```

This is 50 lines of JS vs browser-use's 500+ lines of CDP code. It's simpler, it misses some edge cases (shadow DOM, some JS-only listeners), but it works for 90% of sites. You can iterate and add CDP later.

**The LLM prompt — your version with recording context:**

```markdown
You are a browser automation agent. Complete the user's task.

TASK: {task}

CURRENT PAGE:
URL: {url}
Title: {title}

KNOWN CONTEXT (from previous recordings on this site):
{context.format_for_llm()}
# e.g., "On salesforce.com, the 'New Opportunity' button is usually at top-right.
#  The form has fields: Opportunity Name, Stage, Close Date, Amount.
#  Save button is at bottom of form."

INTERACTIVE ELEMENTS ON THIS PAGE:
[0] <button> "New" role=button
[1] <input> placeholder="Search..." type=text
[2] <a> "Opportunities" href=/lightning/o/Opportunity/list
...

ACTIONS YOU CAN TAKE:
- click(index) — click element by index
- type(index, text) — type text into element
- navigate(url) — go to URL
- scroll(direction) — scroll up/down
- done(result) — task complete

PREVIOUS STEPS IN THIS RUN:
{steps_taken_summary}

What is your next action? Respond with JSON:
{"thinking": "...", "action": "click", "params": {"index": 2}}
```

**The "context" injection is where you beat browser-use.** Their prompt has the same structure minus the KNOWN CONTEXT block. That block alone can save 3-5 exploration steps.

### Component 4: Run Capture (`api/app/services/agent/capture.py`)

Converts agent runs into recordings. This is the FLYWHEEL.

```python
class RunCapture:
    async def save_as_recording(
        self, 
        task: str, 
        steps: list[StepData],
        project_id: str,
        user_id: str
    ) -> str:
        """
        Convert an agent run into a stept recording.
        Returns the recording session ID.
        """
        # Create recording session
        session = ProcessRecordingSession(
            name=task,
            project_id=project_id,
            user_id=user_id,
            status="completed",
            source_type="agent",  # New source type!
            total_steps=len(steps),
        )
        
        for i, step in enumerate(steps):
            recording_step = ProcessRecordingStep(
                session_id=session.id,
                step_number=i + 1,
                step_type=step.action_type,
                action_type=step.action_type,
                url=step.url,
                window_title=step.page_title,
                description=step.description,
                element_info=step.element_info,  # Rich element data
                # Position data from element rect
                relative_position={"x": step.rect.x, "y": step.rect.y},
                screenshot_size=step.viewport_size,
            )
            # Save screenshot as file
            # Save DOM snapshot if captured
        
        # Run auto-processing (title, summary, tags)
        # Create context links from URLs
        # Index for search
        
        return session.id
```

### Component 5: Public Workflow Repository

Community-shared recordings for common apps.

**Database model:**
```python
class PublicWorkflow(Base):
    __tablename__ = "public_workflows"
    
    id = Column(String(16), primary_key=True)
    recording_id = Column(String(16), ForeignKey("process_recording_sessions.id"))
    
    # Discovery
    title = Column(String, nullable=False)
    description = Column(Text)
    app_name = Column(String)          # "Salesforce", "Workday", "SAP"
    app_url_pattern = Column(String)   # "*.salesforce.com*"
    category = Column(String)          # "CRM", "HR", "Finance"
    tags = Column(JSON)
    
    # Quality signals
    use_count = Column(Integer, default=0)
    success_rate = Column(Float, default=0.0)
    last_verified_at = Column(DateTime)
    
    # Community
    published_by = Column(String(16), ForeignKey("users.id"))
    is_verified = Column(Boolean, default=False)
    
    # Search
    search_tsv = Column(TSVECTOR)
    embedding = Column(Vector(1536))
```

**API endpoints:**
```
GET  /api/v1/public-workflows?q=...&app=...&category=...
POST /api/v1/public-workflows  (publish a recording)
GET  /api/v1/public-workflows/{id}/steps
POST /api/v1/public-workflows/{id}/use  (clone to your project)
POST /api/v1/public-workflows/{id}/report  (broken/outdated)
```

**The task router queries this BEFORE going to agent mode.** If someone in the community already recorded "Create Salesforce Opportunity," you get it for free. No agent run needed.

### Component 6: MCP + API for External Agents

Let browser-use, Claude Computer Use, or any other agent query stept for context.

**Already have:**
- `search_workflows` MCP tool
- `get_workflow` MCP tool (returns full step data)
- `get_context` MCP tool (matches URL/app)

**Add:**
```python
@mcp.tool()
async def get_automation_steps(
    task: str,
    url: str | None = None,
    app_name: str | None = None,
) -> dict:
    """
    Get step-by-step instructions for a task.
    Returns element selectors, action types, and navigation flow
    that an automation agent can follow directly.
    """
    # Route through TaskRouter
    plan = await router.route(task, url, project_id)
    
    if plan.mode == "replay":
        return {
            "mode": "replay",
            "confidence": plan.confidence,
            "steps": [
                {
                    "step": i,
                    "url": s.url,
                    "action": s.action_type,
                    "selector": s.selector,
                    "element": s.element_info,
                    "description": s.generated_description,
                }
                for i, s in enumerate(plan.steps)
            ]
        }
    else:
        return {
            "mode": "explore",
            "context": plan.context,
            "hint": "No recording found. Explore freely. Report back steps for learning."
        }
```

This means ANY agent using stept's MCP gets the benefit of recordings without stept running the automation itself.

### Component 7: Benchmarking & Measurement

You need to measure against browser-use. Use the same WebVoyager eval.

**Setup:**
```
stept eval --benchmark webvoyager --mode agent    # Pure agent (your engine)
stept eval --benchmark webvoyager --mode replay   # Pure replay (from recordings)
stept eval --benchmark webvoyager --mode hybrid   # Hybrid mode
stept eval --benchmark webvoyager --compare browser-use  # Head-to-head
```

**Metrics per run:**
- Success: boolean (did it complete the task?)
- Steps: how many steps taken
- Time: total wall-clock time
- Cost: total LLM tokens × price
- Recovery count: how many selector failures needed LLM recovery
- Mode: which mode was used (replay/agent/hybrid)

**Metrics over time (the flywheel):**
- Run 1: agent mode, 45 seconds, $0.80, success
- Run 2: replay mode, 3 seconds, $0.00, success
- Run 3: replay mode, 3 seconds, $0.00, success
- ...
- Run 50: replay mode, 4 seconds, $0.01 (one recovery), success

browser-use:
- Run 1: 45 seconds, $0.80, success
- Run 2: 42 seconds, $0.75, success
- Run 3: 48 seconds, $0.90, success
- ...
- Run 50: 44 seconds, $0.85, success

**Cumulative cost after 50 runs:**
- stept: $0.81 ($0.80 first run + $0.01 recovery)
- browser-use: $41.25

That's the chart that sells.

---

## Implementation Phases

### Phase 1: Replay Engine (2 weeks)
- Port guide-runtime element finder to Python/Playwright
- Build ReplayEngine with selector cascade
- Playwright export from recordings (deterministic scripts)
- CLI: `stept replay <workflow-id>`
- Tests: replay against recorded workflows

### Phase 2: Agent Engine (3 weeks)
- DOM serialization via JS injection
- LLM integration (reuse existing llm_service)
- Agent loop: screenshot → serialize → LLM → action → validate
- System prompt with action schema
- CLI: `stept agent "task description" --url https://...`
- Tests: basic tasks on public sites

### Phase 3: Run Capture + Self-Healing (2 weeks)
- Capture agent runs as recordings
- Self-healing: LLM recovery when selectors fail, update recording
- Hybrid mode: follow recording, switch to agent when stuck
- TaskRouter: automatic mode selection

### Phase 4: Public Repository (2 weeks)
- PublicWorkflow model + endpoints
- Publish/clone/search workflows
- Community quality signals (use count, success rate)
- TaskRouter queries public repo before agent mode

### Phase 5: MCP + Benchmarking (1 week)
- get_automation_steps MCP tool
- WebVoyager eval integration
- Dashboard: cost/speed/reliability metrics per workflow

### Phase 6: Web UI (2 weeks)
- Task input on stept web app (codeless!)
- Run history with step-by-step replay viewer
- Mode indicator (replay/agent/hybrid)
- Cost tracking per run
- Public workflow browser

**Total: ~12 weeks for full v1**

---

## What This Means Competitively

### vs browser-use
- First run: same (both use LLM)
- Second run onwards: stept is 100x cheaper and 10x faster
- Recording context makes even first runs more reliable
- Self-healing means recordings stay current without re-recording

### vs Scribe/Tango
- They document. You document AND automate.
- Same recording, two outputs: guide for humans, script for machines.

### vs UiPath/traditional RPA
- No flowchart programming
- AI handles edge cases
- Self-healing without developer intervention
- 10x faster to set up (record instead of program)

### The moat
- Every run creates knowledge. The system gets smarter.
- Network effects: public repository means more users = more recordings = better for everyone.
- Recording data (selectors, element info, DOM snapshots) is months of engineering that agents-only tools can't easily replicate.
