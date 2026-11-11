from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

_DEV_SECRET = "dev-insecure-secret-change-me-0123456789"


class Settings(BaseSettings):
    """All configuration comes from environment variables (see .env.example)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Nexora AI"
    app_version: str = "0.4.0"
    environment: str = "development"

    # Postgres connection string (Supabase in production, local SQLite fallback for dev/tests).
    database_url: str = "sqlite:///./nexora_dev.db"

    # Comma-separated list of origins allowed to call the API from a browser.
    cors_origins: str = "http://localhost:5173"

    # Used to sign login tokens. MUST be a long random value in production.
    secret_key: str = _DEV_SECRET
    access_token_expire_minutes: int = 60 * 8

    # ---- Knowledge base (Phase 4) ----
    # "fastembed" = the real all-MiniLM-L6-v2 model (downloads ~90MB on first use).
    # "hash" = a fast fake embedder for offline development only; its search quality is poor.
    embedding_provider: str = "fastembed"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # all-MiniLM-L6-v2 only reads the first 256 tokens, so ~250-token chunks use all of
    # the model's capacity. Overlap keeps sentences that straddle a boundary findable.
    chunk_tokens: int = 250
    chunk_overlap_tokens: int = 50

    max_upload_bytes: int = 5 * 1024 * 1024  # 5 MB
    max_pdf_pages: int = 300
    max_extracted_chars: int = 2_000_000
    max_chunks_per_document: int = 2000
    max_documents_per_org: int = 50  # keeps a free-tier database from filling up

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.environment == "production" and settings.secret_key == _DEV_SECRET:
        raise RuntimeError("SECRET_KEY must be set to a strong random value in production")
    return settings