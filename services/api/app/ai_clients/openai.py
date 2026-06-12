from __future__ import annotations

from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from ..config import get_settings
from ..errors import AIServiceError
from .base import await_provider, parse_json_response

PROVIDER = "openai"


async def generate_json(messages: list[dict], schema_hint: str) -> dict:
    settings = get_settings()
    timeout = settings.ai_request_timeout_seconds
    if not settings.openai_api_key:
        raise AIServiceError("OPENAI_API_KEY is not configured", PROVIDER)

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=timeout)
    response = await await_provider(
        client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": f"You are a JSON API. Respond with valid JSON only. Use this exact schema:\n{schema_hint}"},
                *[{"role": msg["role"], "content": msg["content"]} for msg in messages],
            ],
            response_format={"type": "json_object"},
        ),
        PROVIDER,
        timeout + 5,
        "OpenAI request",
    )
    content = response.choices[0].message.content or "{}"
    return parse_json_response(content, PROVIDER)


async def get_web_context(prompt: str) -> str:
    settings = get_settings()
    if not settings.openai_api_key:
        return ""

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=settings.ai_request_timeout_seconds)
    try:
        response = await await_provider(
            client.responses.create(
                model=settings.openai_web_search_model or settings.openai_model,
                tools=[{"type": "web_search_preview"}],
                tool_choice="auto",
                input=prompt,
            ),
            PROVIDER,
            settings.ai_request_timeout_seconds + 15,
            "OpenAI web search request",
        )
    except AIServiceError:
        return ""
    return (getattr(response, "output_text", "") or "").strip()


async def stream_reply(system_prompt: str, messages: list[dict]) -> AsyncIterator[str]:
    settings = get_settings()
    timeout = settings.ai_request_timeout_seconds
    if not settings.openai_api_key:
        raise AIServiceError("OPENAI_API_KEY is not configured", PROVIDER)

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=timeout)
    stream = await client.chat.completions.create(
        model=settings.openai_model,
        stream=True,
        messages=[{"role": "system", "content": system_prompt}, *messages],
    )
    async for chunk in stream:
        text = chunk.choices[0].delta.content or ""
        if text:
            yield text
