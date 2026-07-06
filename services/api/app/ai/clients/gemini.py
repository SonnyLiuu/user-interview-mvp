from __future__ import annotations

from collections.abc import AsyncIterator

import httpx

from ...core.config import get_settings
from ...core.errors import AIServiceError
from .base import await_provider, parse_json_response

PROVIDER = "gemini"


def model_path(model: str) -> str:
    return model if model.startswith("models/") else f"models/{model}"


def rest_thinking_config(model: str) -> dict | None:
    level = (get_settings().gemini_thinking_level or "").strip().lower()
    if not level or level == "off":
        return None
    if "gemini-3" in model:
        return {"thinkingLevel": "high" if level == "high" else "low"}
    if "gemini-2.5" in model:
        budgets = {"low": 4096, "high": -1}
        return {"thinkingBudget": budgets.get(level, -1)}
    return None


def response_text(payload: dict) -> str:
    candidates = payload.get("candidates") or []
    if not candidates:
        return ""
    parts = ((candidates[0].get("content") or {}).get("parts")) or []
    return "\n".join(part.get("text", "") for part in parts if part.get("text")).strip()


def grounding_sources(payload: dict) -> list[str]:
    candidates = payload.get("candidates") or []
    if not candidates:
        return []

    chunks = (candidates[0].get("groundingMetadata") or {}).get("groundingChunks") or []
    sources: list[str] = []
    seen: set[str] = set()
    for chunk in chunks:
        web = chunk.get("web") or {}
        uri = web.get("uri")
        if not uri or uri in seen:
            continue
        seen.add(uri)
        title = web.get("title") or "Source"
        sources.append(f"- {title}: {uri}")
    return sources


async def generate_json(messages: list[dict], schema_hint: str) -> dict:
    settings = get_settings()
    timeout = settings.ai_request_timeout_seconds
    if not settings.gemini_api_key:
        raise AIServiceError("GEMINI_API_KEY is not configured", PROVIDER)

    model = model_path(settings.gemini_model)
    url = f"https://generativelanguage.googleapis.com/v1beta/{model}:generateContent"
    prompt = f"{messages[0]['content']}\n\nReturn strict JSON only. Schema hint:\n{schema_hint}"
    body: dict = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"responseMimeType": "application/json"},
    }
    thinking = rest_thinking_config(model)
    if thinking:
        body["generationConfig"]["thinkingConfig"] = thinking

    async with httpx.AsyncClient(timeout=timeout + 5) as client:
        response = await await_provider(
            client.post(url, params={"key": settings.gemini_api_key}, json=body),
            PROVIDER,
            timeout + 5,
            "Gemini request",
        )
    if response.status_code >= 400:
        raise AIServiceError(f"Gemini request failed with HTTP {response.status_code}", PROVIDER)
    try:
        payload = response.json()
    except ValueError as exc:
        raise AIServiceError("Gemini request did not return valid JSON", PROVIDER) from exc
    return parse_json_response(response_text(payload) or "{}", PROVIDER)


async def get_web_context(prompt: str) -> str:
    settings = get_settings()
    if not settings.gemini_api_key:
        return ""

    model = model_path(settings.gemini_web_search_model or settings.gemini_model)
    url = f"https://generativelanguage.googleapis.com/v1beta/{model}:generateContent"
    body: dict = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
    }
    thinking = rest_thinking_config(model)
    if thinking:
        body["generationConfig"] = {"thinkingConfig": thinking}
    try:
        async with httpx.AsyncClient(timeout=settings.ai_request_timeout_seconds + 15) as client:
            response = await await_provider(
                client.post(url, params={"key": settings.gemini_api_key}, json=body),
                PROVIDER,
                settings.ai_request_timeout_seconds + 15,
                "Gemini web search request",
            )
        if response.status_code >= 400:
            raise AIServiceError(f"Gemini web search request failed with HTTP {response.status_code}", PROVIDER)
        payload = response.json()
    except (AIServiceError, ValueError):
        return ""

    text = response_text(payload)
    sources = grounding_sources(payload)
    if sources:
        text = f"{text}\n\nSources:\n{chr(10).join(sources)}".strip()
    return text


async def stream_reply(system_prompt: str, messages: list[dict]) -> AsyncIterator[str]:
    settings = get_settings()
    timeout = settings.ai_request_timeout_seconds
    if not settings.gemini_api_key:
        raise AIServiceError("GEMINI_API_KEY is not configured", PROVIDER)
    try:
        import google.generativeai as genai
    except ImportError as exc:
        raise AIServiceError(
            "google-generativeai is not installed. Run `pip install -r requirements.txt` "
            "or set AI_PROVIDER to openai/anthropic.",
            PROVIDER,
        ) from exc

    genai.configure(api_key=settings.gemini_api_key)
    gemini_model = genai.GenerativeModel(
        model_name=settings.gemini_model,
        system_instruction=system_prompt,
    )
    history = [
        {"role": "model" if m["role"] == "assistant" else "user", "parts": [m["content"]]}
        for m in messages[:-1]
    ]
    last_message = messages[-1]["content"] if messages else "Hello"
    chat = gemini_model.start_chat(history=history)
    stream = await await_provider(
        chat.send_message_async(last_message, stream=True, request_options={"timeout": timeout}),
        PROVIDER,
        timeout + 5,
        "Gemini stream request",
    )
    async for chunk in stream:
        if chunk.text:
            yield chunk.text
