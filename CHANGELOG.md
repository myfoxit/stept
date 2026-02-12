# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] — 2026-02-12

### Added
- **Smart Recording Pipeline** — Auto-annotate process recordings with AI-generated titles and descriptions
- **AI Chat Tool System** — 10 extensible tools (create folders/pages, analyze workflows, rename steps, etc.) with OpenAI function-calling format
- **TipTap AI Slash Commands** — `/ai write|summarize|improve|expand|simplify|translate|explain` inline in the editor
- **RAG Semantic Search** — pgvector embeddings with TF-IDF keyword fallback
- **5 LLM Providers** — GitHub Copilot (OAuth device flow), OpenAI, Anthropic, Ollama, Custom OpenAI-compatible
- **Desktop Sync** — Upload recordings from the Ondoki Desktop app (.NET/WPF)
- **Guide Generation** — Auto-generate step-by-step documentation from recordings
- **LLM Setup Wizard** — 3-step frontend wizard for configuring AI providers
- **DataVeil Integration** — Optional privacy proxy for LLM requests
- **Export** — PDF, DOCX, Excel, JSON export of workflows

### Security
- API key encryption at rest (Fernet)
- Input validation on all AI tool parameters
- Rate limiting on LLM endpoints (Redis-backed)
- SameSite=Strict cookies for CSRF protection
- Health check endpoints (`/health`, `/ready`)

### Infrastructure
- Docker Compose deployment (PostgreSQL + pgvector, Redis, FastAPI, React/Vite/nginx)
- Alembic database migrations
- GitHub Actions CI/CD pipeline
- Comprehensive backend test suite (pytest)
