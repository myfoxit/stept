# Ondoki v2 — Features That Crush the Competition

> Last updated: 2026-02-11  
> 30 features organized by theme. Each with technical approach and effort estimate.  
> Competitors referenced: Scribe ($29/user/mo), Tango ($20/user/mo), Guidde ($20/user/mo)

---

## Theme 1: AI-Native Intelligence

These features are impossible without deep LLM integration. Competitors would need to rebuild from scratch.

---

### 1. ✦ Process Intent Detection

**Pitch**: Ondoki doesn't just record clicks — it understands *what you're trying to accomplish*.

**Description**: Instead of "Clicked at (2896, 702) in 003_add_embeddings.py", Ondoki detects the **intent**: "Editing a database migration file to add an embeddings table." It groups related steps into logical phases: "Setting up the database schema → Writing the migration → Testing the migration." This creates a hierarchy: Process → Phases → Steps.

**Technical Approach**:
- After recording completes, send full step sequence (titles + screenshots + window context) to LLM as a batch
- Prompt: "Analyze this sequence of actions. Identify the high-level process, break it into logical phases, and give each phase a name and description."
- Store as `phase` field on steps + new `ProcessPhase` model
- Frontend: collapsible phase headers above step groups
- Bonus: Compare intents across workflows to find related processes

**Effort**: M (2-3 days)  
**Competitive Impact**: 🔥🔥🔥 — No competitor understands intent. They all just screenshot.

---

### 2. ✦ Workflow Optimizer

**Pitch**: "You did this in 12 steps, but it could be done in 4."

**Description**: AI analyzes recorded workflows and suggests optimizations: redundant steps, unnecessary navigation, faster keyboard shortcuts, bulk operations instead of repetitive clicking. Shows a side-by-side "your way vs. optimized way."

**Technical Approach**:
- New AI tool: `optimize_workflow` — sends full step sequence to LLM
- Prompt includes: step descriptions, timestamps, window context, action types
- LLM returns: redundant steps (with reason), suggested shortcuts, alternative approaches
- Frontend: "Optimization Report" panel on workflow view — red highlights on redundant steps, green suggestions inline
- Track optimization score (1-100) per workflow

**Effort**: M (2-3 days)  
**Competitive Impact**: 🔥🔥🔥🔥 — Nobody does this. It turns Ondoki from documentation tool into productivity tool.

---

### 3. ✦ Smart Diff — Stale Workflow Detection

**Pitch**: When software updates, Ondoki tells you which guides are outdated.

**Description**: Record a workflow once. Months later, the software UI changes. Ondoki can re-verify workflows by comparing current screenshots against recorded ones, detecting UI changes that invalidate steps. Flags stale guides with "Step 3 may be outdated — the button moved from the top toolbar to the sidebar."

**Technical Approach**:
- Desktop app: "Verify workflow" mode — replays step locations, takes fresh screenshots
- Vision LLM: Compare original vs. current screenshot for each step
- Prompt: "Here are two screenshots of the same step. The first is from the original recording, the second is current. Describe any UI changes that would affect the instructions."
- Status per step: ✅ Current | ⚠️ Changed | ❌ Missing
- Batch verify all workflows on schedule (enterprise feature)

**Effort**: L (4-5 days)  
**Competitive Impact**: 🔥🔥🔥🔥🔥 — This is a **KILLER** enterprise feature. No competitor has it. Documentation rot is the #1 pain point.

---

### 4. ✦ Conversational Workflow Builder

**Pitch**: "Record a workflow by describing it to AI, not by doing it."

**Description**: User types "Show me how to create a new project in Jira, assign it to the marketing team, and set the deadline to next Friday." Ondoki's AI generates a step-by-step guide with placeholder screenshots (or real ones if the app is connected), which the user can then verify/correct.

