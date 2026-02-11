import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # JWT Configuration
    JWT_SECRET: str = os.getenv("JWT_SECRET", "your-secret-key-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost/db")
    use_postgres: str = os.getenv("use_postgres", "TRUE")
    database_url_test: str = os.getenv("database_url_test", "postgresql+asyncpg://postgres:postgres@localhost:5432/test_db")
    
    # SMTP Configuration
    sr_smtp_host: str = os.getenv("sr_smtp_host", "127.0.0.1")
    sr_smtp_port: int = int(os.getenv("sr_smtp_port", "1025"))
    
    # Storage Configuration
    storage_type: str = os.getenv("storage_type", "local")
    local_storage_path: str = os.getenv("local_storage_path", "./storage/recordings")
    
    # CORS
    BACKEND_CORS_ORIGINS: list[str] = ["http://localhost:5173", "snaprow://"]
    
    # Frontend URL
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    REDIS_URL: str = os.getenv("REDIS_URL", default="redis://localhost:6379/0")
    
    class Config:
        env_file = ".env"
        extra = "allow"  # Allow extra fields from environment

settings = Settings()
