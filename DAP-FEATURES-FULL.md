# Stept DAP — Full Feature Specification

## How WalkMe/Whatfix/Pendo Deliver Their Product

Every DAP has the same core delivery architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    ADMIN CONSOLE (Web App)                   │
│                                                             │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │ Content  │  │ Audience │  │ Analytics│  │  Settings  │  │
│  │ Builder  │  │ Targeting│  │Dashboard │  │  & Deploy  │  │
│  └─────────┘  └──────────┘  └──────────┘  └────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ API
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    DELIVERY LAYER                            │
│                                                             │
│  Option A: JS Snippet        Option B: Chrome Extension     │
│  <script src="stept.js">     Chrome Web Store install       │
│  One-line embed in app       Full browser access             │
│  No install needed           Can cross domains               │
│  IT admin adds once          User installs once              │
│                                                             │
│  Both deliver:                                              │
│  • Walkthroughs    • Tooltips     • Beacons                │
│  • Task lists      • Help widget  • Announcements          │
│  • Analytics events • Automation (hidden)                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. JS Embed Script (`stept-widget.js`)

### What it does
A single `<script>` tag that adds stept's full DAP capabilities to any web application without requiring users to install a Chrome extension. This is THE enterprise deployment method.

### How it works
```html
<!-- IT admin adds this to the app's HTML (or via tag manager) -->
<script 
  src="https://stept.company.com/widget/v1/stept-widget.js"
  data-project="proj_abc123"
  data-api-key="pk_live_xxx"
  async
></script>
```

### What it loads
1. **Lightweight loader** (~5KB gzipped) — authenticates, fetches config
2. **Guide runtime** (lazy-loaded, ~30KB) — only loads when a guide/widget is needed
3. **Widget suite** (lazy-loaded) — tooltips, beacons, task lists, help widget

### Configuration fetched from API
```json
GET /api/v1/widget/config?project_id=proj_abc123
{
  "guides": [
    {
      "id": "guide_1",
      "trigger": { "type": "url_match", "pattern": "/opportunities/new" },
      "audience": { "roles": ["sales_rep"], "segments": ["new_hires"] },
      "auto_start": true
    }
  ],
  "tooltips": [
    {
      "id": "tip_1", 
      "target_selector": "#cost-center-field",
      "content": "Enter the 4-digit cost center code from your department sheet.",
      "trigger": { "type": "element_visible" }
    }
  ],
  "beacons": [
    {
      "id": "beacon_1",
      "target_selector": ".new-feature-btn",
      "tooltip": "New! Try our bulk import feature.",
      "dismiss_key": "beacon_bulk_import_v2"
    }
  ],
  "task_lists": [
    {
      "id": "onboarding",
      "title": "Getting Started",
      "tasks": [
        { "label": "Complete your profile", "guide_id": "guide_profile" },
        { "label": "Create your first opportunity", "guide_id": "guide_opp" },
        { "label": "Set up email integration", "guide_id": "guide_email" }
      ]
    }
  ],
  "help_widget": {
    "enabled": true,
    "position": "bottom-right",
    "placeholder": "Search for help..."
  },
  "announcements": [
    {
      "id": "ann_spring_release",
      "title": "Spring Release 2026",
      "body": "Check out the new dashboard features!",
      "cta": { "label": "Take a tour", "guide_id": "guide_spring" },
      "audience": { "segments": ["all"] },
      "dismiss_key": "ann_spring_2026",
      "start_date": "2026-04-01",
      "end_date": "2026-04-15"
    }
  ],
  "settings": {
    "theme": "dark",
    "accent_color": "#3AB08A",
    "logo_url": "https://company.com/logo.svg",
    "z_index": 2147483640
  }
}
```

### User identification (for targeting)
```html
<script>
  window.steptSettings = {
    user: {
      id: "user_123",
      email: "jane@company.com",
      role: "sales_rep",
      department: "sales",
      created_at: "2026-01-15",
      custom: {
        region: "EMEA",
        team: "enterprise"
      }
    }
  };
</script>
```