**Technical Approach**:
- New chat tool: `generate_workflow_from_description`
- LLM generates structured steps: title, description, expected UI element, expected window
- Creates `ProcessRecordingSession` with generated steps (no screenshots initially)
- Frontend: "Fill in screenshots" mode — user follows the guide and captures real screenshots per step
- Hybrid: AI generates, human verifies

**Effort**: M (3-4 days)  
**Competitive Impact**: 🔥🔥🔥 — Reverses the recording paradigm. Documentation-first instead of action-first.

---

### 5. ✦ Cross-Workflow Knowledge Graph

**Pitch**: Workflows aren't isolated — "Deploy to staging" is a prerequisite for "Run E2E tests."

**Description**: AI automatically detects relationships between workflows: prerequisites, alternatives, related processes. Visualized as an interactive graph. "Before you can do X, you need to do Y." 

**Technical Approach**:
- On workflow create/update, extract entities (app names, feature areas, action types) via LLM
- Store in `workflow_relationships` table (source_id, target_id, relationship_type: prerequisite|alternative|related)
- Relationship detection: compare entity overlap + LLM judgment
- Frontend: D3.js force-directed graph visualization
- Chat integration: "What do I need to do before deploying?" → follows prerequisite chain

**Effort**: L (4-5 days)  
**Competitive Impact**: 🔥🔥🔥 — Transforms isolated docs into a connected knowledge base.

---

### 6. ✦ AI-Powered Multi-Language Translation

**Pitch**: Record once, publish in 50 languages.

**Description**: One click translates an entire workflow — titles, descriptions, guide text, annotations — into any target language. Not just Google Translate — LLM translation that understands UI terminology ("Einstellungen" not "Rahmen" for "Settings").

**Technical Approach**:
- New endpoint: `POST /workflow/{id}/translate` with `target_language` parameter
- Send all text content to LLM in batches (titles, descriptions, guide markdown)
- Prompt: "Translate this software tutorial. Preserve technical terms and UI element names that should remain in English. Use natural, fluent [language]."
- Store translations in `workflow_translations` table (workflow_id, language, field, translation)
- Frontend: Language switcher on workflow view

**Effort**: M (2-3 days)  
**Competitive Impact**: 🔥🔥🔥 — Guidde has TTS in 50 languages but not text translation. Scribe/Tango don't translate at all.

---

## Theme 2: Recording Intelligence

---

### 7. ✦ Chrome Extension — Web Recording Without Desktop

**Pitch**: Record any web process without installing a desktop app.

**Description**: Lightweight Chrome extension that captures DOM interactions (clicks, typing, navigation) with automatic screenshots. Uploads directly to Ondoki web. Covers 80% of use cases without a desktop app.

**Technical Approach**:
- Chrome Extension Manifest V3
- Content script: MutationObserver + event listeners (click, input, navigation)
- Background script: `chrome.tabs.captureVisibleTab()` for screenshots
- Smart element identification: CSS selector + ARIA label + text content + XPath
- Upload to existing `/session/create` → `/session/{id}/steps` → `/session/{id}/image` API
- Auto-detect meaningful actions (ignore scrolls, hovers)

**Effort**: L (5-7 days)  
**Competitive Impact**: 🔥🔥🔥🔥🔥 — This is **table stakes**. Scribe and Tango are Chrome-extension-first. Not having this is Ondoki's biggest gap.

---

### 8. ✦ Copilot Mode — Proactive Recording Suggestions

**Pitch**: AI watches you work and says "Want me to record this? Looks like you're setting up a new environment."

**Description**: Desktop app runs in background monitoring mode. When it detects a sequence of actions that looks like a process worth documenting (e.g., navigating through settings, filling forms, deploying), it pops a subtle notification: "It looks like you're configuring SSO. Want me to capture this as a workflow?"

**Technical Approach**:
- Desktop: lightweight background monitor — window title changes + app switches (no screenshots yet)
- Every N seconds, send recent activity summary to local LLM (Ollama) or cloud
- Prompt: "Here are the last 20 window switches. Is the user performing a documentable process? If yes, what is it?"
- If yes: show toast notification with "Start Recording" button, pre-filled title
- Privacy: only window titles sent to LLM in monitoring mode, no screenshots

