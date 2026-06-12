from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

API_DIR = Path(__file__).resolve().parents[1]
REPO_DIR = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_DIR / ".env.local", API_DIR / ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    host: str = "0.0.0.0"
    port: int = 8001
    log_level: str = "info"

    database_url: str = Field(alias="DATABASE_URL")
    backend_shared_secret: str = Field(alias="FOUNDRY_BACKEND_SHARED_SECRET")
    desktop_dev_auth_enabled: bool = Field(default=False, alias="DESKTOP_DEV_AUTH_ENABLED")
    foundry_desktop_api_public_url: str | None = Field(default=None, alias="FOUNDRY_DESKTOP_API_PUBLIC_URL")

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
    zoom_rtms_enabled: bool = Field(default=False, alias="ZOOM_RTMS_ENABLED")
    zoom_rtms_client_id: str | None = Field(default=None, alias="ZOOM_RTMS_CLIENT_ID")
    zoom_rtms_client_secret: str | None = Field(default=None, alias="ZOOM_RTMS_CLIENT_SECRET")
    zoom_rtms_webhook_secret_token: str | None = Field(default=None, alias="ZOOM_RTMS_WEBHOOK_SECRET_TOKEN")
    recall_api_key: str | None = Field(default=None, alias="RECALL_API_KEY")
    recall_region: str = Field(default="us-west-2", alias="RECALL_REGION")
    recall_webhook_secret: str | None = Field(default=None, alias="RECALL_WEBHOOK_SECRET")
    fireflies_api_key: str | None = Field(default=None, alias="FIREFLIES_API_KEY")
    fireflies_webhook_secret: str | None = Field(default=None, alias="FIREFLIES_WEBHOOK_SECRET")
    otter_api_key: str | None = Field(default=None, alias="OTTER_API_KEY")
    otter_webhook_secret: str | None = Field(default=None, alias="OTTER_WEBHOOK_SECRET")
    openai_web_search_model: str | None = Field(default=None, alias="OPENAI_WEB_SEARCH_MODEL")
    anthropic_model: str = Field(default="claude-sonnet-4-6", alias="ANTHROPIC_MODEL")
    gemini_model: str = Field(default="gemini-2.5-pro", alias="GEMINI_MODEL")
    gemini_web_search_model: str | None = Field(default=None, alias="GEMINI_WEB_SEARCH_MODEL")
    gemini_thinking_level: str | None = Field(default=None, alias="GEMINI_THINKING_LEVEL")
    ai_request_timeout_seconds: float = Field(default=45.0, alias="AI_REQUEST_TIMEOUT_SECONDS")

    cors_origins: list[str] = [
        "http://localhost:3000",
    ]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
