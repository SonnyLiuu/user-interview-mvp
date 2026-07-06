from __future__ import annotations

from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic

from ...core.config import get_settings
from ...core.errors import AIServiceError
from .base import await_provider, parse_json_response

PROVIDER = "anthropic"


async def generate_json(messages: list[dict], schema_hint: str) -> dict:
    settings = get_settings()
    timeout = settings.ai_request_timeout_seconds
    if not settings.anthropic_api_key:
        raise AIServiceError("ANTHROPIC_API_KEY is not configured", PROVIDER)

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await await_provider(
        client.messages.create(
            model=settings.anthropic_model,
            max_tokens=4096,
            messages=[{"role": "user", "content": f"{messages[0]['content']}\n\nReturn strict JSON only. Schema hint:\n{schema_hint}"}],
        ),
        PROVIDER,
        timeout,
        "Anthropic request",
    )
    text_blocks = [block.text for block in response.content if getattr(block, "type", "") == "text"]
    return parse_json_response("".join(text_blocks), PROVIDER)


async def stream_reply(system_prompt: str, messages: list[dict]) -> AsyncIterator[str]:
    settings = get_settings()
    timeout = settings.ai_request_timeout_seconds
    if not settings.anthropic_api_key:
        raise AIServiceError("ANTHROPIC_API_KEY is not configured", PROVIDER)

    client = AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=timeout)
    async with client.messages.stream(
        model=settings.anthropic_model,
        max_tokens=1024,
        system=system_prompt,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text