**Effort**: L (4-5 days)  
**Competitive Impact**: 🔥🔥🔥🔥 — Nobody has proactive recording. Every competitor requires manual start/stop.

---

### 9. ✦ Smart Region Capture

**Pitch**: Automatically crop screenshots to the relevant UI element, not the entire screen.

**Description**: Instead of full-screen screenshots that require manual cropping, Ondoki uses the click coordinates + window metadata to automatically crop to the relevant panel/dialog/form. Shows the context but focuses on what matters.

**Technical Approach**:
- Desktop: Already captures click coordinates + window rect
- Add UI Automation tree query at click point → get containing element bounds
- Crop screenshot to element bounds + padding (context margin)
- Store both full screenshot and cropped version
- Frontend: Show cropped by default, "Show full screen" toggle
- Fallback: If element detection fails, use rule-based crop (center on click, 800x600 window)

**Effort**: M (2-3 days)  
**Competitive Impact**: 🔥🔥 — Scribe does basic annotation but not smart cropping. Tango has it partially.

---

### 10. ✦ Keyboard Sequence Recording

**Pitch**: Capture keyboard shortcuts and typed text as first-class steps.

**Description**: Current recording captures mouse clicks. Add intelligent keyboard recording: detect when user types a command, enters data into a form, or uses a keyboard shortcut (Ctrl+S, Cmd+K). Show these as distinct step types with proper visualization.

**Technical Approach**:
- Desktop: `GlobalHooks.cs` already captures keyboard events
- Group keypresses into sequences: shortcuts (Ctrl+C) vs. text entry ("hello world") vs. navigation (Tab, Enter)
- New step types: `keyboard_shortcut`, `text_entry`, `keyboard_navigation`
- Frontend: Render keyboard steps with key cap visuals (like `⌘` + `K`)
- Filter noise: ignore single modifier key presses, typing in already-captured text fields

**Effort**: M (2-3 days)  
**Competitive Impact**: 🔥🔥 — Tango captures keyboard partially. Proper visualization is rare.

---

### 11. ✦ Video Walkthrough Generation

**Pitch**: Turn step screenshots into narrated video walkthroughs with AI voiceover.

**Description**: Upload your workflow. Ondoki generates an MP4 video: animated transitions between screenshots, click point animations, zoom effects on relevant areas, AI-narrated voiceover explaining each step. Export as MP4, GIF, or embed.

**Technical Approach**:
- Backend: FFmpeg pipeline — stitch screenshots with transitions
- Click animation: Ken Burns zoom to click point, green circle pulse
- Voiceover: TTS API (ElevenLabs/OpenAI TTS) from generated step descriptions
- Narration script: LLM generates natural narration from step titles + descriptions
- Output: MP4 (full), GIF (short loops per step), WebM (embedded)
- Endpoint: `POST /workflow/{id}/generate-video` → Celery task → returns download URL

**Effort**: XL (7-10 days)  
**Competitive Impact**: 🔥🔥🔥🔥🔥 — Guidde's core feature is video. Beating them at their own game with AI-generated video from screenshots would be massive.

---

## Theme 3: Enterprise & Collaboration

---

### 12. ✦ Automatic PII Redaction in Screenshots

**Pitch**: Record freely — Ondoki automatically blurs sensitive data before sharing.

**Description**: Using vision LLM or on-device ML, automatically detect and blur: email addresses, names, account numbers, SSNs, passwords, API keys visible in screenshots. Configurable sensitivity levels. Works on capture (desktop) or upload (web).

**Technical Approach**:
- Vision LLM: Send screenshot with prompt "Identify all PII visible in this screenshot. Return bounding boxes as JSON [{label, x, y, width, height}]."
- Apply blur filter to identified regions using Pillow (backend) or canvas (desktop)
- Store original (encrypted) + redacted versions separately
- Enterprise: enforce "always redact" policy per project
- Bonus: integrate with DataVeil for text content redaction