### Backend endpoints needed
```
GET  /api/v1/widget/config           — returns full config for the embed
POST /api/v1/widget/event            — receives analytics events
GET  /api/v1/widget/guide/:id/steps  — returns guide steps (on-demand)
POST /api/v1/widget/search           — help widget search (public, rate-limited)
GET  /api/v1/widget/js               — serves the actual JS bundle
```

### Build process
- Source: `packages/stept-widget/` (separate from extension)
- Bundles the same guide-runtime, finder, overlay, widgets code
- Output: single JS file, hosted by stept server or CDN
- Version-locked: `widget/v1/stept-widget.js` (breaking changes get v2)
- CSP-compatible: no inline styles (use adoptedStyleSheets or <style> injection)

---

## 2. Analytics System

### Events tracked

Every interaction creates an event:

| Event | Trigger | Data |
|---|---|---|
| `guide.started` | User starts a walkthrough | guide_id, trigger_type, user_id |
| `guide.step.viewed` | Step shown to user | guide_id, step_index, element_found, finder_method, confidence |
| `guide.step.completed` | User performs the step action | guide_id, step_index, time_on_step_ms, completion_method |
| `guide.step.skipped` | User clicks Skip | guide_id, step_index |
| `guide.step.recovery` | LLM self-healing triggered | guide_id, step_index, recovery_success, new_selector |
| `guide.completed` | All steps done | guide_id, total_time_ms, steps_completed, steps_skipped |
| `guide.abandoned` | User closes guide early | guide_id, last_step_index, time_spent_ms |
| `tooltip.shown` | Tooltip displayed | tooltip_id, target_selector |
| `tooltip.clicked` | User clicks tooltip CTA | tooltip_id, action |
| `beacon.shown` | Beacon displayed | beacon_id |
| `beacon.clicked` | User clicks beacon | beacon_id |
| `beacon.dismissed` | User dismisses beacon | beacon_id |
| `tasklist.viewed` | Task list opened | tasklist_id |
| `tasklist.task.completed` | Task marked done | tasklist_id, task_index |
| `tasklist.completed` | All tasks done | tasklist_id, total_time_ms |
| `announcement.shown` | Announcement displayed | announcement_id |
| `announcement.cta_clicked` | User clicks CTA | announcement_id |
| `announcement.dismissed` | User dismisses | announcement_id |
| `help.opened` | Help widget opened | - |
| `help.searched` | User searches | query, results_count |
| `help.result.clicked` | User clicks a result | result_id, result_type |
| `action.executed` | Automation step executed | guide_id, step_index, action_type, success |
| `action.failed` | Automation step failed | guide_id, step_index, error |
| `friction.detected` | Friction signal detected | type (repeated_click/long_dwell/error), element, page_url |

### Event collection
```typescript
// Client-side: batch events, send every 5 seconds or on page unload
const eventQueue: AnalyticsEvent[] = [];

function trackEvent(event: AnalyticsEvent) {
  eventQueue.push({ ...event, timestamp: Date.now(), session_id: sessionId, user_id: userId });
  if (eventQueue.length >= 20) flushEvents();
}

function flushEvents() {
  if (eventQueue.length === 0) return;
  const batch = eventQueue.splice(0);
  navigator.sendBeacon('/api/v1/widget/event', JSON.stringify(batch));
}

// Flush on unload
window.addEventListener('beforeunload', flushEvents);
// Flush every 5 seconds
setInterval(flushEvents, 5000);
```

### Backend storage
New model: `GuideAnalyticsEvent`
```python
class GuideAnalyticsEvent(Base):
    __tablename__ = "guide_analytics_events"
    
    id = Column(String(16), primary_key=True, default=gen_suffix)
    project_id = Column(String(16), ForeignKey("projects.id"), index=True)
    event_type = Column(String(50), nullable=False, index=True)
    
    # Context
    guide_id = Column(String(16), nullable=True, index=True)
    step_index = Column(Integer, nullable=True)
    widget_id = Column(String(16), nullable=True)
    
    # User
    user_external_id = Column(String(255), nullable=True, index=True)
    user_email = Column(String(255), nullable=True)
    user_role = Column(String(100), nullable=True)
    session_id = Column(String(64), nullable=True, index=True)
    
    # Data
    data = Column(JSON, nullable=True)  # Event-specific payload
    
    # Page context
    page_url = Column(String(1024), nullable=True)
    
    # Timing
    created_at = Column(DateTime, server_default=func.now(), index=True)
```

