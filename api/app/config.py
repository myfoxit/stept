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
    
    # SMTP Configuration (SMTP_* preferred, SR_* as fallback)
    SMTP_HOST: str = os.getenv("SMTP_HOST", os.getenv("SR_SMTP_HOST", "127.0.0.1"))
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", os.getenv("SR_SMTP_PORT", "1025")))
    SMTP_USER: str = os.getenv("SMTP_USER", os.getenv("SR_SMTP_USER", ""))
    SMTP_PASS: str = os.getenv("SMTP_PASS", os.getenv("SR_SMTP_PASS", ""))
    SMTP_FROM: str = os.getenv("SMTP_FROM", os.getenv("SR_FROM_EMAIL", "noreply@stept.ai"))
    SMTP_USE_TLS: bool = True  # computed in __init__
    SMTP_USE_SSL: bool = False  # computed in __init__

    # OAuth — Google
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")

    # OAuth — GitHub
    GITHUB_CLIENT_ID: str = os.getenv("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET: str = os.getenv("GITHUB_CLIENT_SECRET", "")

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
    BACKEND_CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", "http://localhost:5173,stept://").split(",")
    
    # Frontend URL
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    REDIS_URL: str = os.getenv("REDIS_URL", default="redis://localhost:6379/0")
    
    def model_post_init(self, __context):
        # Auto-detect TLS/SSL based on port unless explicitly set via env
        if os.getenv("SMTP_USE_SSL") is not None:
            self.SMTP_USE_SSL = os.getenv("SMTP_USE_SSL", "").lower() in ("true", "1", "yes")
        else:
            self.SMTP_USE_SSL = self.SMTP_PORT == 465

        if os.getenv("SMTP_USE_TLS") is not None:
            self.SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "").lower() in ("true", "1", "yes")
        else:
            self.SMTP_USE_TLS = self.SMTP_PORT in (587, 465)

    class Config:
        env_file = ".env"
        extra = "allow"  # Allow extra fields from environment

settings = Settings()

if not settings.JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET environment variable is required. "
        "Set it to a strong random string (e.g. `openssl rand -hex 32`)."
    )