**Effort**: L (4-5 days)  
**Competitive Impact**: 🔥🔥🔥🔥 — Tango has "Secure Blur" as premium feature. Guidde has manual + magic redaction. LLM-powered is more accurate.

---

### 13. ✦ Interactive Guided Walkthroughs (Replay Engine)

**Pitch**: Don't just show a guide — walk users through the actual software step by step.

**Description**: The Ondoki desktop app already has `HighlightOverlay.xaml`. Extend this into a full WalkMe-style replay engine: highlight the target element, show a floating instruction card, wait for user to complete the action, then advance. In-app training, not just documentation.

**Technical Approach**:
- Desktop already has: UI Automation tree walking, element highlighting, overlay windows
- Add: Step-by-step replay mode — show instruction card at element position
- Element re-discovery: Multi-strategy cascade (tree path → property match → anchor-relative → text search)
- Validation: Detect when user completes the step (click on correct element)
- Progress: Show step X of Y, allow skip, allow restart
- Web version: Browser extension overlays highlights on web apps

**Effort**: L (5-7 days — desktop foundation exists, needs polish + web extension)  
**Competitive Impact**: 🔥🔥🔥🔥🔥 — Tango has basic guided walkthroughs. WalkMe charges $10K+/year. Building this into Ondoki is a game-changer.

---

### 14. ✦ Embeddable Help Widget

**Pitch**: Like Intercom, but answers "how do I..." with actual recorded workflows.

**Description**: JavaScript widget that embeds in any web app. End users type a question → Ondoki's RAG searches recorded workflows → shows relevant step-by-step guide inline. No context switch to a docs site.

**Technical Approach**:
- Embeddable `<script>` tag + iframe widget
- Public API: `GET /api/public/search?q=...&project_key=...` (API key auth, read-only)
- Returns matched workflows with step summaries + images
- Widget renders as floating panel (like Intercom/Zendesk)
- Optional: link to full workflow view
- Analytics: track which queries get asked, which workflows get viewed

**Effort**: L (4-5 days)  
**Competitive Impact**: 🔥🔥🔥🔥 — No competitor has an embeddable self-service widget. This is a whole new distribution channel.

---

### 15. ✦ Version History & Change Tracking

**Pitch**: See every change to every workflow, roll back any time.

**Description**: Git-like version history for workflows. Every edit creates a version. Diff view shows what changed between versions. One-click rollback. Required for enterprise compliance.

**Technical Approach**:
- New table: `workflow_version` (workflow_id, version_number, metadata_snapshot JSON, changed_by, created_at)
- On every update (step add/delete/reorder/rename), snapshot current state
- Diff: JSON diff of metadata arrays → highlight added/removed/modified steps
- Frontend: Version history sidebar, diff view (side-by-side step comparison)
- Rollback: Restore metadata snapshot from version

**Effort**: M (3-4 days)  
**Competitive Impact**: 🔥🔥🔥 — Tango has 14-365 day version history (paid tiers only).

---

### 16. ✦ Team Collaboration — Comments & Reviews

**Pitch**: Comment on individual steps, request changes, approve workflows before publishing.

**Description**: Per-step commenting with @mentions. Review flow: Draft → In Review → Approved → Published. Notifications when someone comments or approves.

**Technical Approach**:
- New tables: `comment` (step_id, user_id, text, created_at), `workflow_review` (workflow_id, reviewer_id, status, comment)
- WebSocket notifications for real-time updates
- Frontend: Comment bubbles on step cards, review status banner, notification badge
- Email notifications for assigned reviews

**Effort**: M (3-4 days)  
**Competitive Impact**: 🔥🔥🔥 — Table stakes for team plans. Scribe has comments. Tango has comments + reactions.