### Analytics Dashboard

New page: `/projects/{projectId}/analytics`

#### Overview Cards
```
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│  Active Guides   │  │  Completion Rate │  │  Users Guided    │  │  Self-Healing    │
│       24         │  │      78.3%       │  │     1,247        │  │   96.2% success  │
│  ↑ 3 this week   │  │  ↑ 4.2% vs last │  │  ↑ 156 this week │  │   43 recoveries  │
└──────────────────┘  └──────────────────┘  └──────────────────┘  └──────────────────┘
```

#### Guide Performance Table
```
Guide Name              | Views | Completions | Rate  | Avg Time | Drop-off Step
─────────────────────────────────────────────────────────────────────────────────
Create Opportunity      | 342   | 287         | 83.9% | 2m 14s   | Step 4 (Stage)
Submit Expense Report   | 198   | 156         | 78.8% | 3m 01s   | Step 7 (Receipt)
New Employee Onboarding | 89    | 71          | 79.8% | 8m 45s   | Step 3 (Benefits)
```

#### Step Funnel (per guide)
```
Step 1: Navigate to page     ████████████████████████████████ 342 (100%)
Step 2: Click "New"          ██████████████████████████████   318 (93%)
Step 3: Fill Opportunity Name ████████████████████████████    305 (89%)
Step 4: Select Stage          ████████████████████████        287 (84%) ← Drop-off
Step 5: Set Close Date        ███████████████████████         279 (82%)
Step 6: Click Save            ███████████████████████         275 (80%)
✓ Completed                   ███████████████████████         275 (80%)
```

#### Self-Healing Report
```
Date       | Guide                 | Step | Original Selector        | New Selector           | Method
───────────────────────────────────────────────────────────────────────────────────────────────────
Mar 22     | Create Opportunity    | 4    | .slds-combobox__input    | [data-aura-class="ui…  | LLM
Mar 21     | Submit Expense        | 7    | #receipt-upload          | [name="receipt_file"]   | role+text
Mar 20     | Employee Onboarding   | 3    | .benefits-selector       | [aria-label="Select …  | aria
```

#### Friction Points
```
Top Friction Signals This Week:
1. 🔴 Repeated clicks on "Submit" button (23 users) — /expenses/new
   → Users clicking before form validation passes
2. 🟡 Long dwell on "Cost Center" field (avg 45s, 67 users) — /po/create  
   → Consider adding a tooltip with cost center lookup
3. 🟡 Element not found: Step 4 of "Approve Invoice" (12 occurrences)
   → UI changed in last release, self-healing fixed it
```

### Backend endpoints
```
GET  /api/v1/analytics/overview?project_id=...&period=7d
GET  /api/v1/analytics/guides?project_id=...&period=7d
GET  /api/v1/analytics/guide/:id/funnel?period=7d
GET  /api/v1/analytics/guide/:id/steps?period=7d
GET  /api/v1/analytics/self-healing?project_id=...&period=7d
GET  /api/v1/analytics/friction?project_id=...&period=7d
POST /api/v1/analytics/export?format=csv
```

---

## 3. Audience Targeting & Segmentation

### Segment definition
```json
{
  "id": "seg_new_sales",
  "name": "New Sales Reps",
  "rules": [
    { "field": "role", "operator": "equals", "value": "sales_rep" },
    { "field": "created_at", "operator": "within_days", "value": 90 },
    { "field": "custom.region", "operator": "in", "value": ["EMEA", "APAC"] }
  ],
  "match": "all"  // "all" (AND) or "any" (OR)
}
```

