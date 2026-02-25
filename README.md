# Ondoki

[![CI](https://github.com/myfoxit/ondoki-web/actions/workflows/ci.yml/badge.svg)](https://github.com/myfoxit/ondoki-web/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Ondoki** is a process documentation platform with AI-powered workflows. Record user actions, build step-by-step guides, collaborate on documentation, and chat with an AI assistant that understands your content.

## Architecture

```
                         ┌──────────────────┐
                         │     Caddy         │  ← HTTPS / reverse proxy
                         │   :80 / :443     │
                         └────┬────────┬────┘
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

## Features

- **Process Recording** — Upload screen recordings with annotated steps
- **Workflow Editor** — Visual step-by-step builder with screenshots, descriptions, and drag-to-reorder
- **Document Editor** — Rich TipTap editor with slash commands, @mentions, emoji, and inline AI
- **AI Chat** — Context-aware LLM chat (OpenAI, Anthropic, Ollama) that understands your recordings and documents
- **Knowledge Base** — Searchable knowledge base with semantic search (pgvector)
- **Folder Organization** — Hierarchical folders with privacy controls
- **Team Collaboration** — Project-based teams with roles and sharing
- **Export** — PDF, HTML, Markdown, DOCX
- **Audit Log** — Track all changes across your project
- **Analytics Dashboard** — Project insights and usage metrics
- **PII Protection** — Optional SendCloak/Presidio integration for privacy-safe AI
- **Desktop Recorder** — Companion Windows app ([ondoki-desktop](https://github.com/myfoxit/ondoki-desktop))

## Quick Start

### Docker (recommended)

```bash
git clone https://github.com/myfoxit/ondoki-web.git
cd ondoki-web
cp .env.example .env   # Edit with your settings
docker compose up -d
```

| Service   | URL                          |
|-----------|------------------------------|
| App       | http://localhost              |
| API Docs  | http://localhost:8000/docs    |

### Production

```bash
# See docs/deployment.md for full guide
docker compose -f docker-compose.prod.yml up -d
```

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
pnpm install
pnpm dev   # → http://localhost:5173
```

## Configuration

All configuration is via environment variables. See [`.env.example`](.env.example) for the complete reference.

### Key Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | ✅ | JWT signing key (`openssl rand -hex 32`) |
| `ONDOKI_ENCRYPTION_KEY` | ✅ | Fernet key for API key encryption at rest |
| `POSTGRES_PASSWORD` | ✅ | Database password |
| `DOMAIN` | Prod | Domain for Caddy HTTPS (e.g. `app.ondoki.com`) |
| `FRONTEND_URL` | Prod | Full frontend URL for CORS and emails |
| `CORS_ORIGINS` | Prod | Comma-separated allowed origins |
| `ENVIRONMENT` | — | `local` / `staging` / `production` / `test` |
| `SENDCLOAK_ENABLED` | — | Enable PII obfuscation (`true`/`false`) |

See [`.env.example`](.env.example) for all variables including SMTP, S3, LLM, Redis, and more.

## AI Setup

1. **Project Settings → AI/LLM** — select provider and enter API key
2. **Chat** — click 💬 to open context-aware AI chat
3. **Inline AI** — use `/ai` in the editor slash menu

Supported providers: OpenAI, Anthropic, Ollama, or any OpenAI-compatible endpoint.

### Privacy (optional)

Enable [SendCloak](https://github.com/myfoxit/sendcloak) to obfuscate PII before it reaches AI providers:

```bash
SENDCLOAK_ENABLED=true
docker compose --profile privacy up -d
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui, TipTap 2 |
| Backend | Python 3.11+, FastAPI, SQLAlchemy 2 (async), Alembic |
| Database | PostgreSQL 16 + pgvector |
| Cache | Redis 7 |
| PDF Export | Gotenberg 8 |
| Reverse Proxy | Caddy 2 (automatic HTTPS) |
| Privacy | SendCloak + Presidio (optional) |
| Desktop | .NET 9 / WPF ([separate repo](https://github.com/myfoxit/ondoki-desktop)) |

## Project Structure

```
ondoki-web/
├── api/                    # Python FastAPI backend
│   ├── app/
│   │   ├── crud/           # Database operations
│   │   ├── models.py       # SQLAlchemy models
│   │   ├── routers/        # API endpoints
│   │   ├── schemas/        # Pydantic schemas
│   │   ├── security.py     # Auth & JWT
│   │   └── services/       # Business logic & AI tools
│   ├── alembic/            # Database migrations
│   └── tests/              # Backend tests
├── app/                    # React + Vite frontend
│   ├── src/
│   │   ├── api/            # API client
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom hooks
│   │   ├── pages/          # Page components
│   │   └── providers/      # Context providers
│   └── tests/              # Frontend & E2E tests
├── docker-compose.yml      # Development
├── docker-compose.prod.yml # Production (with Caddy)
├── Caddyfile               # Reverse proxy config
└── docs/                   # Documentation
```

## Running Tests

```bash
# Backend
cd api && python -m pytest tests/ -v

# Frontend
cd app && npx jest --passWithNoTests

# E2E (requires running stack)
cd app && npx playwright test
```

## Database Migrations

```bash
cd api
alembic upgrade head                          # Apply all
alembic revision --autogenerate -m "desc"     # Create new
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, and PR guidelines.

## Documentation

- [Deployment Guide](docs/deployment.md) — Production setup, HTTPS, email, S3
- [API Docs](http://localhost:8000/docs) — Interactive Swagger UI (when running)

## License

MIT — See [LICENSE](LICENSE).
