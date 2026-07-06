from __future__ import annotations

from collections.abc import AsyncIterator

from ...core.errors import AIServiceError
from .base import is_json_response_error, read_provider, with_json_retry_instruction


async def _generate_json_once(messages: list[dict], schema_hint: str) -> dict:
    provider = read_provider()
    if provider == "anthropic":
        from . import anthropic

        return await anthropic.generate_json(messages, schema_hint)
    if provider == "gemini":
        from . import gemini

        return await gemini.generate_json(messages, schema_hint)

    from . import openai

    return await openai.generate_json(messages, schema_hint)


async def generate_json(messages: list[dict], schema_hint: str) -> dict:
    try:
        return await _generate_json_once(messages, schema_hint)
    except AIServiceError as exc:
        if not is_json_response_error(exc):
            raise
        return await _generate_json_once(with_json_retry_instruction(messages, schema_hint), schema_hint)


async def get_web_context(prompt: str) -> str:
    provider = read_provider()
    if provider == "gemini":
        from . import gemini

        return await gemini.get_web_context(prompt)
    if provider == "openai":
        from . import openai

        return await openai.get_web_context(prompt)
    return ""


async def stream_intake_reply(system_prompt: str, messages: list[dict]) -> AsyncIterator[str]:
    provider = read_provider()
    if provider == "anthropic":
        from . import anthropic

        async for chunk in anthropic.stream_reply(system_prompt, messages):
            yield chunk
        return
    if provider == "gemini":
        from . import gemini

        async for chunk in gemini.stream_reply(system_prompt, messages):
            yield chunk
        return

    from . import openai

    async for chunk in openai.stream_reply(system_prompt, messages):
        yield chunk
