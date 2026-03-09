from __future__ import annotations  # enable `list | str` in type hints for Py < 3.10
import secrets
import warnings
from typing import Annotated, Any, Literal, Optional, Union

from pydantic import (
    AnyUrl,
    BeforeValidator,
    EmailStr,
    HttpUrl,
    PostgresDsn,
    computed_field,
    model_validator,
)
from pydantic_core import MultiHostUrl
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing_extensions import Self
import os

def parse_cors(v: Any) -> list[str] | str:
    if isinstance(v, str) and not v.startswith("["):
        return [i.strip() for i in v.split(",")]
    elif isinstance(v, (list, str)):  # fix: use tuple for isinstance check
        return v
    raise ValueError(v)


def parse_bool_env(v: Any) -> Any:
    if isinstance(v, str):
        return v.strip()
    return v


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Use top level .env file (one level above ./backend/)
        env_file="../.env",
        env_ignore_empty=True,
        extra="ignore",
    )
    API_V1_STR: str = "/api/v1"
    SECRET_KEY: str = ""

    @model_validator(mode="after")
    def _validate_secret_key(self) -> "Settings":
        if not self.SECRET_KEY:
            if self.ENVIRONMENT == "production":
                raise ValueError(
                    "SECRET_KEY must be explicitly set in production! "
                    "Generate one with: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
                )
            # Auto-generate for local/test/staging with warning
            import warnings as _w
            object.__setattr__(self, "SECRET_KEY", secrets.token_urlsafe(32))
            _w.warn("SECRET_KEY not set — using auto-generated key (sessions won't survive restarts)", RuntimeWarning, stacklevel=2)
        return self
    # 60 minutes * 24 hours * 8 days = 8 days
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 8
    FRONTEND_HOST: str = "http://localhost:5173"
    ENVIRONMENT: Literal["local", "staging", "production", "test"] = "local"

    # ── Defaults for local development ──────────────────────────
    PROJECT_NAME: str = "SnapRow"
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_USER: str = "postgres"
    FIRST_SUPERUSER: EmailStr = "admin@example.com"
    FIRST_SUPERUSER_PASSWORD: str = "changethis"

    @model_validator(mode="after")
    def _validate_secrets(self) -> "Settings":
        if self.ENVIRONMENT == "production":
            if self.FIRST_SUPERUSER_PASSWORD == "changethis":
                raise ValueError(
                    "FIRST_SUPERUSER_PASSWORD must be changed from default in production! "
                    "Set the FIRST_SUPERUSER_PASSWORD environment variable."
                )
        return self
    # ────────────────────────────────────────────────────────────

    BACKEND_CORS_ORIGINS: Annotated[
        Union[list[AnyUrl], str], BeforeValidator(parse_cors)
    ] = []

    @computed_field  # type: ignore[prop-decorator]
    @property
    def all_cors_origins(self) -> list[str]:
        return [str(origin).rstrip("/") for origin in self.BACKEND_CORS_ORIGINS] + [
            self.FRONTEND_HOST
        ]

    SENTRY_DSN: Optional[HttpUrl] = None
    POSTGRES_PORT: int = 5432
    POSTGRES_PASSWORD: str = ""
    POSTGRES_DB: str = ""

    @computed_field  # type: ignore[prop-decorator]
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> PostgresDsn:
        return MultiHostUrl.build(
            scheme="postgresql+psycopg",
            username=self.POSTGRES_USER,
            password=self.POSTGRES_PASSWORD,
            host=self.POSTGRES_SERVER,
            port=self.POSTGRES_PORT,
            path=self.POSTGRES_DB,
        )

    SMTP_TLS: bool = True
    SMTP_SSL: bool = False
    SMTP_PORT: int = 587
    SMTP_HOST: Optional[str] = None
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    EMAILS_FROM_EMAIL: Optional[EmailStr] = None
    EMAILS_FROM_NAME: Optional[EmailStr] = None

    @model_validator(mode="after")
    def _set_default_emails_from(self) -> Self:
        if not self.EMAILS_FROM_NAME:
            self.EMAILS_FROM_NAME = self.PROJECT_NAME
        return self

    EMAIL_RESET_TOKEN_EXPIRE_HOURS: int = 48

    @computed_field  # type: ignore[prop-decorator]
    @property
    def emails_enabled(self) -> bool:
        return bool(self.SMTP_HOST and self.EMAILS_FROM_EMAIL)

    EMAIL_TEST_USER: EmailStr = "test@example.com"

    # Gotenberg PDF service
    GOTENBERG_URL: str = os.getenv("GOTENBERG_URL", "http://gotenberg:3000")

    # ── LLM / Chat ─────────────────────────────────────────────
    LLM_PROVIDER: Optional[str] = None          # openai | anthropic | ollama
    LLM_API_KEY: Optional[str] = None
    LLM_MODEL: Optional[str] = None
    LLM_BASE_URL: Optional[str] = None          # custom endpoint URL

    # ── TTS (Text-to-Speech) ────────────────────────────────────
    TTS_PROVIDER: str = "browser"           # "browser" (Web Speech API) or "openai"
    TTS_VOICE: str = "nova"                 # OpenAI voice name
    OPENAI_API_KEY: Optional[str] = None
    TRANSLATION_ENABLED: bool = True        # AI content translation

    # ── SendCloak PII obfuscation ──────────────────────────────
    SENDCLOAK_ENABLED: Annotated[bool, BeforeValidator(parse_bool_env)] = False
    SENDCLOAK_URL: str = "http://sendcloak:9090"



# Instantiate once and share across the application
settings = Settings()  # noqa: E305


