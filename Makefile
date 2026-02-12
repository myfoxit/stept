.PHONY: dev build test test-backend test-frontend lint migrate clean

# Start all services in development mode
dev:
	docker compose up -d

# Build all Docker images
build:
	docker compose build

# Run all tests
test: test-backend test-frontend

# Run backend tests (requires: docker compose up db)
test-backend:
	cd api && NO_PROXY="*" python3 -m pytest tests/ -v --tb=short

# Run frontend tests
test-frontend:
	cd app && npx jest --passWithNoTests

# Lint and type-check
lint:
	cd api && python -m ruff check . || true
	cd app && npx tsc --noEmit || true

# Run database migrations
migrate:
	cd api && alembic upgrade head

# Stop and remove all containers + volumes
clean:
	docker compose down -v

# Show logs
logs:
	docker compose logs -f

# Restart backend only
restart-backend:
	docker compose restart backend

# Generate a new Fernet encryption key
generate-key:
	python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
