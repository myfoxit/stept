import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # JWT Configuration
    JWT_SECRET: str = os.getenv("JWT_SECRET", "")
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
    STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", os.getenv("STORAGE_TYPE", os.getenv("storage_type", "local")))
    LOCAL_STORAGE_PATH: str = os.getenv("LOCAL_STORAGE_PATH", os.getenv("local_storage_path", "./storage/recordings"))
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "./uploads")

    # S3-compatible storage
    S3_BUCKET: str = os.getenv("S3_BUCKET", "")
    S3_REGION: str = os.getenv("S3_REGION", "")
    S3_ENDPOINT_URL: str = os.getenv("S3_ENDPOINT_URL", "")
    S3_PREFIX: str = os.getenv("S3_PREFIX", "uploads")
    S3_ACCESS_KEY_ID: str = os.getenv("S3_ACCESS_KEY_ID", "")
    S3_SECRET_ACCESS_KEY: str = os.getenv("S3_SECRET_ACCESS_KEY", "")
    S3_FORCE_PATH_STYLE: bool = os.getenv("S3_FORCE_PATH_STYLE", "false").lower() in ("true", "1", "yes")

    # GCS storage
    STORAGE_GCS_BUCKET: str = os.getenv("STORAGE_GCS_BUCKET", "")
    STORAGE_GCS_CREDENTIALS_FILE: str = os.getenv("STORAGE_GCS_CREDENTIALS_FILE", "")

    # Azure Blob storage
    STORAGE_AZURE_CONTAINER: str = os.getenv("STORAGE_AZURE_CONTAINER", "")
    STORAGE_AZURE_CONNECTION_STRING: str = os.getenv("STORAGE_AZURE_CONNECTION_STRING", "")
    
    # CORS
    BACKEND_CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:5173,ondoki://").split(",")
    
    # Frontend URL
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    REDIS_URL: str = os.getenv("REDIS_URL", default="redis://localhost:6379/0")
    
    class Config:
        env_file = ".env"
        extra = "allow"  # Allow extra fields from environment

settings = Settings()

if not settings.JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET environment variable is required. "
        "Set it to a strong random string (e.g. `openssl rand -hex 32`)."
    )
