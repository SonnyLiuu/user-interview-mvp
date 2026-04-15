from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env.local", env_file_encoding="utf-8", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8001
    log_level: str = "info"

    database_url: str = Field(alias="DATABASE_URL")
    backend_shared_secret: str = Field(alias="FOUNDRY_BACKEND_SHARED_SECRET")

    ai_provider: str = Field(default="openai", alias="AI_PROVIDER")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")

    cors_origins: list[str] = [
        "http://localhost:3000",
    ]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
