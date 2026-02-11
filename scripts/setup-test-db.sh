#!/bin/bash

# Setup test database in your Docker PostgreSQL container

CONTAINER_NAME="snaprow-db"
DB_USER="postgres"
DB_PASSWORD="postgres"
TEST_DB_NAME="snaprow_test"

echo "Creating test database in Docker container..."

# Check if container is running
if ! docker ps | grep -q $CONTAINER_NAME; then
    echo "Error: Container $CONTAINER_NAME is not running"
    exit 1
fi

# Drop existing test database if it exists (this will clean up everything)
echo "Dropping existing test database if it exists..."
docker exec -e PGPASSWORD=$DB_PASSWORD $CONTAINER_NAME psql -U $DB_USER -c "DROP DATABASE IF EXISTS $TEST_DB_NAME WITH (FORCE);" 2>/dev/null || true

# Create new test database
echo "Creating fresh test database..."
docker exec -e PGPASSWORD=$DB_PASSWORD $CONTAINER_NAME psql -U $DB_USER -c "CREATE DATABASE $TEST_DB_NAME;"

echo "Test database created successfully!"

# Run migrations on test database
echo "Running migrations on test database..."
cd api

# Activate virtual environment if it exists
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
elif [ -f ".venv/bin/activate" ]; then
    source .venv/bin/activate
fi

# Check if alembic is available
if command -v alembic &> /dev/null; then
    DATABASE_URL=postgresql+asyncpg://$DB_USER:$DB_PASSWORD@localhost:5432/$TEST_DB_NAME alembic upgrade head
else
    echo "Warning: alembic not found. Skipping migrations."
    echo "Please run migrations manually or install alembic."
fi

echo "Test database setup complete!"
