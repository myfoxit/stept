# Ondoki — Feature Backlog

Generated: 2025-02-20 — based on full codebase audit.

---

## Currently Implemented (what actually works today)

### ondoki-web (Frontend)
- ✅ User auth (email/password, cookie sessions, JWT for API clients)
- ✅ Project management (create, members, roles: owner/admin/editor/viewer)
- ✅ Folder organization within projects
- ✅ Rich text document editor (TipTap-based, fairly complete)
- ✅ Workflow viewer/editor (step-by-step guides with screenshots)
- ✅ Workflow export: Markdown, HTML, PDF (via Gotenberg), DOCX
- ✅ Search (text + semantic via pgvector embeddings)
- ✅ Document sharing (per-user, public links)
- ✅ Workflow sharing (per-user, public links)
- ✅ Comments system
- ✅ Audit logging
- ✅ Analytics (basic)
- ✅ Knowledge base (file upload + extraction + indexing)
- ✅ Context links between resources
- ✅ MCP server integration (for AI tools)
- ✅ Git export (push pages to GitHub/GitLab/Bitbucket)
- ✅ Inline AI writing assistant (write/summarize/improve/expand/translate)
- ✅ Chat with AI about workflows
- ✅ Pagination in TipTap editor (page breaks, page tracking)
- ✅ Auth provider integration (Copilot token persistence)

### ondoki-web (Backend/API)
- ✅ Full REST API with versioning (/api/v1)
- ✅ PostgreSQL + pgvector for semantic search
- ✅ Redis for rate limiting + caching
- ✅ Celery worker for video processing
- ✅ Alembic migrations (19 versions)
- ✅ Gotenberg integration for PDF generation
- ✅ DataVeil privacy proxy integration (configurable)
- ✅ Docker Compose production setup with Caddy reverse proxy

### ondoki-desktop-electron
- ✅ Screen recording with native hooks (mouse/keyboard capture)
- ✅ Screenshot capture with window detection
- ✅ Smart annotation (AI-powered step descriptions)
- ✅ Auto-upload to cloud
- ✅ Chat interface
- ✅ Settings management
- ✅ LLM setup wizard (OpenAI, Anthropic, Ollama)
- ✅ Guide preview

### ondoki-plugin-chrome
- ✅ Click-based step recording in browser
- ✅ Screenshot capture per step
- ✅ PKCE-based auth flow
- ✅ Project selection
- ✅ Side panel UI
- ✅ Auto-upload to server

### ondoki-cli (Go)
- ✅ Terminal session recording (local + SSH)
- ✅ Session replay
- ✅ Markdown export
- ✅ Browser-based login (PKCE)
- ✅ Auto-upload to server

### ondoki-web/extension (Context Extension)
- ✅ Surface relevant workflows based on current page
- ✅ Basic popup UI

### dataveil
- ✅ PII redaction proxy (separate service)
- ✅ Multi-language support
- ✅ Benchmark suite

---

## Half-Built / Broken (started but not finished)

| Feature | State | Location |
|---------|-------|----------|
| **Step duplication** | TODO comment, handler empty | `app/src/pages/workflow-view.tsx:309` |
| **Guide link update** | TODO comment, not implemented | `app/src/pages/workflow-view.tsx:320` |
| **Component editor pop-over** | TODO placeholder | `app/src/components/Editor/ComponentEditor.tsx:78` |
| **Project invite emails** | Code has TODO, no email sending | `api/app/routers/project.py:184` |
| **Video import processing** | Upload works, processing pipeline (Celery task) unclear if complete | `api/app/routers/video_import.py`, `video-worker/` |
| **Confluence export** | Endpoint exists, unclear if tested | `api/app/routers/process_recording.py:868` |
| **Notion export** | Endpoint exists, unclear if tested | `api/app/routers/process_recording.py:897` |
| **Auth on process-recording** | Half the endpoints have auth, half don't | `api/app/routers/process_recording.py` |
| **Two config systems** | `config.py` and `core/config.py` both exist, partially overlapping | `api/app/` |

---

## P0 — Table Stakes (must have to compete with Scribe/Tango)

