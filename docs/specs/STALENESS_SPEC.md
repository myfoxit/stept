# Ondoki — Staleness Detection: Complete Production Spec

*Final spec. March 13, 2026.*

---

## The Pitch

Every company has documentation that's wrong and nobody knows it. A button got renamed, a URL changed, a form field moved. Someone follows the guide, gets stuck, wastes 20 minutes, pings Slack. Multiply by every employee, every week.

**Ondoki Staleness Detection catches this before your users do.**

Nobody else offers this. Not Scribe, not Tango, not Trainual, not WalkMe.

---

## Overview: Four Detection Triggers

| Trigger | When it fires | Auth needed | User present? |
|---------|--------------|-------------|---------------|
| **Passive replay** | User runs an interactive guide | No (user's browser) | ✅ Yes |
| **Scheduled Playwright** | Cron (weekly/daily/custom) | One project login | ❌ No |
| **Manual re-run** | User clicks "Verify" (single or multi-select) | One project login | ❌ No |
| **Heuristic age decay** | Time passes without any check | None | ❌ No |

All four produce the same output: per-step health data that rolls up into workflow health scores.

---

## Trigger 1: Passive Replay Feedback

### How it works

Every time someone runs an Interactive Guide, the guide-runtime already calls `findGuideElement(step)` which runs the 6-level element finder cascade:

1. **CSS selector** → confidence 1.0
2. **data-testid / data-test / data-cy** → confidence 0.95
3. **ARIA role + text** → confidence 0.85
4. **Tag + text (fuzzy)** → confidence 0.7
5. **XPath** → confidence 0.6
6. **Parent chain context** → confidence 0.5

Today the result is used only for overlay positioning. With staleness detection, we also **report the result** back to the backend.

### Chrome Extension Changes (guide-runtime.js)

After `findGuideElement(step)` resolves in the step rendering flow, send a verification event:

```js
// Inside the step rendering logic, after element search completes
const result = await findGuideElement(step);

chrome.runtime.sendMessage({
  type: 'GUIDE_STEP_HEALTH',
  workflowId: guide.workflowId,
  stepNumber: step.step_number,
  elementFound: !!result,
  finderMethod: result?.method || null,
  finderConfidence: result?.confidence || 0,
  expectedUrl: step.url,
  actualUrl: window.location.href,
  urlMatched: !step.url || normalizeUrl(step.url) === normalizeUrl(window.location.href),
  timestamp: Date.now(),
});
```

Background.js batches these per-workflow and sends to backend on guide completion (or on guide stop/close):

```js
// background.js — collect health events during guide playback
const healthBatch = [];

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'GUIDE_STEP_HEALTH') {
    healthBatch.push(msg);
  }
  if (msg.type === 'GUIDE_STOPPED' || msg.type === 'GUIDE_COMPLETED') {
    if (healthBatch.length > 0) {
      fetch(`${apiBase}/api/v1/workflows/${msg.workflowId}/health-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ steps: [...healthBatch], source: 'guide_replay' }),
      });
      healthBatch.length = 0;
    }
  }
});
```

### Handling "Always Broken" Steps — The Noise Problem

Not every "element not found" means the doc is stale. Some steps will **always fail to find** because:
- The element only appears on hover (tooltip, dropdown)
- The element is inside a dynamic modal that isn't open
- The step captures a transient state (loading spinner, toast notification)
- The selector was never good to begin with (captured a random class name)
- The page requires specific data state (e.g., "click the third row" but there are only 2 rows)
- Iframe or cross-origin content that can't be accessed

**If we flag these as stale, users will ignore all alerts. That kills the feature.**

#### Solution: Step Reliability Score + Baseline

Each step builds a **reliability baseline** from its first N checks:

```
step_reliability = times_found / total_checks  (over the step's lifetime)

If step_reliability < 0.3 after >= 5 checks:
  → Mark step as "unreliable" — exclude from health score
  → Show in UI as "⚪ This step can't be automatically verified"
  → Don't alert on it
```

**How this works in practice:**
- Step "Click Submit button" → found 19/20 times → reliability 0.95 → healthy, counts toward score
- Step "Hover tooltip shows" → found 0/20 times → reliability 0.0 → marked unreliable, excluded
- Step "Click Submit button" was reliable (0.95) but now fails 5x in a row → THAT's a real staleness signal

#### Staleness = Reliable Step Starts Failing

```
is_stale(step) =
  step.reliability >= 0.5          -- step was historically findable
  AND step.recent_found_rate < 0.3 -- but recently it's not being found
  AND step.recent_checks >= 3      -- with enough recent data to be sure
```

This means:
- Steps that never worked → silently ignored (not counted)
- Steps that always worked but suddenly stop → flagged immediately
- Steps with flaky results → need more consecutive failures to trigger

### LLM Verification Layer (Hybrid Mode)

For users with an LLM API key configured (OpenAI, Anthropic, etc.), add a second verification pass when the element finder fails:

```
Element finder says: "not found"
    ↓
Take a screenshot of the current viewport
    ↓
Send to LLM: "This step expects the user to [step.description]. 
              The element should be: [step.element_info summary].
              Looking at this screenshot, is this element visible on the page?
              If yes, describe where it is. If no, what changed?"
    ↓
LLM responds: { visible: true/false, explanation: "The button was renamed to 'Save Draft'" }
    ↓
Store the LLM assessment alongside the finder result
```

**When LLM verification runs:**
- Only when the element finder returns `null` (not on success — saves tokens)
- Only for steps with reliability >= 0.5 (don't waste tokens on known-unreliable steps)
- Rate-limited: max 10 LLM checks per verification run
- Optional: admin can enable/disable per project

**Why hybrid is better than either alone:**
- Element finder alone: high precision but can't tell you WHY something changed
- LLM alone: too expensive, too slow, hallucination risk
- Hybrid: element finder does the fast check, LLM only kicks in for failures to provide context ("button renamed", "moved to different tab", "page completely redesigned")

**For users WITHOUT LLM configured:**
- Staleness detection works fully on the element finder + heuristics
- No LLM, no degradation — just no "why" context on failures
- UI shows "⚠️ Element not found" vs. "⚠️ Button 'Submit' was renamed to 'Save Draft'" (with LLM)

---

## Trigger 2: Scheduled Playwright Verification

### One Login Per Project

80%+ of Ondoki workflows document **the user's own product**. The user provides one set of credentials for their own app — same as they do for CI/CD, monitoring, staging.

```
Project Settings → Staleness Detection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

☑ Enable automatic verification

  Login URL:  [https://app.mycompany.com/login  ]
  Email:      [docs-bot@mycompany.com           ]
  Password:   [••••••••••                        ]
  
  Advanced (if auto-detect fails):
    Email selector:    [auto-detected             ]
    Password selector: [auto-detected             ]
    Submit selector:   [auto-detected             ]
    Post-login wait:   [2] seconds
  
  [Test Connection]     Status: ✅ Connected

  Schedule: [Weekly ▼]  Day: [Sunday ▼]  Time: [03:00 ▼]
  
  Scope: [All workflows ▼]
         ├ All workflows
         ├ Only workflows with health < 0.8
         └ Only selected workflows...

  Last run: Mar 10, 03:00 — 22/24 steps verified ✅
```

**"Test Connection" flow:**
1. Launch headless Playwright
2. Navigate to login URL
3. Auto-detect form fields (try common selectors: `input[type="email"]`, `input[name="email"]`, `#email`, etc.)
4. Fill credentials, submit
5. Verify we're no longer on the login page
6. Return success/failure with details ("Logged in successfully, redirected to /dashboard")

**Security:**
- Credentials encrypted at rest (AES-256-GCM, same as existing `crypto.encrypt`)
- Decrypted only in the Playwright worker's memory
- Frontend never sees the actual password after save (shows `d***@mycompany.com` / `configured ✓`)
- Stored per-project in `verification_config` table
- Audit log for every verification run

**For public pages / unauthenticated workflows:**
- If no login is configured, Playwright still verifies — it just doesn't log in
- Steps on public URLs get verified for free, zero config
- If a step redirects to a login page (detected by URL pattern `/login`, `/signin`, `/auth`), mark it as "needs auth" instead of "stale"

### Playwright Execution Flow

```python
async def run_scheduled_verification(project_id: str):
    config = await get_verification_config(project_id)
    workflows = await get_workflows_to_verify(project_id, config.scope)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={'width': 1280, 'height': 720},
            user_agent='Ondoki-Verify/1.0'
        )
        page = await context.new_page()
        
        # Login if configured
        if config.login_url and config.encrypted_credentials:
            creds = decrypt_credentials(config.encrypted_credentials)
            login_success = await perform_login(page, config, creds)
            wipe_from_memory(creds)  # zero credentials after use
            
            if not login_success:
                await create_alert(project_id, 'auth_failed', 
                    'Scheduled verification failed: could not log in')
                return
        
        # Verify each workflow
        for workflow in workflows:
            results = []
            for step in workflow.steps:
                result = await verify_step(page, step, config)
                results.append(result)
            
            await save_health_check(workflow.id, results, source='scheduled')
            await recalculate_health_score(workflow.id)
        
        await browser.close()


async def verify_step(page, step, config) -> StepCheckResult:
    # Navigate to step URL if different from current page
    if step.url and normalize_url(step.url) != normalize_url(page.url):
        try:
            response = await page.goto(step.url, timeout=15000)
            await page.wait_for_load_state('networkidle', timeout=10000)
            
            # Check for login redirect (means we need auth for this domain)
            if is_login_page(page.url):
                return StepCheckResult(
                    step_number=step.step_number,
                    status='needs_auth',
                    expected_url=step.url,
                    actual_url=page.url,
                )
        except Exception as e:
            return StepCheckResult(
                step_number=step.step_number,
                status='url_error',
                error=str(e),
            )
    
    # Run the element finder (same logic as guide-runtime.js, ported to Python/Playwright)
    find_result = await page.evaluate('''(stepData) => {
        // Injected findInRoot logic — same 6-level cascade
        function safeQuerySelector(root, selector) {
            try { return root.querySelector(selector); } catch { return null; }
        }
        function isVisible(el) {
            if (!el || !el.getBoundingClientRect) return false;
            const rect = el.getBoundingClientRect();
            if (rect.width === 0 && rect.height === 0) return false;
            const style = getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }
        
        // 1. CSS selector
        if (stepData.selector) {
            const el = safeQuerySelector(document, stepData.selector);
            if (el && isVisible(el)) return { found: true, method: 'selector', confidence: 1.0 };
        }
        // 2. data-testid
        if (stepData.element_info?.testId) {
            for (const attr of ['data-testid', 'data-test', 'data-cy']) {
                try {
                    const el = document.querySelector(`[${attr}="${stepData.element_info.testId}"]`);
                    if (el && isVisible(el)) return { found: true, method: 'testid', confidence: 0.95 };
                } catch {}
            }
        }
        // 3. Role + text
        if (stepData.element_role && stepData.element_text) {
            const els = document.querySelectorAll(`[role="${stepData.element_role}"]`);
            for (const el of els) {
                if (isVisible(el) && el.textContent.trim().toLowerCase().includes(
                    stepData.element_text.trim().toLowerCase())) {
                    return { found: true, method: 'role+text', confidence: 0.85 };
                }
            }
        }
        // 4. Tag + text (fuzzy)
        if (stepData.element_info?.tagName && stepData.element_text) {
            const els = document.querySelectorAll(stepData.element_info.tagName);
            for (const el of els) {
                if (isVisible(el) && el.textContent.trim().toLowerCase().includes(
                    stepData.element_text.trim().toLowerCase())) {
                    return { found: true, method: 'tag+text', confidence: 0.7 };
                }
            }
        }
        // 5. XPath
        if (stepData.xpath) {
            try {
                const r = document.evaluate(stepData.xpath, document, null, 
                    XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                if (r.singleNodeValue && isVisible(r.singleNodeValue)) 
                    return { found: true, method: 'xpath', confidence: 0.6 };
            } catch {}
        }
        // 6. Parent chain
        if (stepData.element_info?.parentChain?.length) {
            for (const ancestor of stepData.element_info.parentChain) {
                let container = null;
                if (ancestor.id) container = document.getElementById(ancestor.id);
                else if (ancestor.testId) container = safeQuerySelector(document, 
                    `[data-testid="${ancestor.testId}"]`);
                if (!container) continue;
                if (stepData.element_info?.tagName && stepData.element_text) {
                    const els = container.querySelectorAll(stepData.element_info.tagName);
                    for (const el of els) {
                        if (isVisible(el) && el.textContent.trim().toLowerCase().includes(
                            stepData.element_text.trim().toLowerCase())) {
                            return { found: true, method: 'parent-context', confidence: 0.5 };
                        }
                    }
                }
            }
        }
        return { found: false, method: null, confidence: 0 };
    }''', {
        'selector': step.element_info.get('selector') if step.element_info else None,
        'element_info': step.element_info,
        'element_role': step.element_info.get('role') if step.element_info else None,
        'element_text': step.element_info.get('text') if step.element_info else None,
        'xpath': step.element_info.get('xpath') if step.element_info else None,
    })
    
    # Optional: LLM verification on failure
    llm_assessment = None
    if not find_result['found'] and config.llm_enabled:
        screenshot = await page.screenshot(type='jpeg', quality=60)
        llm_assessment = await llm_verify_step(screenshot, step)
    
    return StepCheckResult(
        step_number=step.step_number,
        element_found=find_result['found'],
        finder_method=find_result['method'],
        finder_confidence=find_result['confidence'],
        expected_url=step.url,
        actual_url=page.url,
        url_matched=urls_match(step.url, page.url),
        llm_visible=llm_assessment.visible if llm_assessment else None,
        llm_explanation=llm_assessment.explanation if llm_assessment else None,
    )
```

---

## Trigger 3: Manual Re-Run

### Single Workflow

On the workflow detail page, in the health banner or a dedicated button:

```
[▶ Verify Now]
```

Clicking this:
1. Queues a Playwright verification job for this one workflow
2. Shows a progress indicator ("Checking step 3 of 12...")
3. Results appear in real-time as steps complete
4. Takes 15-60 seconds depending on step count

### Multi-Select from Sidebar or Dashboard

In the sidebar, the project health dashboard, or the workflow list:

```
☑ Employee Onboarding           🟡
☑ Process Refund                🔴
☐ Setup New Account             🟢
☑ Password Reset Flow           🟡

[▶ Verify Selected (3)]  [Select All Stale]
```

**"Select All Stale"** button: one-click selects all workflows with status `aging` or `stale`.

Clicking "Verify Selected":
1. Queues Playwright jobs for all selected workflows
2. Shows a batch progress view:

```
Verifying 3 workflows...
━━━━━━━━━━━━━━━━━━━━━━━━

✅ Employee Onboarding     — 8/8 steps passed
🔄 Process Refund          — Checking step 4 of 6...
⏳ Password Reset Flow     — Queued

[Cancel]
```

3. Results update the sidebar dots and dashboard in real-time
4. Single browser session is reused across workflows (login once, verify all)

### API Endpoint

```
POST /api/v1/verification/run
{
  "workflow_ids": ["abc123", "def456", "ghi789"],   // specific workflows
  // OR
  "project_id": "proj_001",                          // all workflows in project
  "filter": "stale"                                   // optional: "all" | "stale" | "aging"
}

Response:
{
  "job_id": "job_xyz",
  "workflows_queued": 3,
  "estimated_seconds": 45
}
```

```
GET /api/v1/verification/jobs/{job_id}

Response:
{
  "job_id": "job_xyz",
  "status": "running",              // "queued" | "running" | "completed" | "failed"
  "progress": {
    "total": 3,
    "completed": 1,
    "current": "def456",
    "current_step": 4,
    "current_total_steps": 6
  },
  "results": {
    "abc123": { "health_score": 1.0, "steps_passed": 8, "steps_total": 8 },
  }
}
```

Frontend polls this endpoint (or uses WebSocket/SSE for real-time updates).

---

## Trigger 4: Heuristic Age Decay

Even without any active verification, health scores decay over time. This ensures workflows that nobody checks don't show a false green dot forever.

```
recency_factor =
  last_verified < 7 days:   1.0
  last_verified < 14 days:  0.95
  last_verified < 30 days:  0.9
  last_verified < 60 days:  0.75
  last_verified < 90 days:  0.6
  never verified:            0.5
  > 90 days:                 0.4
```

A workflow that scored 1.0 (all steps found) 90 days ago now shows 0.6 — `aging`. This nudges users to re-verify without crying wolf.

**The recency_factor is a multiplier on step_health**, not a replacement. If a workflow scored 0.5 last week, recency doesn't save it.

---

## Health Score Formula

```
# Per-step tracking
step.reliability = step.lifetime_found_count / step.lifetime_check_count
step.is_reliable = step.reliability >= 0.3 AND step.lifetime_check_count >= 5

# Workflow health
reliable_steps = [s for s in workflow.steps if s.is_reliable]
unreliable_steps = [s for s in workflow.steps if NOT s.is_reliable]

if len(reliable_steps) == 0:
    step_health = 0.5  # unknown — not enough data
else:
    step_health = count(recently_found in reliable_steps) / len(reliable_steps)

recency_factor = decay_curve(workflow.last_verified_at)

health_score = step_health × recency_factor

# Status thresholds
health_status =
  score >= 0.8               → 'healthy'   🟢
  score >= 0.6               → 'aging'     🟡
  score <  0.6               → 'stale'     🔴
  no reliable checks exist   → 'unknown'   ⚪
```

**Coverage metric** (separate from health):
```
coverage = len(reliable_steps) / len(all_steps)

Shown in UI: "Health: 🟢 0.92  |  Coverage: 85% (2 steps can't be auto-verified)"
```

---

## UI/UX

### Sidebar: Health Dots

```
📁 Onboarding
  📄 Employee Setup           🟢
  📄 Access Provisioning      🟡
  📄 First Day Checklist      🟢
📁 Customer Support
  📄 Process Refund           🔴
  📄 Escalation Path          ⚪
```

Small (6px) dot, right side of workflow name, before the "..." menu.

### Workflow Header: Health Banner

When health < 0.8:

```
┌───────────────────────────────────────────────────────────────────┐
│ ⚠️  2 steps may be outdated — Last verified 12 days ago          │
│                                                                   │
│ Step 4: "Submit" button not found                                 │
│ Step 7: URL redirected to /new-page (expected /old-page)          │
│                                                                   │
│ [▶ Verify Now]  [Re-record Workflow]  [Dismiss]                   │
└───────────────────────────────────────────────────────────────────┘
```

With LLM context (if enabled):
```
│ Step 4: "Submit" button not found                                 │
│   💡 LLM: "Button appears to be renamed to 'Save Draft'"         │
```

### Step-Level Indicators

In the workflow step list, each step shows a small badge:

```
  Step 1  Navigate to Settings           ✅ Verified 2d ago
  Step 2  Click "Billing" tab            ✅ Verified 2d ago  
  Step 3  Hover over plan details        ⚪ Can't auto-verify (hover element)
  Step 4  Click "Submit"                 ⚠️ Not found — last 3 checks failed
  Step 5  Confirm dialog                 ✅ Verified 2d ago
```

Clicking on a failed step shows details:
```
Step 4: Click "Submit"
━━━━━━━━━━━━━━━━━━━━━

Status: ⚠️ Not found
Reliability: 0.95 (was consistently found before)

Last 5 checks:
  Mar 10 (scheduled)   ❌ Not found
  Mar 8  (replay)      ❌ Not found  
  Mar 5  (scheduled)   ❌ Not found
  Feb 28 (replay)      ✅ Found (selector)
  Feb 25 (scheduled)   ✅ Found (selector)

Expected selector: button.btn-primary[type="submit"]
Expected text: "Submit"

💡 LLM assessment: "The 'Submit' button appears to have been 
   renamed to 'Save Changes'. A button with that text is visible 
   at the same location."

[Re-record This Step]  [Mark as Resolved]  [Ignore This Step]
```

### Project Health Dashboard

```
Documentation Health                              [▶ Verify All]
━━━━━━━━━━━━━━━━━━━                              [▶ Verify Stale]

23 workflows  ·  187 steps  ·  Coverage: 91%

🟢 18 Healthy    ████████████████████░░░░  78%
🟡  3 Aging      ████░░░░░░░░░░░░░░░░░░░  13%
🔴  2 Stale      ██░░░░░░░░░░░░░░░░░░░░░   9%

Stale workflows:
  📄 Process Refund — Step 4 "Submit" not found (since Mar 5)
  📄 AWS Access    — URL changed, 3 steps affected (since Mar 1)

Aging workflows:
  📄 Onboarding   — Not verified in 45 days
  📄 VPN Setup    — Step 2 intermittent failures
  📄 Expense Rpt  — Not verified in 38 days

Last scheduled run: Mar 10, 03:00 — 22/24 reliable steps passed
Next scheduled run: Mar 17, 03:00

[Export Health Report (PDF)]
```

### Settings: Verification Configuration

```
Project Settings → Staleness Detection
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

☑ Enable automatic verification

── Authentication ──────────────────────────

  Login URL:  [https://app.mycompany.com/login  ]
  Email:      [docs-bot@mycompany.com           ]
  Password:   [••••••••••                        ]
  
  ▸ Advanced login settings
    Email selector:    [auto]  (detected: input#email)
    Password selector: [auto]  (detected: input[type="password"])
    Submit selector:   [auto]  (detected: button[type="submit"])
    Post-login wait:   [2] seconds
    Post-login URL:    [auto]  (detected: /dashboard)
  
  [Test Connection]     ✅ Last tested: 2 min ago — Success

── Schedule ────────────────────────────────

  Frequency: [Weekly ▼]
  Day:       [Sunday ▼]
  Time:      [03:00 ▼]  (Europe/Vienna)
  
  Scope: [All workflows ▼]

── LLM Verification (optional) ─────────────

  ☐ Enable LLM-assisted verification
    Uses your configured LLM API key to analyze 
    screenshots when elements aren't found.
    Provides "why" context (renamed, moved, redesigned).
    ~$0.01 per failed step check.

── Notifications ───────────────────────────

  ☑ Email digest when workflows go stale
  ☑ In-app notification on health changes
  Notify: [Project admins ▼]
```

---

## Data Model

### New Tables

```sql
-- Per-step verification results (from any trigger)
CREATE TABLE workflow_step_check (
    id VARCHAR(16) PRIMARY KEY,
    workflow_id VARCHAR(16) NOT NULL REFERENCES process_recording_sessions(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    
    -- Source of this check
    check_source VARCHAR(20) NOT NULL,  -- 'guide_replay' | 'scheduled' | 'manual' | 'age_decay'
    
    -- Element finder result
    element_found BOOLEAN,
    finder_method VARCHAR(20),       -- 'selector' | 'testid' | 'role+text' | 'tag+text' | 'xpath' | 'parent-context'
    finder_confidence REAL,          -- 0.0-1.0
    
    -- URL check
    expected_url VARCHAR,
    actual_url VARCHAR,
    url_matched BOOLEAN,
    
    -- Step status (summarizes the above)
    status VARCHAR(20) NOT NULL,     -- 'passed' | 'failed' | 'needs_auth' | 'url_error' | 'skipped'
    
    -- LLM verification (nullable — only when LLM enabled and element not found)
    llm_visible BOOLEAN,
    llm_explanation TEXT,
    
    -- Who/when
    checked_by VARCHAR(16),          -- user_id for replay, NULL for scheduled
    checked_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_step_check_workflow ON workflow_step_check (workflow_id, step_number);
CREATE INDEX ix_step_check_time ON workflow_step_check (checked_at);
CREATE INDEX ix_step_check_source ON workflow_step_check (check_source, checked_at);


-- Per-step reliability tracking (materialized, updated after each check)
CREATE TABLE step_reliability (
    workflow_id VARCHAR(16) NOT NULL REFERENCES process_recording_sessions(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    
    total_checks INTEGER NOT NULL DEFAULT 0,
    found_count INTEGER NOT NULL DEFAULT 0,
    reliability REAL NOT NULL DEFAULT 0,          -- found_count / total_checks
    is_reliable BOOLEAN NOT NULL DEFAULT FALSE,   -- reliability >= 0.3 AND total_checks >= 5
    
    -- Recent window (last 5 checks)
    recent_checks INTEGER NOT NULL DEFAULT 0,
    recent_found INTEGER NOT NULL DEFAULT 0,
    
    last_found_at TIMESTAMP,
    last_checked_at TIMESTAMP,
    last_method VARCHAR(20),
    
    updated_at TIMESTAMP DEFAULT NOW(),
    
    PRIMARY KEY (workflow_id, step_number)
);


-- Project-level verification configuration
CREATE TABLE verification_config (
    id VARCHAR(16) PRIMARY KEY,
    project_id VARCHAR(16) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Auth (one login per project)
    login_url VARCHAR,
    encrypted_email TEXT,              -- AES-256-GCM encrypted
    encrypted_password TEXT,           -- AES-256-GCM encrypted
    email_selector VARCHAR,            -- NULL = auto-detect
    password_selector VARCHAR,         -- NULL = auto-detect  
    submit_selector VARCHAR,           -- NULL = auto-detect
    post_login_wait_ms INTEGER DEFAULT 2000,
    
    -- Schedule
    schedule VARCHAR(10) DEFAULT 'weekly',   -- 'daily' | 'weekly' | 'monthly' | 'manual'
    schedule_day INTEGER DEFAULT 0,          -- 0=Sun for weekly, 1-28 for monthly
    schedule_hour INTEGER DEFAULT 3,         -- Hour in project timezone
    schedule_scope VARCHAR(10) DEFAULT 'all', -- 'all' | 'stale' | 'selected'
    
    -- LLM
    llm_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Notifications
    notify_email BOOLEAN NOT NULL DEFAULT TRUE,
    notify_in_app BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Run tracking
    last_run_at TIMESTAMP,
    last_run_status VARCHAR(10),        -- 'success' | 'partial' | 'failed' | 'auth_failed'
    last_run_stats JSON,                -- { total_steps, passed, failed, skipped, duration_s }
    next_run_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(project_id)
);


-- Verification job queue (for manual and scheduled runs)
CREATE TABLE verification_job (
    id VARCHAR(16) PRIMARY KEY,
    project_id VARCHAR(16) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    
    -- What to verify
    workflow_ids JSON NOT NULL,          -- ["abc", "def"] or ["*"] for all
    trigger VARCHAR(10) NOT NULL,        -- 'scheduled' | 'manual'
    triggered_by VARCHAR(16),            -- user_id for manual, NULL for scheduled
    
    -- Execution state
    status VARCHAR(12) NOT NULL DEFAULT 'queued',  -- 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
    progress JSON,                       -- { total, completed, current_workflow_id, current_step, current_total_steps }
    results JSON,                        -- { workflow_id: { health_score, passed, failed, skipped } }
    error TEXT,
    
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ix_job_project ON verification_job (project_id, status);
CREATE INDEX ix_job_created ON verification_job (created_at);


-- Staleness alerts
CREATE TABLE staleness_alert (
    id VARCHAR(16) PRIMARY KEY,
    project_id VARCHAR(16) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    workflow_id VARCHAR(16) NOT NULL REFERENCES process_recording_sessions(id) ON DELETE CASCADE,
    
    alert_type VARCHAR(20) NOT NULL,     -- 'element_missing' | 'url_changed' | 'age_decay' | 'auth_failed'
    severity VARCHAR(10) NOT NULL,       -- 'warning' | 'critical'
    title VARCHAR(255) NOT NULL,
    details JSON,                        -- { step_numbers: [4,7], expected: "Submit", llm_explanation: "..." }
    
    resolved BOOLEAN DEFAULT FALSE,
    resolved_by VARCHAR(16),
    resolved_at TIMESTAMP,
    dismissed BOOLEAN DEFAULT FALSE,     -- user explicitly dismissed without fixing
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ix_alert_project ON staleness_alert (project_id, resolved, dismissed);
CREATE INDEX ix_alert_workflow ON staleness_alert (workflow_id);
```

### Changes to Existing Tables

```sql
-- Add health columns to process_recording_sessions
ALTER TABLE process_recording_sessions ADD COLUMN health_score REAL;
ALTER TABLE process_recording_sessions ADD COLUMN health_status VARCHAR(10);   -- 'healthy' | 'aging' | 'stale' | 'unknown'
ALTER TABLE process_recording_sessions ADD COLUMN last_verified_at TIMESTAMP;
ALTER TABLE process_recording_sessions ADD COLUMN last_verified_source VARCHAR(20);
ALTER TABLE process_recording_sessions ADD COLUMN reliable_step_count INTEGER DEFAULT 0;
ALTER TABLE process_recording_sessions ADD COLUMN unreliable_step_count INTEGER DEFAULT 0;
ALTER TABLE process_recording_sessions ADD COLUMN failed_step_count INTEGER DEFAULT 0;
ALTER TABLE process_recording_sessions ADD COLUMN coverage REAL;              -- reliable / total
```

---

## Backend API

### Health Check Ingestion (from extension)

```
POST /api/v1/workflows/{workflow_id}/health-check
Authorization: Bearer <session_cookie>

{
  "steps": [
    {
      "stepNumber": 1,
      "elementFound": true,
      "finderMethod": "selector",
      "finderConfidence": 1.0,
      "expectedUrl": "https://app.example.com/settings",
      "actualUrl": "https://app.example.com/settings",
      "urlMatched": true,
      "timestamp": 1710312000000
    },
    ...
  ],
  "source": "guide_replay"
}

Response: 200 OK
{ "health_score": 0.92, "health_status": "healthy" }
```

### Health Endpoints

```
GET /api/v1/workflows/{workflow_id}/health

Response:
{
  "health_score": 0.72,
  "health_status": "aging",
  "coverage": 0.85,
  "last_verified_at": "2026-03-10T03:00:00Z",
  "last_verified_source": "scheduled",
  "steps": [
    { "step_number": 1, "status": "passed", "reliability": 0.98, "last_method": "selector", "last_checked": "..." },
    { "step_number": 2, "status": "passed", "reliability": 0.95, "last_method": "testid", "last_checked": "..." },
    { "step_number": 3, "status": "unreliable", "reliability": 0.1, "is_reliable": false },
    { "step_number": 4, "status": "failed", "reliability": 0.92, "last_method": null,
      "llm_explanation": "Button renamed to 'Save Draft'", "failing_since": "2026-03-05" },
  ],
  "alerts": [
    { "id": "alert_1", "type": "element_missing", "severity": "warning", 
      "title": "Step 4: 'Submit' button not found", "created_at": "..." }
  ]
}
```

```
GET /api/v1/projects/{project_id}/health

Response:
{
  "total_workflows": 23,
  "healthy": 18,
  "aging": 3,
  "stale": 2,
  "unknown": 0,
  "total_steps": 187,
  "coverage": 0.91,
  "stale_workflows": [ { "id": "...", "name": "Process Refund", "health_score": 0.42, ... } ],
  "aging_workflows": [ ... ],
  "last_run": { "at": "...", "status": "success", "stats": { ... } },
  "next_run": "2026-03-17T03:00:00Z"
}
```

### Manual Verification

```
POST /api/v1/verification/run
Authorization: Bearer <session_cookie>

{
  "workflow_ids": ["abc123", "def456"],
  // OR
  "project_id": "proj_001",
  "filter": "stale"       // "all" | "stale" | "aging"
}

Response: 202 Accepted
{
  "job_id": "job_xyz",
  "workflows_queued": 3,
  "estimated_seconds": 45
}
```

```
GET /api/v1/verification/jobs/{job_id}

Response:
{
  "job_id": "job_xyz",
  "status": "running",
  "progress": { "total": 3, "completed": 1, "current": "def456", "current_step": 4, "current_total_steps": 6 },
  "results": {
    "abc123": { "health_score": 1.0, "passed": 8, "failed": 0, "skipped": 0 }
  }
}
```

```
POST /api/v1/verification/jobs/{job_id}/cancel
```

### Verification Config

```
GET /api/v1/projects/{project_id}/verification-config
PUT /api/v1/projects/{project_id}/verification-config

POST /api/v1/projects/{project_id}/verification-config/test
  → Runs Playwright login test, returns { success: bool, message: string }
```

---

## Implementation Plan

### Phase 1: Passive Replay + Health UI (2-3 weeks)

**Extension:**
- Add `GUIDE_STEP_HEALTH` message to guide-runtime.js after each `findGuideElement()` call
- Background.js batches and sends to backend on guide completion
- No new permissions needed

**Backend:**
- Alembic migration: `workflow_step_check`, `step_reliability`, health columns on `process_recording_sessions`
- New router `api/app/routers/health.py`:
  - `POST /api/v1/workflows/{id}/health-check` — ingestion
  - `GET /api/v1/workflows/{id}/health` — per-workflow
  - `GET /api/v1/projects/{id}/health` — project summary
- Health score recalculation logic (triggered after ingestion)
- Step reliability tracking (updated after each check)

**Frontend:**
- Sidebar health dots in `nav-pages.tsx` (fetch with folder tree API)
- Workflow header banner in `workflow-header.tsx`
- Step-level badges in step card component
- Simple health summary on project page

### Phase 2: Scheduled Playwright + Manual Re-Run (3-4 weeks)

**Backend:**
- Alembic migration: `verification_config`, `verification_job`
- `api/app/routers/verification.py`:
  - CRUD for verification config
  - `POST /test` (test connection)
  - `POST /run` (manual trigger)
  - `GET /jobs/{id}` (job status)
  - `POST /jobs/{id}/cancel`
- Playwright worker (Docker service or background task via existing job infra):
  - Login flow with auto-detect + custom selectors
  - Element finder execution (port of guide-runtime.js logic)
  - Job queue processing
- Cron scheduler: reads `verification_config`, creates jobs at scheduled times
- Credential encryption/decryption using existing `crypto.encrypt`

**Frontend:**
- Verification settings page (login config, schedule, scope)
- "Test Connection" button with inline result
- "Verify Now" button on workflow header
- Multi-select + "Verify Selected" in sidebar/dashboard
- Job progress indicator (poll or SSE)
- Batch progress view

### Phase 3: Alerts + LLM + Polish (2-3 weeks)

**Backend:**
- Alembic migration: `staleness_alert`
- Alert creation logic: when reliable step starts failing → create alert
- Alert resolution: when step starts passing again → auto-resolve
- Email digest: weekly health report per project (use existing email infra)
- LLM verification endpoint: screenshot → LLM → explanation
- In-app notification integration

**Frontend:**
- Project health dashboard (full version with charts, export)
- Alert list with resolve/dismiss actions
- LLM explanation display in step detail
- "Re-record This Step" flow (pre-navigate to step URL, start recording)
- Health report export (PDF)
- Step detail panel with check history

---

## Pricing

| Tier | What They Get |
|------|--------------|
| **Free** | Passive replay health scores, sidebar dots, step indicators, age decay |
| **Pro** | Scheduled Playwright verification, manual re-run (single + multi-select), staleness alerts, email digest, health dashboard |
| **Enterprise** | LLM verification, health report export, API access, custom schedules |

Free tier gives enough value to hook teams. The moment they see a yellow dot and want it auto-checked → Pro upgrade.

---

## Summary

Four triggers, one health score:
1. **Passive replay** — free, automatic, zero config
2. **Scheduled Playwright** — one login, weekly cron, no user needed
3. **Manual re-run** — single or multi-select, on-demand
4. **Age decay** — time-based nudge, no verification needed

Smart noise filtering:
- Steps that never worked → auto-excluded via reliability baseline
- Steps that always worked then stop → flagged as stale
- LLM optional layer for "why" context

One login per project covers 80%+ of real workflows. No credential vault, no multi-domain complexity, no security nightmare.
