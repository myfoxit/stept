<p align="center">
  <h1 align="center">stept</h1>
  <p align="center">
    Open-source process documentation platform.<br />
    Record workflows. Build guides. Search everything with AI.
  </p>
</p>

<p align="center">
  <a href="https://github.com/myfoxit/stept/actions/workflows/ci.yml"><img src="https://github.com/myfoxit/stept/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="MIT License" /></a>
  <a href="https://github.com/myfoxit/stept/stargazers"><img src="https://img.shields.io/github/stars/myfoxit/stept?style=social" alt="GitHub Stars" /></a>
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
| 🎬 | **Workflow Recording** | Capture user actions from the [desktop app](./desktop) or [Chrome extension](./extension). Each step records a screenshot, click position, window title, and description. |
| 🎯 | **Interactive Guides** | Turn recorded workflows into interactive walkthroughs. The Chrome extension overlays step-by-step highlights directly on the target page using a 6-level element finder cascade (CSS selector → data-testid → ARIA role → tag+text → XPath → parent chain). Shadow DOM isolation prevents style conflicts. |
| 📹 | **Video-to-Guide** | Upload video files (MP4, MOV, AVI, MKV, WEBM) up to 2 GB. Async pipeline extracts key frames, transcribes audio via Whisper, and generates step-by-step workflow guides automatically. |
| 🩺 | **Staleness Detection** | Automatic documentation health monitoring. Four triggers: passive replay feedback, scheduled Playwright verification, manual re-run, and heuristic age decay. Per-step reliability tracking, optional LLM verification, and health scores (🟢🟡🔴) shown in sidebar and dashboard. |
| 📝 | **Rich Document Editor** | TipTap-based block editor with slash commands, drag-and-drop, images, code blocks, tables, and multiple page layouts (full, document, A4, letter). |
| 🕰️ | **Version History** | Google Docs-style version history for documents and workflows. Auto-versioning with configurable throttle, side-by-side preview, and one-click restore. |
| 🤖 | **AI-Powered Features** | Inline AI commands (write, summarize, improve, expand, simplify, translate, explain), context-aware chat with function calling, auto-annotation of workflow steps. |
| 🔍 | **Hybrid Search** | Full-text search (PostgreSQL tsvector) + semantic vector search (pgvector embeddings) combined via RRF ranking. Trigram fallback for typo tolerance. |
| 📚 | **Knowledge Base** | Upload PDFs, DOCX, TXT, and Markdown files. Content is extracted, embedded, and searchable alongside documents and workflows. |
| 🔗 | **Context Links** | Map URL patterns, app names, or window titles to workflows/documents. Regex and exact matching with priority scoring. |
| 🌍 | **Translation** | On-the-fly translation of documents and workflows for public/embed/export views. Powered by configurable LLM provider. |
| 🔊 | **Text-to-Speech** | Movie-mode playback of workflows with TTS narration. Supports Web Speech API (free) or OpenAI TTS (natural voices). |
| 🖼️ | **Workflow Embeds** | Embed interactive workflows in any website via iframe. Multiple display modes (slides, movie, scroll). |
| 👥 | **Team Collaboration** | Projects with hierarchical roles (Viewer → Member → Editor → Admin → Owner), per-resource sharing, threaded comments with resolution tracking. |
| 📊 | **Analytics Dashboard** | Top-accessed resources, usage by channel, documentation health overview, search query analysis, knowledge gap identification. |
| 📋 | **Audit Log** | SOC2/GDPR-ready logging of all actions. Filterable and CSV-exportable. |
| 🔌 | **MCP Server** | Expose your knowledge base to Claude, Cursor, Copilot, or any MCP-compatible AI agent. Full step content returned (not just metadata). |
| 📤 | **Git Sync** | One-way export of documents to GitHub, GitLab, or Bitbucket as Markdown files. |
| 📄 | **Export** | PDF (via Gotenberg), HTML, Markdown, DOCX export for documents and workflows. |
| 🔒 | **Privacy Controls** | Private documents/folders/workflows, optional PII obfuscation via SendCloak + Presidio before data reaches AI providers. |
| 🔑 | **Authentication** | Email/password with session cookies, Google OAuth, GitHub OAuth, Enterprise SSO (OIDC), OAuth 2.0 PKCE flow for desktop clients, API keys for MCP. |