### Trigger rules (when to show content)
```json
{
  "trigger_type": "url_match",      // URL pattern matches
  "trigger_type": "element_visible", // Specific element appears on page
  "trigger_type": "first_visit",     // First time user visits this page
  "trigger_type": "time_on_page",    // After N seconds on page
  "trigger_type": "scroll_depth",    // User scrolled past N%
  "trigger_type": "event",           // Custom event fired
  "trigger_type": "schedule",        // Between date range
  "trigger_type": "manual"           // Only via API/button click
}
```

### Display frequency
```json
{
  "frequency": "once",           // Show once per user, ever
  "frequency": "once_per_session", // Once per browser session
  "frequency": "once_per_day",   // Max once per day
  "frequency": "always",         // Every time trigger fires
  "frequency": "until_completed" // Until user completes the guide
}
```

### Backend
New model: `ContentRule`
```python
class ContentRule(Base):
    __tablename__ = "content_rules"
    
    id = Column(String(16), primary_key=True)
    project_id = Column(String(16), ForeignKey("projects.id"))
    
    content_type = Column(String(20))  # guide, tooltip, beacon, tasklist, announcement
    content_id = Column(String(16))    # ID of the guide/tooltip/etc.
    
    # Targeting
    segment_ids = Column(JSON)         # List of segment IDs (AND)
    trigger = Column(JSON)             # Trigger rule definition
    frequency = Column(String(20))     # Display frequency
    priority = Column(Integer, default=0)  # Higher = shown first
    
    # Schedule
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())
```

### Admin UI
New page: `/projects/{projectId}/targeting`

Visual rule builder where admins can:
- Create segments (role-based, attribute-based, behavioral)
- Assign guides/widgets to segments
- Set trigger rules (URL match, element visible, schedule)
- Set display frequency
- Preview who would see what

---

## 4. Content Management

### Admin UI enhancements

#### Guide Builder (upgrade current workflow editor)
```
┌─────────────────────────────────────────────────────────────────┐
│ Guide: Create Salesforce Opportunity                    [Publish]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: Navigate to Opportunities    [click] [type] [navigate] │
│  ┌────────────────────────────────────┐                        │
│  │ 🖼 Screenshot                      │  Title: Go to Opps     │
│  │                                    │  Target: .nav-item[...]  │
│  │                                    │  Action: click           │
│  │     [🔵 highlighted element]       │  Content: Click the...   │
│  │                                    │                          │
│  └────────────────────────────────────┘  [Test] [Edit Selector] │
│                                                                 │
│  Step 2: Click "New Opportunity"                                │
│  ┌────────────────────────────────────┐                        │
│  │ 🖼 Screenshot                      │  ...                    │
│  └────────────────────────────────────┘                        │
│                                                                 │
│  + Add Step  |  + Add Tooltip  |  + Add Branch                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Targeting: New Sales Reps (EMEA)  |  Trigger: URL matches /opp* │
│ Frequency: Until completed        |  Priority: High              │
└─────────────────────────────────────────────────────────────────┘
```

#### Tooltip Manager
List view of all standalone tooltips with:
- Target element preview
- Content
- Assigned segments
- View count / click-through rate

#### Beacon Manager
Same pattern as tooltips.

#### Task List Manager
Visual builder for onboarding checklists:
- Drag-drop reorder tasks
- Link each task to a guide
- Set completion criteria (guide finished, URL visited, custom event)
- Preview task list widget

#### Announcement Manager
Create announcements with:
- Title, body (rich text), image
- CTA button → start guide or open URL
- Schedule (start/end date)
- Target segments
- Display frequency

---

## 5. Deployment Settings

### Admin page: `/projects/{projectId}/settings/deployment`