| Feature | Effort | Notes |
|---------|--------|-------|
| **Fix auth on all endpoints** (see PRODUCTION_FIXES.md #1-2) | S | Non-negotiable. Currently anyone can access any workflow. |
| **Team workspace / organization** | M | Scribe has team plans. You have projects with roles — flesh out invites (email actually sends), team dashboard. |
| **Chrome extension polish** | M | Scribe's extension is buttery smooth. Current one is functional but raw. Needs: configurable server URL in options, better step editing, undo. |
| **Workflow templates** | S | Scribe has SOP templates. Add a few built-in templates for common processes. |
| **Step reordering via drag-and-drop** (frontend) | S | API exists (`reorder_steps`), need frontend DnD. |
| **Screenshot annotation/highlighting** | M | Scribe auto-highlights clicked elements. You capture screenshots but don't annotate them in the web UI. Desktop app has it. |
| **Embeddable guides** | M | Scribe lets you embed guides in other apps via iframe/widget. Critical for adoption. Public link exists but no embed snippet. |

## P1 — Differentiators (what could set ondoki apart)

| Feature | Effort | Notes |
|---------|--------|-------|
| **Terminal recording → guide** (already built!) | S | This is unique. Scribe can't do this. Polish the CLI, make the web viewer beautiful. |
| **Self-hosted / on-prem** | S | Already works via Docker Compose. This is your #1 differentiator vs Scribe. Market it hard. |
| **DataVeil / privacy-first AI** | M | PII redaction before sending to LLM. Already integrated. Unique selling point. Finish and document it. |
| **MCP server integration** | S | Already built. AI agents can query your knowledge base. Very forward-thinking. |
| **Video → guide conversion** | L | Upload a screen recording, AI extracts steps. Backend scaffolded, needs processing pipeline. Loom/Scribe don't have this. |
| **Git sync for docs** | S | Already built. Developers love docs-as-code. Market to engineering teams. |
| **Inline AI editor** | S | Already works. Summarize, translate, improve. Solid differentiator if polished. |
| **Desktop app (cross-platform capture)** | M | Records any app, not just browser. Needs polish but foundation is solid. |

## P2 — Nice to Have

| Feature | Effort | Notes |
|---------|--------|-------|
| **Workflow versioning / change history** | M | Track edits over time. Useful for SOPs that evolve. |
| **Slack/Teams integration** | M | Share guides directly in chat. Scribe has this. |
| **Custom branding** | S | White-label guides with customer logos/colors. Enterprise feature. |
| **Workflow analytics** (views, completion) | S | Basic analytics exist. Add per-guide view tracking. |
| **Multi-language guides** | M | AI-powered translation of entire guides. Inline AI already does per-block translation. |
| **Interactive guides / walkthroughs** | L | Step-by-step overlay on actual page (like WalkMe). Very different from static guides. High effort. |
| **API documentation auto-gen** | M | Record API calls → generate API docs. Niche but powerful. |
| **SSO (SAML/OIDC)** | M | Enterprise requirement. Not needed for launch. |

## P3 — Future / Maybe

| Feature | Effort | Notes |
|---------|--------|-------|
| **Mobile app** | XL | Recording on mobile is a different beast. Skip for now. |
| **Workflow automation** (not just documentation) | XL | "Do the steps" not just "document the steps". Different product. |
| **AI-generated test cases from guides** | L | Interesting but niche. |
| **Browser-based screen recording** (no extension needed) | M | WebRTC screen capture. Removes extension install friction but limited capabilities. |

---

## Features to KILL (remove, not worth maintaining)

| Feature | Why |
|---------|-----|
| **ondoki-web/extension (Context Extension)** | Separate from the recording extension, minimal functionality, confusing to have two extensions. Merge useful bits into the main chrome extension. |
| **`init_db()` in database.py** | Uses wrong metadata, never works correctly. You have Alembic. Delete it. |
| **Confluence export** | Unless you've tested it, it's a support burden. Markdown + HTML + PDF + DOCX is plenty. Add Confluence back when someone asks. |
| **Notion export** | Same as Confluence. Remove until there's demand. |
| **`api/app/config.py`** | Duplicate of `core/config.py`. Pick one, kill the other. |

---

## Effort Estimates

- **S** = 1-2 days (single focused dev day)
- **M** = 3-5 days (a working week)
- **L** = 1-2 weeks (meaningful feature work)
- **XL** = 2-4 weeks (major initiative, probably needs design)

---

## Reality Check for Solo Developer

**What Scribe has that you don't (and what matters):**
- ❌ Browser extension auto-highlight of clicked elements → **Matters, M effort**
- ❌ Embeddable guides → **Matters a lot, M effort**
- ❌ Team onboarding workflows → **Matters for enterprise, L effort**
- ❌ Integrations marketplace (Slack, Confluence, Zendesk) → **Nice to have, not launch-blocking**
- ❌ Polish and UX refinement → **Ongoing, never done**

**What you have that Scribe doesn't:**
- ✅ Self-hosted / on-prem → **Huge for privacy-conscious orgs**
- ✅ Terminal recording → **Unique for DevOps/engineering teams**
- ✅ Desktop app (any app, not just browser) → **Broader capture**
- ✅ DataVeil privacy proxy → **Enterprise selling point**
- ✅ MCP/AI integration → **Forward-thinking**
- ✅ Rich document editor (not just guides) → **More than step-by-step**

**Honest assessment:** The product has impressive breadth for a solo developer. The critical issue is that half the backend is effectively unauthenticated. Fix security first, then polish the chrome extension + embeddable guides. That's your launch path. Don't add more features until the existing ones are solid.