---

### 17. ✦ SSO & SCIM (Enterprise Gate)

**Pitch**: Enterprise-grade identity management.

**Description**: SAML 2.0 / OIDC SSO for enterprise login. SCIM for automated user provisioning/deprovisioning. Required for any enterprise deal >$10K.

**Technical Approach**:
- SSO: python-saml2 or authlib for SAML/OIDC
- SCIM: `/scim/v2/Users` and `/scim/v2/Groups` endpoints per RFC 7644
- Map external groups to Ondoki project roles
- Auto-deprovision: disable user when removed from IdP

**Effort**: L (5-7 days)  
**Competitive Impact**: 🔥🔥🔥 — Enterprise gate feature. Tango charges custom pricing for SSO.

---

### 18. ✦ Custom Branding & White-Label

**Pitch**: Your logo, your colors, your domain.

**Description**: Per-project branding: logo, primary color, favicon, custom domain. All exports and shared links carry the brand. White-label option removes Ondoki branding entirely.

**Technical Approach**:
- `project_branding` table: logo_url, primary_color, favicon_url, custom_domain
- CSS custom properties injected per project
- Export templates use branding config
- Custom domain: nginx proxy pass based on Host header → project lookup

**Effort**: M (3-4 days)  
**Competitive Impact**: 🔥🔥 — All competitors charge for this. Standard enterprise feature.

---

## Theme 4: Developer Experience

---

### 19. ✦ Workflows as Code (API-First)

**Pitch**: Create, update, and query workflows programmatically. Docs-as-code.

**Description**: Full REST API + CLI tool. CI/CD integration: automatically update documentation when code changes. Import/export workflows as YAML/JSON. Version control workflows in git alongside code.

**Technical Approach**:
- API already exists (90+ endpoints) — needs cleanup, versioning, API key auth for automation
- New: `ondoki` CLI tool (Go or Node) — `ondoki push`, `ondoki pull`, `ondoki verify`
- YAML workflow format: human-readable, git-diffable
- GitHub Action: `ondoki-verify` — run on PR to check if affected workflows are still valid
- Webhook: notify on workflow changes

**Effort**: L (5-7 days for CLI + GitHub Action)  
**Competitive Impact**: 🔥🔥🔥🔥 — No competitor has a CLI or CI/CD integration. Developer teams would love this.

---

### 20. ✦ Auto-Generate Docs from Code Changes

**Pitch**: PR changes `UserSettings.tsx`? Ondoki flags which workflows reference the settings page.

**Description**: Connect Ondoki to a GitHub repo. When a PR changes files, Ondoki analyzes which recorded workflows might be affected (based on window titles, URL patterns, UI element names). Creates a comment on the PR: "These 3 workflows may need updating."

**Technical Approach**:
- GitHub App: receive PR webhooks
- Extract changed file paths + component names from diff
- Match against workflow step metadata: window_title, description, ui_element
- LLM judgment: "This code change affects the user settings page. Workflow 'Configure SSO' has 3 steps in user settings."
- Post PR comment with affected workflows + links

**Effort**: L (4-5 days)  
**Competitive Impact**: 🔥🔥🔥🔥🔥 — This is genuinely novel. No documentation tool connects to source code.

---

### 21. ✦ API Playground & SDK

**Pitch**: Interactive API docs + client libraries for Python, JS, Go.

