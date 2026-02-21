.PHONY: dev dev-down dev-logs build test test-backend test-frontend test-db lint migrate clean restart-backend generate-key

COMPOSE_DEV = docker compose -f docker-compose.yml -f docker-compose.dev.yml

# ─── Development ──────────────────────────────────────────────
dev:
	$(COMPOSE_DEV) up -d
	@echo ""
	@echo "  Frontend: http://localhost:5173"
	@echo "  Backend:  http://localhost:8000"
	@echo "  Logs:     make dev-logs"
	@echo ""

dev-down:
	$(COMPOSE_DEV) down

dev-logs:
	$(COMPOSE_DEV) logs -f

# ─── Build ────────────────────────────────────────────────────
build:
	$(COMPOSE_DEV) build

# ─── Load .env if present ─────────────────────────────────────
-include .env
export

# ─── Test config (override via env or .env) ───────────────────
TEST_DB_NAME     ?= ondoki_test
TEST_DB_USER     ?= $(POSTGRES_USER)
TEST_DB_PASSWORD ?= $(POSTGRES_PASSWORD)
TEST_DB_HOST     ?= db
TEST_DB_PORT     ?= 5432
DATABASE_URL_TEST ?= postgresql+asyncpg://$(TEST_DB_USER):$(TEST_DB_PASSWORD)@$(TEST_DB_HOST):$(TEST_DB_PORT)/$(TEST_DB_NAME)
TEST_ENCRYPTION_KEY ?= $(or $(ONDOKI_ENCRYPTION_KEY),test-key-for-testing-only-32bytes)
TEST_JWT_SECRET ?= $(or $(JWT_SECRET),test-secret)

# ─── Tests ────────────────────────────────────────────────────
test: test-backend test-frontend

# Create test DB + run backend tests INSIDE Docker
test-backend: test-db
	$(COMPOSE_DEV) exec \
		-e DATABASE_URL_TEST=$(DATABASE_URL_TEST) \
		-e ONDOKI_ENCRYPTION_KEY=$(TEST_ENCRYPTION_KEY) \
		-e JWT_SECRET=$(TEST_JWT_SECRET) \
		backend python -m pytest tests/ -v --tb=short

# Ensure the test database and pgvector extension exist
test-db:
	@$(COMPOSE_DEV) exec db psql -U $(TEST_DB_USER) -tc \
		"SELECT 1 FROM pg_database WHERE datname = '$(TEST_DB_NAME)'" | grep -q 1 || \
		$(COMPOSE_DEV) exec db psql -U $(TEST_DB_USER) -c "CREATE DATABASE $(TEST_DB_NAME)"
	@$(COMPOSE_DEV) exec db psql -U $(TEST_DB_USER) -d $(TEST_DB_NAME) -c "CREATE EXTENSION IF NOT EXISTS vector" 2>/dev/null || true

# Frontend tests (local, no Docker needed)
test-frontend:
	cd app && npx jest --passWithNoTests

# ─── Lint ─────────────────────────────────────────────────────
lint:
	cd api && python3 -m ruff check . || true
	cd app && npx tsc --noEmit || true

# ─── Database ─────────────────────────────────────────────────
migrate:
	$(COMPOSE_DEV) exec backend alembic upgrade head

# ─── Cleanup ──────────────────────────────────────────────────
clean:
	$(COMPOSE_DEV) down -v

logs:
	$(COMPOSE_DEV) logs -f

restart-backend:
	$(COMPOSE_DEV) restart backend

# ─── Utils ────────────────────────────────────────────────────
generate-key:
	python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
