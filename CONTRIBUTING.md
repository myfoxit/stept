# Contributing to Stept

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

### Prerequisites
- Docker & Docker Compose
- Node.js 20+ and pnpm
- Python 3.12+

### Quick Start

```bash
# Clone the repo
git clone https://github.com/myfoxit/stept.git
cd stept

# Copy environment config
cp .env.example .env

# Start all services
docker compose up -d

# Or use the Makefile
make dev
```

The app will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

### Local Development (without Docker)

**Backend:**
```bash
cd api
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd app
pnpm install
pnpm dev
```

## Running Tests

```bash
# All tests
make test

# Backend only
make test-backend

# Frontend only
make test-frontend
```

### Backend Tests
```bash
cd api
python -m pytest tests/ -v
```

Tests use SQLite in-memory by default. Set `DATABASE_URL_TEST` to use PostgreSQL.

### Frontend Tests
```bash
cd app
pnpm test
```

## Code Style

- **Python**: We use [ruff](https://docs.astral.sh/ruff/) for linting and formatting
- **TypeScript**: [Prettier](https://prettier.io/) for formatting
- **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, etc.)

## Pull Request Process

1. Fork the repo and create a feature branch (`feat/my-feature`)
2. Make your changes
3. Add/update tests for your changes
4. Ensure all tests pass (`make test`)
5. Submit a PR with a clear description

## Reporting Issues

- Use GitHub Issues
- Include steps to reproduce
- Include environment details (OS, browser, Docker version)
- Screenshots are helpful for UI issues

## Architecture Overview

See [docs/01-CURRENT-STATE.md](docs/01-CURRENT-STATE.md) for a detailed architectural overview.

**Key directories:**
```
api/                # FastAPI backend
├── app/
│   ├── routers/    # API endpoints
│   ├── models.py   # SQLAlchemy/SQLModel models
│   ├── services/   # Business logic, LLM, AI tools
│   └── middleware/  # Rate limiting, etc.
├── alembic/        # Database migrations
└── tests/          # pytest test suite

app/                # React/Vite frontend
├── src/
│   ├── api/        # API client layer
│   ├── components/ # React components
│   ├── pages/      # Route pages
│   └── services/   # Frontend services
└── tests/          # Jest test suite
```

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
