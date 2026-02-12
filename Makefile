.PHONY: dev dev-up dev-down dev-logs build test test-backend test-frontend test-db lint migrate clean restart-backend generate-key

# ─── Development ──────────────────────────────────────────────
# Start everything in dev mode (hot-reload, volume mounts)
dev:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
	@echo ""
	@echo "  Frontend: http://localhost:5173"
	@echo "  Backend:  http://localhost:8000"
	@echo "  Logs:     make dev-logs"
	@echo ""

dev-up: dev

dev-down:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down

dev-logs:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# ─── Build ────────────────────────────────────────────────────
build:
	docker compose build

# ─── Tests ────────────────────────────────────────────────────
# Run all tests
test: test-backend test-frontend

# Create ondoki_test database if it doesn't exist, then run backend tests
# Tests run INSIDE Docker against the same Postgres the app uses
test-backend: test-db
	docker compose exec -e DATABASE_URL_TEST=postgresql+asyncpg://postgres:postgres@db:5432/ondoki_test \
		backend python -m pytest tests/ -v --tb=short

# Ensure the test database exists
test-db:
	@docker compose exec db psql -U postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'ondoki_test'" | grep -q 1 || \
		docker compose exec db psql -U postgres -c "CREATE DATABASE ondoki_test"

# Run frontend tests (runs locally, no Docker needed)
test-frontend:
	cd app && npx jest --passWithNoTests

# ─── Lint ─────────────────────────────────────────────────────
lint:
	cd api && python3 -m ruff check . || true
	cd app && npx tsc --noEmit || true

# ─── Database ─────────────────────────────────────────────────
migrate:
	docker compose exec backend alembic upgrade head

# ─── Cleanup ──────────────────────────────────────────────────
clean:
	docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v

logs:
	docker compose logs -f

restart-backend:
	docker compose restart backend

# ─── Utils ────────────────────────────────────────────────────
generate-key:
	python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
