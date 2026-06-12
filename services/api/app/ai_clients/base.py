from __future__ import annotations

import asyncio
import json

from ..config import get_settings
from ..errors import AIServiceError


def read_provider() -> str:
    settings = get_settings()
    provider = settings.ai_provider.strip().lower()
    return provider if provider in {"openai", "anthropic", "gemini"} else "openai"


def parse_json_response(raw: str, provider: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = text.removeprefix("```json").removeprefix("```").strip()
        text = text.removesuffix("```").strip()

    try:
        parsed = json.loads(text or "{}")
    except json.JSONDecodeError as exc:
        raise AIServiceError("AI response was not valid JSON", provider) from exc

    if isinstance(parsed, str):
        try:
            parsed = json.loads(parsed)
        except json.JSONDecodeError as exc:
            raise AIServiceError("AI response JSON string did not contain a valid object", provider) from exc

    if isinstance(parsed, list) and len(parsed) == 1 and isinstance(parsed[0], dict):
        parsed = parsed[0]

    if not isinstance(parsed, dict):
        raise AIServiceError("AI response JSON was not an object", provider)

    return parsed


def is_json_response_error(exc: AIServiceError) -> bool:
    message = str(exc)
    return "valid JSON" in message or "valid object" in message or "JSON was not an object" in message


def with_json_retry_instruction(messages: list[dict], schema_hint: str) -> list[dict]:
    if not messages:
        return messages
    retry_messages = [*messages]
    last = retry_messages[-1]
    retry_messages[-1] = {
        **last,
        "content": (
            f"{last['content']}\n\n"
            "Your previous response could not be parsed as the required JSON object. "
            "Return exactly one valid JSON object, with no markdown fences, prose, comments, or trailing text. "
            f"Schema hint:\n{schema_hint}"
        ),
    }
    return retry_messages


async def await_provider(coro, provider: str, timeout: float, operation: str):
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except TimeoutError as exc:
        raise AIServiceError(f"{operation} timed out", provider) from exc
    except AIServiceError:
        raise
    except Exception as exc:
        raise AIServiceError(f"{operation} failed: {exc}", provider) from exc