```
┌─────────────────────────────────────────────────────────────────┐
│ Deployment Method                                                │
│                                                                 │
│ ○ Chrome Extension                                              │
│   Team members install the stept extension. Best for:           │
│   cross-domain workflows, desktop app guidance, full features.  │
│   [Copy Extension Install Link]                                 │
│                                                                 │
│ ● JavaScript Snippet                                            │
│   Add one line of code to your application. Best for:           │
│   web apps, no user install needed, IT-managed deployment.      │
│                                                                 │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │ <script src="https://stept.company.com/widget/v1/       │ │
│   │   stept-widget.js" data-project="proj_abc123"            │ │
│   │   data-api-key="pk_live_xxx" async></script>             │ │
│   └──────────────────────────────────────────────────────────┘ │
│   [Copy to Clipboard]                                           │
│                                                                 │
│   Allowed Domains: [stept.company.com, app.salesforce.com]     │
│   [+ Add Domain]                                                │
│                                                                 │
│ ○ Both (Extension + Snippet)                                    │
│   Extension users get full features. Snippet users get guides   │
│   and widgets. Extension auto-disables on pages with snippet.   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ User Identity                                                    │
│                                                                 │
│ ○ Anonymous (no user tracking)                                  │
│ ● Identified (pass user info via window.steptSettings)          │
│   [View Integration Code ▼]                                     │
│                                                                 │
│ SSO Auto-Identify: ✅ Enabled                                   │
│   User role mapped from: OIDC claim "role"                      │
│   Department from: OIDC claim "department"                      │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ Content Security                                                 │
│                                                                 │
│ □ Require HTTPS                                                 │
│ □ Restrict to allowed domains only                              │
│ □ PII redaction in analytics events                             │
│ □ Disable automation features (guide-only mode)                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Feature Gating (Open Source vs Enterprise)

### Open Source (free forever)
- ✅ Recording (Chrome extension + Desktop)
- ✅ Walkthrough guides (guide-runtime)
- ✅ Document editor
- ✅ Search (full-text + semantic)
- ✅ Public sharing / embedding
- ✅ MCP server
- ✅ Self-hosted deployment
- ✅ Basic analytics (guide completion counts)
- ✅ 1 project, unlimited workflows
- ✅ API access

### Team ($15/user/month)
- Everything in Open Source, plus:
- ✅ Multiple projects
- ✅ SSO (OIDC/SAML)
- ✅ Tooltips, beacons, task lists
- ✅ Help widget
- ✅ Announcements
- ✅ Basic audience targeting (role-based)
- ✅ Audit logging
- ✅ Slack/Teams integration
- ✅ Priority support

### Enterprise ($40/user/month or custom)
- Everything in Team, plus:
- ✅ JS embed script deployment
- ✅ Advanced analytics (funnels, friction detection, self-healing reports)
- ✅ Advanced segmentation (behavioral, attribute-based)
- ✅ Automation / execute mode
- ✅ Intercom/Zendesk integration
- ✅ Custom branding & white-label
- ✅ SCIM provisioning
- ✅ Data export API
- ✅ SLA guarantees
- ✅ Dedicated support

---

## Implementation Priority (Build Order)

| # | Feature | Effort | Revenue Impact | Build After |
|---|---------|--------|----------------|-------------|
| 1 | Self-healing element recovery | 3 weeks | HIGH — key differentiator | Now |
| 2 | JS embed script (basic) | 2 weeks | HIGH — enterprise requirement | Phase 1 |
| 3 | Analytics event collection | 2 weeks | HIGH — CIO needs metrics | Phase 2 |
| 4 | Analytics dashboard | 2 weeks | HIGH — ties into sales pitch | Phase 3 |
| 5 | Tooltips & beacons | 1 week | MEDIUM — feature checklist | Phase 1 |
| 6 | Task lists | 1 week | MEDIUM — onboarding use case | Phase 5 |
| 7 | Help widget | 1 week | MEDIUM — self-service support | Phase 5 |
| 8 | Audience targeting | 2 weeks | HIGH — required for org-wide | Phase 4 |
| 9 | Announcements | 1 week | LOW — nice to have | Phase 6 |
| 10 | Friction detection | 3 weeks | HIGH — premium feature | Phase 4 |
| 11 | Content management UI | 2 weeks | MEDIUM — admin needs this | Phase 8 |
| 12 | Deployment settings page | 1 week | MEDIUM — config UI | Phase 2 |
| 13 | Execute mode (hidden) | 2 weeks | FUTURE — automation premium | Phase 1 |
| 14 | Action execution (browser-use level) | 3 weeks | FUTURE — hidden capability | Phase 1 |
