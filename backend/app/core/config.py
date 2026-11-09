from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All configuration comes from environment variables (see .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Nexora AI"
    app_version: str = "0.1.0"
    environment: str = "development"

    # Postgres connection string (Supabase in production, local SQLite fallback for dev/tests).
    database_url: str = "sqlite:///./nexora_dev.db"

    # Comma-separated list of origins allowed to call the API from a browser.
    cors_origins: str = "http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