**Description**: Swagger UI is basic. Build an interactive API playground (like Stripe's) with live examples, code generation, and pre-filled authentication. Auto-generated SDKs.

**Technical Approach**:
- OpenAPI spec already auto-generated by FastAPI
- Playground: Custom React app using the OpenAPI spec
- SDKs: openapi-generator for Python, TypeScript, Go clients
- Publish as npm/pip/go packages

**Effort**: M (3-4 days)  
**Competitive Impact**: 🔥🔥 — Developer-focused differentiator.

---

## Theme 5: Content Generation & Distribution

---

### 22. ✦ Workflow Templates Marketplace

**Pitch**: Start from a template instead of a blank recording.

**Description**: Community-contributed and curated workflow templates. "How to set up a Jira project", "How to configure AWS S3 bucket", "How to onboard a new employee in BambooHR". Users can fork templates and customize.

**Technical Approach**:
- `workflow_template` table: workflow_id, category, tags, is_public, fork_count, rating
- Template gallery page with search/filter
- "Use this template" → creates a copy in user's project
- Optional: public API for template submissions + review queue

**Effort**: M (3-4 days)  
**Competitive Impact**: 🔥🔥🔥 — Creates network effects. More users = more templates = more value.

---

### 23. ✦ Multi-Format Export — PPT, Notion, Confluence

**Pitch**: Export anywhere your team already works.

**Description**: Beyond Markdown/HTML/PDF/DOCX, add: PowerPoint (step per slide with screenshot + instruction), Notion page (via API), Confluence page (via API), Google Docs. Direct publish, not just download.

**Technical Approach**:
- PPT: python-pptx — one slide per step, screenshot on left, instruction on right
- Notion: Notion API — create page with blocks (image + text per step)
- Confluence: Confluence REST API — create page with XHTML content
- Google Docs: Google Docs API — insert images + paragraphs
- Frontend: "Publish to..." dropdown with OAuth connections per service

**Effort**: L (1-2 days per integration, 5-7 days total)  
**Competitive Impact**: 🔥🔥🔥 — Scribe exports to PDF/HTML/Markdown only. Direct Notion/Confluence publish is premium value.

---

### 24. ✦ AI-Generated FAQ from Workflows

**Pitch**: Automatically generate FAQ sections from your recorded processes.

**Description**: LLM analyzes all workflows in a project and generates a FAQ: "How do I reset my password?" → links to the relevant workflow. "What's the difference between project and workspace?" → synthesized from multiple workflows.

**Technical Approach**:
- Batch analysis: send all workflow summaries to LLM
- Prompt: "Based on these recorded processes, generate a FAQ. Each Q&A should reference the relevant workflow(s)."
- Store as a special document type with workflow references
- Auto-update when workflows change
- Embeddable in the help widget (Feature #14)

**Effort**: M (2-3 days)  
**Competitive Impact**: 🔥🔥🔥 — Unique. Turns recordings into a self-maintaining knowledge base.

---

### 25. ✦ Shareable Interactive Guides (No Login Required)

**Pitch**: Share a link that walks someone through the process interactively, not just a static page.

**Description**: Current share is a static workflow view. Make it interactive: step-by-step progression, click to advance, zoom animations to click points, keyboard navigation, progress bar. No login required. Tracks completion.

**Technical Approach**:
- New public route: `/s/{share_token}` — no auth required
- Interactive viewer: one step at a time, animated transitions, auto-zoom to click point
- Progress: step indicator, keyboard arrows, swipe on mobile
- Analytics: track completion rate, drop-off point, time per step
- Embeddable via iframe

**Effort**: M (3-4 days)  
**Competitive Impact**: 🔥🔥🔥 — Current share is static. Interactive + analytics = premium feature.

---

## Theme 6: Analytics & Insights

---

### 26. ✦ Process Analytics Dashboard

**Pitch**: Which processes are most documented? Where do people get stuck?

**Description**: Dashboard showing: most viewed workflows, most searched queries, coverage gaps ("Sales Onboarding has 23 workflows, Engineering has 2"), stale workflow alerts, team contribution metrics.

**Technical Approach**:
- Event tracking: log views, searches, shares, exports, completions
- `analytics_event` table: event_type, workflow_id, user_id, metadata JSON, timestamp
- Dashboard: charts (Recharts), metrics cards, trend lines
- Insights: LLM analysis of analytics data → "Your team frequently searches for 'VPN setup' but no workflow exists."

**Effort**: L (4-5 days)  
**Competitive Impact**: 🔥🔥🔥 — Tango has basic viewership analytics. LLM-powered insights are unique.

---

### 27. ✦ Onboarding Progress Tracker

**Pitch**: Assign workflows as onboarding tasks. Track who completed what.

**Description**: Create an "onboarding checklist" from workflows. Assign to new hires. Track completion per person. Manager dashboard: "Alice completed 8/12 workflows, Bob completed 3/12."

**Technical Approach**:
- `onboarding_checklist` (project_id, name, workflow_ids JSON)
- `checklist_assignment` (checklist_id, user_id, assigned_at)
- `checklist_progress` (assignment_id, workflow_id, completed_at)
- Manager view: progress bars per person, overdue alerts
- Integrations: Slack/email notifications for incomplete items

**Effort**: M (3-4 days)  
**Competitive Impact**: 🔥🔥🔥🔥 — Tango has "completion insights" but no structured onboarding tracker. This is a direct enterprise sales feature.

---

### 28. ✦ AI Usage ROI Calculator

**Pitch**: Show how much time Ondoki's AI features saved.

**Description**: Track: manual annotation time saved (estimated from step count × avg manual time), search queries answered by AI, guides auto-generated, workflows optimized. Show dollar value based on team hourly rate.

**Technical Approach**:
- Track all AI feature usage with timestamps and response times
- Estimation model: manual annotation ~2 min/step, manual guide writing ~30 min, search ~5 min per query
- Dashboard: "This month, Ondoki AI saved your team 47 hours ($4,700 at $100/hr)"
- Export as PDF for management reporting

**Effort**: S (2 days)  
**Competitive Impact**: 🔥🔥🔥 — Helps justify the subscription. No competitor quantifies their value.

---

## Theme 7: Privacy & Trust

---

### 29. ✦ DataVeil Deep Integration — Privacy-First AI

**Pitch**: Use cloud LLMs without exposing company data. Privacy by architecture, not policy.

**Description**: All text sent to LLMs passes through DataVeil proxy automatically. Company names, employee names, URLs, IP addresses, API keys visible in screenshots — all obfuscated before hitting OpenAI/Anthropic. Restored transparently in responses. Enterprise customers get AI without the compliance nightmare.

**Technical Approach**:
- DataVeil Go proxy already exists as a separate project
- Bundle as sidecar container in Docker Compose
- Configure LLM gateway to route through DataVeil when enabled
- Admin toggle: "Privacy Proxy: ON/OFF" with visual indicator
- Audit log: what was obfuscated, when, for which request
- Screenshot PII detection: vision model identifies PII regions, DataVeil blurs them

**Effort**: M (3-4 days — integration already partially built)  
**Competitive Impact**: 🔥🔥🔥🔥🔥 — **This is Ondoki's moat.** No competitor has an integrated privacy proxy. Enterprise security teams will love this. It's the answer to "we can't use AI because compliance."

---

### 30. ✦ On-Premise / Air-Gapped Deployment

**Pitch**: Run everything on your own servers. Zero data leaves your network.

**Description**: Ondoki already runs on Docker. Package it for on-premise deployment with Ollama (local LLM) as the default AI provider. No cloud dependency. Everything works offline. 

**Technical Approach**:
- Already supported architecturally (Docker Compose + Ollama provider)
- Need: one-line install script, configuration wizard, health dashboard
- Bundle Ollama container with recommended model (llama3 or similar)
- Documentation: air-gapped deployment guide, model download for offline use
- License: self-hosted license key validation (no phone-home)

**Effort**: M (2-3 days for packaging + docs)  
**Competitive Impact**: 🔥🔥🔥🔥 — Scribe/Tango/Guidde are SaaS-only. Regulated industries (healthcare, finance, government) need on-premise.

---

## Priority Matrix

| # | Feature | Effort | Impact | Priority |
|---|---------|--------|--------|----------|
| 7 | Chrome Extension | L | 🔥🔥🔥🔥🔥 | **DO FIRST** — biggest gap |
| 3 | Smart Diff (Stale Detection) | L | 🔥🔥🔥🔥🔥 | **TOP 3** — killer enterprise feature |
| 13 | Interactive Walkthroughs | L | 🔥🔥🔥🔥🔥 | **TOP 3** — WalkMe competitor |
| 29 | DataVeil Integration | M | 🔥🔥🔥🔥🔥 | **TOP 3** — enterprise moat |
| 11 | Video Walkthroughs | XL | 🔥🔥🔥🔥🔥 | High impact but heavy lift |
| 20 | Docs from Code Changes | L | 🔥🔥🔥🔥🔥 | Novel, developer audience |
| 2 | Workflow Optimizer | M | 🔥🔥🔥🔥 | Quick win, unique |
| 1 | Process Intent Detection | M | 🔥🔥🔥 | Improves everything else |
| 8 | Copilot Mode | L | 🔥🔥🔥🔥 | Unique, wow factor |
| 12 | Auto PII Redaction | L | 🔥🔥🔥🔥 | Enterprise requirement |
| 14 | Embeddable Widget | L | 🔥🔥🔥🔥 | New distribution channel |
| 25 | Interactive Share Links | M | 🔥🔥🔥 | Upgrade free tier value |
| 15 | Version History | M | 🔥🔥🔥 | Enterprise expectation |
| 16 | Comments & Reviews | M | 🔥🔥🔥 | Team plan enabler |
| 27 | Onboarding Tracker | M | 🔥🔥🔥🔥 | Direct enterprise sales |
| 6 | Multi-Language Translation | M | 🔥🔥🔥 | Global market |
| 30 | On-Premise Deployment | M | 🔥🔥🔥🔥 | Regulated industries |
| 19 | Workflows as Code / CLI | L | 🔥🔥🔥🔥 | Developer differentiation |
| 23 | Notion/Confluence Export | L | 🔥🔥🔥 | Integration moat |
| 4 | Conversational Builder | M | 🔥🔥🔥 | Novel, secondary |
| 5 | Knowledge Graph | L | 🔥🔥🔥 | Long-term value |
| 26 | Analytics Dashboard | L | 🔥🔥🔥 | Enterprise expectation |
| 22 | Template Marketplace | M | 🔥🔥🔥 | Network effects |
| 28 | ROI Calculator | S | 🔥🔥🔥 | Sales tool |
| 24 | Auto FAQ | M | 🔥🔥🔥 | Nice-to-have |
| 9 | Smart Region Capture | M | 🔥🔥 | Polish |
| 10 | Keyboard Recording | M | 🔥🔥 | Polish |
| 17 | SSO / SCIM | L | 🔥🔥🔥 | Enterprise gate |
| 18 | Custom Branding | M | 🔥🔥 | Standard premium |
| 21 | API Playground / SDK | M | 🔥🔥 | Developer nice-to-have |

---

## Recommended Build Order (Next 90 Days)

**Month 1 — Foundation + Biggest Gap:**
1. Chrome Extension (web recording) — unlocks 80% of use cases
2. Production hardening (from 02-PRODUCTION-READINESS.md) — P0 security items
3. Interactive Share Links — upgrade the sharing experience

**Month 2 — Enterprise Differentiators:**
4. DataVeil Deep Integration — privacy moat
5. Auto PII Redaction — enterprise requirement  
6. Version History + Comments — team collaboration basics
7. Workflow Optimizer — unique AI feature, quick win

**Month 3 — Killer Features:**
8. Smart Diff (Stale Detection) — nothing else like it on the market
9. Interactive Walkthroughs (Replay Engine) — WalkMe alternative
10. Process Intent Detection — makes everything smarter
11. Video Walkthrough Generation — Guidde killer

After month 3, Ondoki would have features that individually justify $30+/user/month, and a combination no competitor can match.
