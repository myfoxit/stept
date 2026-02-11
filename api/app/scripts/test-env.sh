#!/bin/bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Determine script and repo root directories (robust against invocation CWD)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Configuration
COMPOSE_FILE="$REPO_ROOT/docker-compose.test.yml"
COMPOSE_PROJECT_NAME="snaprow-test"
MAX_WAIT_TIME=120   # was 60, allow slower frontend build
HEALTH_CHECK_INTERVAL=2

# Function to print colored output
print_status() {
    echo -e "${GREEN}[TEST ENV]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Function to check if services are healthy
wait_for_services() {
    print_status "Waiting for services to be healthy..."
    local start_time=$(date +%s)
    
    while true; do
        local current_time=$(date +%s)
        local elapsed=$((current_time - start_time))
        
        if [ $elapsed -gt $MAX_WAIT_TIME ]; then
            print_error "Services failed to become healthy within ${MAX_WAIT_TIME} seconds"
            print_warning "docker-compose ps:"
            docker-compose -f $COMPOSE_FILE -p $COMPOSE_PROJECT_NAME ps || true
            print_warning "Last 120 lines of frontend logs:"
            docker-compose -f $COMPOSE_FILE -p $COMPOSE_PROJECT_NAME logs --tail=120 test-frontend || true
            print_warning "Last 60 lines of backend logs:"
            docker-compose -f $COMPOSE_FILE -p $COMPOSE_PROJECT_NAME logs --tail=60 test-backend || true
            return 1
        fi
        
        # Check all services health
        local all_healthy=true
        
        # Check database
        if ! docker-compose -f $COMPOSE_FILE -p $COMPOSE_PROJECT_NAME exec -T test-db pg_isready -U testuser -d snaprow_test &>/dev/null; then
            all_healthy=false
        fi
        
        # Check backend
        if ! curl -f http://localhost:8000/health &>/dev/null; then
            all_healthy=false
        fi
        
        # Check frontend
        if ! curl -f http://localhost:5173 &>/dev/null; then
            all_healthy=false
        fi
        
        if [ "$all_healthy" = true ]; then
            print_status "All services are healthy!"
            return 0
        fi
        
        echo -n "."
        sleep $HEALTH_CHECK_INTERVAL
    done
}



# Function to start the test environment
start_env() {
    print_status "Starting test environment..."
    
    # Build and start services
    docker-compose -f $COMPOSE_FILE -p $COMPOSE_PROJECT_NAME up -d --build
    
    # Wait for services to be healthy
    if wait_for_services; then
        print_status "Test environment is ready!"
        print_status "Frontend: http://localhost:5173"
        print_status "Backend: http://localhost:8000"
        print_status "Database: localhost:5433"
    else
        print_error "Failed to start test environment"
        stop_env
        exit 1
    fi
}

# Function to stop the test environment
stop_env() {
    print_status "Stopping test environment..."
    docker-compose -f $COMPOSE_FILE -p $COMPOSE_PROJECT_NAME down
    print_status "Test environment stopped"
}

# Function to clean up the test environment
clean_env() {
    print_status "Cleaning up test environment..."
    docker-compose -f $COMPOSE_FILE -p $COMPOSE_PROJECT_NAME down -v --remove-orphans
    print_status "Test environment cleaned up"
}

# Function to run tests
run_tests() {
    print_status "Running Playwright tests..."
    cd "$REPO_ROOT/app" && pnpm playwright test
}

# Function to run full test suite
full_test() {
    clean_env
    start_env
    run_tests
    local test_exit_code=$?
    stop_env
    exit $test_exit_code
}

# Function to run tests in Docker (for CI)
test_docker() {
    print_status "Running tests in Docker container..."
    docker run --rm \
        --network="${COMPOSE_PROJECT_NAME}_test-network" \
        -e PLAYWRIGHT_BASE_URL=http://test-frontend:5173 \
        -e API_URL=http://test-backend:8000 \
        -v "$REPO_ROOT/app":/app \
        -w /app \
        mcr.microsoft.com/playwright:v1.41.0-focal \
        sh -c "corepack enable && pnpm install --frozen-lockfile && pnpm playwright test"
}

# Install trap early so it applies during 'serve' loop
trap 'print_warning "Signal received, stopping test environment"; stop_env; exit 130' INT TERM

# New: serve mode keeps process alive for Playwright
serve_env() {
    start_env
    print_status "Environment running (serve mode). Waiting for Playwright to finish..."
    # Sleep loop; trap handles shutdown
    while true; do sleep 3600; done
}

# New: run tests against already running local env (no docker)
local_tests() {
    print_status "Running Playwright tests against existing local services (no containers)..."
    export PLAYWRIGHT_NO_SERVER=true

    local base="${PLAYWRIGHT_BASE_URL:-http://localhost:5173}"
    local api="${API_URL:-http://localhost:8000}"

    if ! curl -fsS "$base" >/dev/null 2>&1; then
        print_warning "Frontend not reachable at $base"
    fi
    if ! curl -fsS "$api/health" >/dev/null 2>&1; then
        print_warning "Backend health not reachable at $api/health"
    fi

    run_tests
}

# Main script logic
case "$1" in
    start)
        start_env
        ;;
    stop)
        stop_env
        ;;
    clean)
        clean_env
        ;;
    restart)
        stop_env
        start_env
        ;;
    test)
        run_tests
        ;;
    full)
        full_test
        ;;
    test-docker)
        test_docker
        ;;
    serve)
        serve_env
        ;;
    local)
        local_tests
        ;;
    *)
        echo "Usage: $0 {start|stop|clean|restart|test|full|test-docker|serve|local}"
        exit 1
        ;;
esac