---

## Monorepo Structure

```
stept/
├── api/                        # Python FastAPI backend
│   ├── app/
│   │   ├── models.py           # SQLAlchemy models (24 tables)
│   │   ├── routers/            # API endpoints (20+ groups)
│   │   ├── services/           # Business logic, LLM gateway, AI tools
│   │   └── mcp_server.py       # Model Context Protocol server
│   ├── alembic/                # Database migrations
│   └── tests/                  # pytest test suite
├── app/                        # React + Vite frontend
│   ├── src/
│   │   ├── pages/              # 23+ route pages
│   │   ├── components/         # UI components, editor, chat
│   │   └── providers/          # Auth & project context
│   └── tests/                  # Jest + Playwright tests
├── desktop/                    # Electron desktop app
│   ├── src/
│   │   ├── main/               # Electron main process
│   │   └── renderer/           # React renderer (spotlight, settings)
│   └── native/                 # Platform-specific helpers (macOS, Windows)
├── extension/                  # Chrome extension (Manifest V3)
│   ├── background.js           # Service worker
│   ├── content.js              # Page recording
│   ├── guide-runtime.js        # Interactive guide overlay
│   └── sidepanel.js            # Side panel UI
├── packages/
│   └── shared/                 # Shared types & constants (@stept/shared)
├── docker-compose.yml          # Development stack
├── docker-compose.prod.yml     # Production stack
├── turbo.json                  # Turborepo task orchestration
└── pnpm-workspace.yaml         # pnpm workspace config
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.12, FastAPI, SQLAlchemy 2 (async), Alembic, Celery |
| **Database** | PostgreSQL 16, pgvector, Redis 7 |
| **Frontend** | React 18, TypeScript, Vite, TanStack Query, Tailwind CSS, shadcn/ui, TipTap |
| **Desktop** | Electron, React, TypeScript, Webpack |
| **Extension** | Chrome Manifest V3, vanilla JavaScript |
| **Infrastructure** | Docker Compose, Caddy, Gotenberg, SendCloak, Presidio |

---

## Quick Start

### Self-Hosted (Docker)

```bash
git clone https://github.com/myfoxit/stept.git
cd stept
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

Production uses Caddy for automatic HTTPS and pre-built images from GHCR.

---

## Development

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

**Prerequisites:** Node.js 20+, pnpm 10+, Python 3.12+, PostgreSQL 16 with pgvector, Redis 7

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

**Desktop:**
```bash
cd desktop
npm install
npm run dev:electron
```

**Chrome Extension:**
1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" → select the `extension/` directory

### Useful Commands

```bash
make test              # Run all tests
make test-backend      # Backend tests (pytest)
make test-frontend     # Frontend tests (Jest)
make test-e2e          # E2E tests (Playwright)
make migrate           # Run database migrations
make lint              # Lint backend + frontend
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

### AI / LLM Configuration

| Variable | Description |
|----------|-------------|
| `STEPT_LLM_PROVIDER` | `openai` / `anthropic` / `ollama` / `copilot` / `custom` |
| `STEPT_LLM_API_KEY` | API key for the chosen provider |
| `STEPT_LLM_MODEL` | Model name (e.g., `gpt-4o`, `claude-sonnet-4-20250514`) |
| `STEPT_LLM_BASE_URL` | Base URL (required for `ollama` and `custom`) |

See [`.env.example`](.env.example) for the complete reference.

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

Chrome Extension ──captures──→ API ←──records──→ Desktop App
```

---

## API Documentation

When running, interactive API docs are available at:

- **Swagger UI:** `http://localhost:8000/docs`
- **OpenAPI JSON:** `http://localhost:8000/openapi.json`

The MCP server is mounted at `/mcp` and exposes tools for listing projects, searching, and reading content.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## Documentation

Full documentation at [docs.stept.ai](https://docs.stept.ai).

## License

MIT — See [LICENSE](LICENSE).
