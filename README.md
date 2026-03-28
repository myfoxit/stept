<p align="center">
  <h1 align="center">stept</h1>
  <p align="center">
    Open-source process documentation platform.<br />
    Record workflows. Build guides. Search everything with AI.
  </p>
</p>

<p align="center">
  <a href="https://github.com/myfoxit/stept-web/actions/workflows/ci.yml"><img src="https://github.com/myfoxit/stept-web/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/myfoxit/stept-web/stargazers"><img src="https://img.shields.io/github/stars/myfoxit/stept-web?style=social" alt="GitHub Stars" /></a>
</p>

<!-- TODO: add screenshot -->

---

## What is stept?

**stept** is a self-hosted platform for capturing, organizing, and sharing process documentation. Teams use it to turn screen recordings into step-by-step guides, write rich documents, and build a searchable knowledge base — all enhanced by AI.

- **Capture** workflows from a desktop app or Chrome extension that records clicks, keystrokes, and screenshots
- **Edit** documents in a full-featured rich text editor with slash commands, inline AI, and block-based content
- **Search** across everything using hybrid full-text + semantic vector search with reciprocal rank fusion
- **Collaborate** with team-based projects, role-based access control, sharing, comments, and audit logging
- **Integrate** with external AI agents via the Model Context Protocol (MCP), export to Git, and access via REST API

---

## Features

