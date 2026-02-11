import os
from pathlib import Path
from dotenv import load_dotenv

env_path = Path(__file__).resolve().parent / "../../.env.test"
load_dotenv(env_path)

class TestSettings:
    # Use your Docker PostgreSQL for tests with a test database
    TEST_DATABASE_URL: str = os.getenv("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/ondoki_test")
    DATABASE_URL: str = os.getenv("TEST_DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/ondoki_test")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "test-secret-key-only-for-testing")
    API_V1_STR: str = "/api/v1"
    
    # Test user credentials
    TEST_USER_EMAIL = "test@example.com"
    TEST_USER_PASSWORD = "TestPassword123!"
    TEST_USER_NAME = "Test User"
    
    # Test project
    TEST_PROJECT_NAME = "Test Project"

test_settings = TestSettings()
