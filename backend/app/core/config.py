from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "dev-insecure-secret-change-me-0123456789"


class Settings(BaseSettings):
    """All configuration comes from environment variables (see .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Nexora AI"
    app_version: str = "0.2.0"
    environment: str = "development"

    # Postgres connection string (Supabase in production, local SQLite fallback for dev/tests).
    database_url: str = "sqlite:///./nexora_dev.db"

    # Comma-separated list of origins allowed to call the API from a browser.
    cors_origins: str = "http://localhost:5173"

    # Used to sign login tokens. MUST be a long random value in production.
    secret_key: str = _DEV_SECRET
    access_token_expire_minutes: int = 60 * 8

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.environment == "production" and settings.secret_key == _DEV_SECRET:
        raise RuntimeError("SECRET_KEY must be set to a strong random value in production")
    return settings