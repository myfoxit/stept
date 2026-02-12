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

# ─── Tests ────────────────────────────────────────────────────
test: test-backend test-frontend

# Create test DB + run backend tests INSIDE Docker
test-backend: test-db
	$(COMPOSE_DEV) exec \
		-e DATABASE_URL_TEST=postgresql+asyncpg://postgres:postgres@db:5432/ondoki_test \
		-e ONDOKI_ENCRYPTION_KEY=test-key-for-testing-only-32bytes \
		-e JWT_SECRET=test-secret \
		backend python -m pytest tests/ -v --tb=short

# Ensure the test database exists
test-db:
	@$(COMPOSE_DEV) exec db psql -U postgres -tc \
		"SELECT 1 FROM pg_database WHERE datname = 'ondoki_test'" | grep -q 1 || \
		$(COMPOSE_DEV) exec db psql -U postgres -c "CREATE DATABASE ondoki_test"

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