| | Feature | Description |
|---|---|---|
| 🎬 | **Workflow Recording** | Capture user actions from the [desktop app](https://github.com/myfoxit/stept-desktop) or [Chrome extension](https://github.com/myfoxit/stept-chrome-extension). Each step records a screenshot, click position, window title, and description. |
| 🎯 | **Interactive Guides** | Turn recorded workflows into interactive walkthroughs. The Chrome extension overlays step-by-step highlights directly on the target page using a 6-level element finder cascade (CSS selector → data-testid → ARIA role → tag+text → XPath → parent chain). Shadow DOM isolation prevents style conflicts. |
| 📹 | **Video-to-Guide** | Upload video files (MP4, MOV, AVI, MKV, WEBM) up to 2 GB. Async pipeline extracts key frames, transcribes audio via Whisper, and generates step-by-step workflow guides automatically. |
| 🩺 | **Staleness Detection** | Automatic documentation health monitoring. Four triggers: passive replay feedback (when users run guides), scheduled Playwright verification (headless browser checks on a cron), manual re-run (single or batch), and heuristic age decay. Per-step reliability tracking filters noise from always-broken selectors. Optional LLM verification explains *why* elements changed (e.g. "button renamed to Save Draft"). Health scores (🟢🟡🔴) shown in sidebar, workflow headers, and a project health dashboard. |
| 📝 | **Rich Document Editor** | TipTap-based block editor with slash commands, drag-and-drop, images, code blocks, tables, and multiple page layouts (full, document, A4, letter). |
| 🕰️ | **Version History** | Google Docs-style version history for documents and workflows. Auto-versioning with configurable throttle, side-by-side preview, and one-click restore. |
| 🤖 | **AI-Powered Features** | Inline AI commands (write, summarize, improve, expand, simplify, translate, explain), context-aware chat with function calling, auto-annotation of workflow steps, automatic title/summary/tag generation. |
| 🔍 | **Hybrid Search** | Full-text search (PostgreSQL tsvector) + semantic vector search (pgvector embeddings) combined via RRF ranking. Trigram fallback for typo tolerance. |
| 📚 | **Knowledge Base** | Upload PDFs, DOCX, TXT, and Markdown files. Content is extracted, embedded, and searchable alongside documents and workflows. |
| 🔗 | **Context Links** | Map URL patterns, app names, or window titles to workflows/documents. Regex and exact matching with priority scoring. |
| 🌍 | **Translation** | On-the-fly translation of documents and workflows for public/embed/export views. Powered by configurable LLM provider. |
| 🔊 | **Text-to-Speech** | Movie-mode playback of workflows with TTS narration. Supports Web Speech API (free) or OpenAI TTS (natural voices). Generic narration for action steps (click, type, navigate, scroll). Configurable via `TTS_PROVIDER`. |
| 🖼️ | **Workflow Embeds** | Embed interactive workflows in any website via iframe. Multiple display modes (slides, movie, scroll) configured in a share modal and set via URL parameter. |
| 👥 | **Team Collaboration** | Projects with hierarchical roles (Viewer → Member → Editor → Admin → Owner), per-resource sharing, threaded comments with resolution tracking. |
| 🌐 | **Public Sharing** | Generate share tokens for public read-only access to documents and workflows — no login required. |
| 📊 | **Analytics Dashboard** | Top-accessed resources, usage by channel (web, MCP, API), documentation health overview, search query analysis, knowledge gap identification. |
| 📋 | **Audit Log** | SOC2/GDPR-ready logging of all actions (view, create, edit, delete, share, export, login, MCP access). Filterable and CSV-exportable. |
| 🔌 | **MCP Server** | Expose your knowledge base to Claude, Cursor, Copilot, or any MCP-compatible AI agent. Project-scoped API keys with SHA-256 hashing. Full step content returned (not just metadata). |
| 📤 | **Git Sync** | One-way export of documents to GitHub, GitLab, or Bitbucket as Markdown files. Configurable branch and directory. |
| 📄 | **Export** | PDF (via Gotenberg), HTML, Markdown, DOCX export for documents and workflows. |
| 🔒 | **Privacy Controls** | Private documents/folders/workflows, optional PII obfuscation via SendCloak + Presidio before data reaches AI providers. |
| 🔑 | **Authentication** | Email/password with session cookies, Google OAuth, GitHub OAuth, Enterprise SSO (OIDC), OAuth 2.0 PKCE flow for desktop clients, API keys for MCP. |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 19, TypeScript, Vite 7, Tailwind CSS, Radix UI, TipTap, Zustand, TanStack Query |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2 (async), Pydantic, Alembic |
| **Database** | PostgreSQL 16 + pgvector |
| **Cache / Queue** | Redis 7, Celery |
| **PDF Export** | Gotenberg 8 |
| **Verification** | Playwright (headless Chromium for staleness detection) |
| **Reverse Proxy** | Caddy 2 (automatic HTTPS) |
| **Privacy** | SendCloak + Presidio (optional) |
| **Desktop App** | Electron ([stept-desktop-electron](https://github.com/myfoxit/stept-desktop-electron)) |
| **Chrome Extension** | [stept-plugin-chrome](https://github.com/myfoxit/stept-plugin-chrome) |

---

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/myfoxit/stept-web.git
cd stept-web
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET and STEPT_ENCRYPTION_KEY
docker compose up -d
```

| Service | URL |
|---------|-----|
| App | http://localhost |
| API Docs (Swagger) | http://localhost:8000/docs |

### Production

```bash
# Set DOMAIN, JWT_SECRET, STEPT_ENCRYPTION_KEY, POSTGRES_PASSWORD in .env
docker compose -f docker-compose.prod.yml up -d
```

Production uses Caddy for automatic HTTPS, pre-built images from GHCR, and does not expose the database port.

---

## Development Setup

### With Docker (recommended)

```bash
make dev          # Start dev environment (hot-reload for both frontend and backend)
make dev-logs     # Stream logs
make dev-down     # Stop everything
```

| Service | URL |
|---------|-----|
| Frontend (Vite dev server) | http://localhost:5173 |
| Backend (FastAPI + reload) | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |

### Without Docker

**Prerequisites:** Node.js 20+, pnpm, Python 3.12+, PostgreSQL 16 with pgvector, Redis 7

**Backend:**
```bash
cd api
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd app
pnpm install
pnpm dev   # → http://localhost:5173
```

### Useful Commands

```bash
make test              # Run all tests (backend + frontend)
make test-backend      # Backend tests (pytest, inside Docker)
make test-frontend     # Frontend tests (Jest)
make test-e2e          # E2E tests (Playwright)
make migrate           # Run database migrations
make lint              # Lint backend (ruff) + frontend (tsc)
make generate-key      # Generate a Fernet encryption key
make clean             # Remove all containers and volumes
```

---

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env` and customize.

### Required Variables

| Variable | Description | How to Generate |
|----------|-------------|-----------------|
| `JWT_SECRET` | JWT signing key | `openssl rand -hex 32` |
| `STEPT_ENCRYPTION_KEY` | Fernet key for API key encryption | `make generate-key` |
| `POSTGRES_PASSWORD` | Database password | Choose a strong password |

### Key Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENVIRONMENT` | `local` | `local` / `staging` / `production` / `test` |
| `DOMAIN` | `localhost` | Domain for Caddy HTTPS (production) |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL for CORS and OAuth callbacks |
| `CORS_ORIGINS` | `http://localhost:5173,stept://` | Comma-separated allowed origins |
| `DATABASE_URL` | *(see .env.example)* | PostgreSQL async connection string |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection string |
| `GOTENBERG_URL` | `http://gotenberg:3000` | Gotenberg PDF service URL |
| `SENDCLOAK_ENABLED` | `false` | Enable PII obfuscation |
| `storage_type` | `local` | File storage backend (`local` or `s3`) |

### AI / LLM Configuration

LLM settings can be configured via environment variables or from the **Project Settings → AI/LLM** page in the UI.

| Variable | Description |
|----------|-------------|
| `STEPT_LLM_PROVIDER` | `openai` / `anthropic` / `ollama` / `copilot` / `custom` |
| `STEPT_LLM_API_KEY` | API key for the chosen provider |
| `STEPT_LLM_MODEL` | Model name (e.g., `gpt-4o`, `claude-sonnet-4-20250514`) |
| `STEPT_LLM_BASE_URL` | Base URL (required for `ollama` and `custom`) |

See [`.env.example`](.env.example) for the complete reference including SMTP, S3, Celery, video processing, and privacy settings.

---

## Architecture

```
                         ┌──────────────────┐
                         │     Caddy         │  ← HTTPS / reverse proxy
                         │   :80 / :443      │
                         └────┬────────┬─────┘
                              │        │
                    /api/*    │        │  /*
                              ▼        ▼
                    ┌──────────┐  ┌──────────┐
                    │ FastAPI  │  │  React   │
                    │ Backend  │  │ Frontend │
                    │  :8000   │  │   :80    │
                    └────┬─────┘  └──────────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
     ┌───────────┐ ┌──────────┐ ┌──────────┐
     │ PostgreSQL│ │  Redis   │ │Gotenberg │
     │ + pgvector│ │  Cache   │ │ PDF Gen  │
     │   :5432   │ │  :6379   │ │  :3000   │
     └───────────┘ └──────────┘ └──────────┘

     ┌───────────────────────────────────────┐
     │        Optional Services              │
     │  SendCloak → Presidio (PII)           │
     │  Celery Media Worker (video/audio)    │
     └───────────────────────────────────────┘
```

**Key components:**

- **Caddy** — Reverse proxy with automatic HTTPS. Routes `/api/*` to the backend, everything else to the frontend.
- **FastAPI Backend** — Async Python API with 20+ router groups, AI tool registry, MCP server, and WebSocket notifications.
- **React Frontend** — SPA with 23+ pages, TipTap editor, chat interface, analytics dashboard, and command palette.
- **PostgreSQL + pgvector** — Primary datastore with full-text search (tsvector) and vector similarity search (1536-dim embeddings).
- **Redis** — Session cache, WebSocket pub/sub for multi-server notifications, Celery broker.
- **Gotenberg** — Headless Chrome-based PDF generation.
- **Celery Media Worker** — Async video processing pipeline (frame extraction, audio transcription via Whisper, guide generation).

---

## API Documentation

When running, interactive API docs are available at:

- **Swagger UI:** `http://localhost:8000/docs`
- **OpenAPI JSON:** `http://localhost:8000/openapi.json`

The MCP server is mounted at `/mcp` and exposes tools for listing projects, searching documents/workflows, and reading content.

---

## Project Structure

```
stept-web/
├── api/                        # Python FastAPI backend
│   ├── main.py                 # App initialization, middleware, router mounting
│   ├── app/
│   │   ├── models.py           # SQLAlchemy models (24 tables)
│   │   ├── routers/            # API endpoints (20+ groups)
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── crud/               # Database query layer
│   │   ├── services/           # Business logic, LLM gateway, AI tools
│   │   ├── mcp_server.py       # Model Context Protocol server
│   │   ├── security.py         # Auth & JWT utilities
│   │   ├── core/               # Config, JWT helpers
│   │   ├── middleware/         # Rate limiting
│   │   └── tasks/              # Celery async tasks
│   ├── alembic/                # Database migrations
│   └── tests/                  # pytest test suite
├── app/                        # React + Vite frontend
│   ├── src/
│   │   ├── pages/              # 23+ route pages
│   │   ├── components/         # UI components, editor, chat
│   │   ├── api/                # API client layer
│   │   ├── hooks/              # React hooks
│   │   ├── providers/          # Auth & project context
│   │   └── main.tsx            # Router setup
│   └── tests/                  # Jest + Playwright tests
├── docker-compose.yml          # Development stack
├── docker-compose.dev.yml      # Dev overrides (hot-reload)
├── docker-compose.prod.yml     # Production stack (Caddy + GHCR images)
├── docker-compose.test.yml     # E2E test stack
├── Caddyfile                   # Reverse proxy config
├── Makefile                    # Dev commands
└── .env.example                # Environment variable reference
```

---

## Companion Apps

| App | Description | Repository |
|-----|-------------|------------|
| **stept Desktop** | Cross-platform desktop app (Electron) for recording screen workflows with step capture | [stept-desktop-electron](https://github.com/myfoxit/stept-desktop-electron) |
| **stept Chrome Extension** | Browser extension for capturing web workflows and running interactive guides with staleness detection | [stept-plugin-chrome](https://github.com/myfoxit/stept-plugin-chrome) |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## Documentation

Full documentation is available at [docs.stept.dev](https://docs.stept.dev) (powered by [Mintlify](https://mintlify.com)).

## License

MIT — See [LICENSE](LICENSE).
