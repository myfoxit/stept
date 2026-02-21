# Ondoki

[![CI](https://github.com/myfoxit/ondoki-web/actions/workflows/ci.yml/badge.svg)](https://github.com/myfoxit/ondoki-web/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Process recording platform with AI-powered documentation. Record user workflows,
generate step-by-step guides, and chat with an AI assistant that understands your recordings.

## Features

- **Process Recording** — Upload and manage screen recordings with annotated steps
- **Workflow Editor** — Visual step-by-step workflow builder with screenshots, descriptions, and reordering
- **Document Editor** — Rich TipTap-based editor for documentation with process recording embeds
- **Image Upload** — Upload images directly into documents via drag-and-drop or toolbar
- **AI Chat** — Context-aware LLM chat (OpenAI, Anthropic, Ollama) that understands your recordings and documents
- **@Mentions & Emoji** — Mention team members with `@` and insert emoji with `:` in documents
- **DataVeil Integration** — Optional privacy proxy for PII protection when using cloud LLMs
- **Folder Organization** — Hierarchical folder tree with privacy controls
- **Soft Delete / Trash** — Documents and workflows are soft-deleted; restore or permanently delete from Trash
- **Team Management** — View team members, roles, and invite collaborators
- **Export** — Export workflows and documents in multiple formats (PDF, HTML, Markdown, DOCX)
- **Knowledge Base** — Build a searchable knowledge base from your documentation
- **Audit Log** — Track changes and actions across your project
- **Analytics** — Dashboard with project analytics and insights
- **Desktop Recorder** — Companion Windows app ([ondoki-desktop](https://github.com/myfoxit/ondoki-desktop)) captures clicks, typing, and scrolling with screenshots

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   React UI  │────▶│  FastAPI BE  │────▶│  PostgreSQL   │
│  (Vite/TS)  │     │  (Python)    │     │              │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────▼───────┐
                    │  LLM Gateway │
                    │  (+ DataVeil)│
                    └──────────────┘
```

Services: `frontend` · `backend` · `db` (Postgres 16) · `redis` · `gotenberg` (PDF export)

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local frontend dev)
- Python 3.11+ (for local backend dev)

### Docker (recommended)

```bash
cp .env.example .env  # Edit with your settings
docker compose up -d
```

| Service   | URL                              |
|-----------|----------------------------------|
| Frontend  | http://localhost:80              |
| API       | http://localhost:8000/api/v1     |
| API Docs  | http://localhost:8000/docs       |

### Local Development

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
pnpm install   # or npm install
pnpm dev       # runs on http://localhost:5173
```

## AI Chat Setup

1. Go to Project Settings → AI/LLM
2. Select provider (OpenAI, Anthropic, Ollama, or custom OpenAI-compatible)
3. Enter API key (not needed for Ollama)
4. Chat appears via 💬 button — automatically knows about your current recording/document
5. Use `/ai` or "AI Write" in the editor slash menu to open the chat panel inline

### DataVeil (optional)

For PII protection, run [DataVeil](https://github.com/myfoxit/dataveil) and set:

```
DATAVEIL_ENABLED=true
DATAVEIL_URL=http://localhost:8080
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/ondoki` | PostgreSQL connection string |
| `JWT_SECRET` | — | JWT signing key (change in production!) |
| `ONDOKI_ENCRYPTION_KEY` | — | 32-byte key for encrypting API keys at rest |
| `POSTGRES_USER` | `postgres` | Docker Compose: Postgres user |
| `POSTGRES_PASSWORD` | `postgres` | Docker Compose: Postgres password |
| `POSTGRES_DB` | `ondoki` | Docker Compose: database name |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection string |
| `GOTENBERG_URL` | `http://localhost:3000` | Gotenberg PDF service URL |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL (for CORS / emails) |
| `DATAVEIL_ENABLED` | `false` | Enable DataVeil privacy proxy |
| `DATAVEIL_URL` | `http://localhost:8080` | DataVeil proxy URL |
| `UPLOAD_DIR` | `./uploads` | Directory for uploaded images/files |
| `storage_type` | `local` | File storage backend (`local` or `s3`) |
| `local_storage_path` | `./storage/recordings` | Local file storage path |

## Desktop Recorder

The companion [Ondoki Desktop](https://github.com/myfoxit/ondoki-desktop) app (Windows, .NET 9/WPF) records user actions with screenshots and uploads to this platform. It uses OAuth 2.0 PKCE for authentication.

## Tech Stack

- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui, TipTap 2
- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2 (async), Alembic
- **Database:** PostgreSQL 16
- **Cache:** Redis 7
- **PDF Export:** Gotenberg 8
- **LLM:** OpenAI / Anthropic / Ollama (provider-agnostic gateway)
- **Privacy:** DataVeil (optional Go proxy for PII obfuscation)
- **Desktop:** .NET 9 / WPF / C# ([separate repo](https://github.com/myfoxit/ondoki-desktop))

## Running Tests

```bash
# Backend tests (via Docker Compose)
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec \
  -e DATABASE_URL_TEST=postgresql+asyncpg://ondoki:postgres@db:5432/ondoki_test \
  -e ONDOKI_ENCRYPTION_KEY=test-key-for-testing-only-32bytes \
  -e JWT_SECRET=test-secret \
  backend python -m pytest tests/ -v --tb=short

# Backend tests (local, needs test database)
cd api && python -m pytest tests/ -v

# Frontend build check
cd app && npx vite build
```

## Database Migrations

```bash
# Run migrations
cd api && alembic upgrade head

# Create a new migration
cd api && alembic revision --autogenerate -m "description"
```

## Project Structure

```
ondoki-web/
├── api/                  # Python FastAPI backend
│   ├── app/
│   │   ├── crud/         # Database CRUD operations
│   │   ├── models.py     # SQLAlchemy models
│   │   ├── routers/      # API route handlers
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── security.py   # Auth / JWT
│   │   └── services/     # Business logic services
│   ├── alembic/          # Database migrations
│   ├── tests/            # Backend tests
│   └── main.py           # App entry point
├── app/                  # React + Vite frontend
│   ├── src/
│   │   ├── api/          # API client functions
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── lib/          # Utilities
│   │   ├── pages/        # Page components
│   │   ├── providers/    # Context providers
│   │   └── main.tsx      # Entry point
│   └── vite.config.ts
├── docker-compose.yml
└── README.md
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## License

MIT — See [LICENSE](LICENSE).
