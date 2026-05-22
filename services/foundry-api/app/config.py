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
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    openai_model: str = Field(default="gpt-4o", alias="OPENAI_MODEL")
    checklist_ai_provider: str = Field(default="openai", alias="CHECKLIST_AI_PROVIDER")
    openai_realtime_api_key: str | None = Field(default=None, alias="OPENAI_REALTIME_API_KEY")
    openai_realtime_model: str = Field(default="gpt-realtime", alias="OPENAI_REALTIME_MODEL")
    azure_openai_realtime_endpoint: str | None = Field(default=None, alias="AZURE_OPENAI_REALTIME_ENDPOINT")
    azure_openai_realtime_api_key: str | None = Field(default=None, alias="AZURE_OPENAI_REALTIME_API_KEY")
    azure_openai_realtime_deployment: str | None = Field(default=None, alias="AZURE_OPENAI_REALTIME_DEPLOYMENT")
    azure_openai_transcription_deployment: str | None = Field(
        default=None, alias="AZURE_OPENAI_TRANSCRIPTION_DEPLOYMENT"
    )
    openai_web_search_model: str | None = Field(default=None, alias="OPENAI_WEB_SEARCH_MODEL")
    anthropic_model: str = Field(default="claude-sonnet-4-6", alias="ANTHROPIC_MODEL")
    gemini_model: str = Field(default="gemini-2.0-flash", alias="GEMINI_MODEL")
    gemini_web_search_model: str | None = Field(default=None, alias="GEMINI_WEB_SEARCH_MODEL")
    gemini_thinking_level: str | None = Field(default=None, alias="GEMINI_THINKING_LEVEL")
    ai_request_timeout_seconds: float = Field(default=45.0, alias="AI_REQUEST_TIMEOUT_SECONDS")

    cors_origins: list[str] = [
        "http://localhost:3000",
    ]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
