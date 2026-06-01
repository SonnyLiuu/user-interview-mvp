"""
Recall.ai provider — bot-based meeting transcription.

Recall.ai joins meetings as a bot and streams real-time transcript data via
webhooks. This module handles bot lifecycle (create, status, stop) and
converts Recall's transcript format into our NormalizedTurn ingestion path.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import time
from typing import Any

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

RECALL_API_BASE = "https://api.recall.ai/api/v1"
RECALL_BOT_POLL_INTERVAL_SECONDS = 5.0
RECALL_BOT_JOIN_TIMEOUT_SECONDS = 120.0

# Recall → our source label
RECALL_SOURCE = "recall_ai"

# ---------------------------------------------------------------------------
# Webhook signature verification
# ---------------------------------------------------------------------------


def verify_recall_webhook_signature(
    raw_body: bytes,
    signature: str | None,
    secret: str,
) -> bool:
    """Verify a Recall.ai webhook signature using HMAC-SHA256."""
    if not signature or not secret:
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ---------------------------------------------------------------------------
# Bot lifecycle
# ---------------------------------------------------------------------------


def _recall_headers() -> dict[str, str]:
    settings = get_settings()
    if not settings.recall_api_key:
        raise ValueError("RECALL_API_KEY is not configured")
    return {
        "Authorization": f"Token {settings.recall_api_key}",
        "Content-Type": "application/json",
    }


def _recall_region() -> str:
    return get_settings().recall_region or "us-west-2"


async def create_recall_bot(
    meeting_url: str,
    *,
    bot_name: str = "User Interview Notetaker",
    recording_mode: str = "speaker_view",
) -> dict[str, Any]:
    """Create a Recall.ai bot and return the bot object.

    https://api.recall.ai/docs/api-reference/bot/create
    """
    settings = get_settings()
    body: dict[str, Any] = {
        "meeting_url": meeting_url,
        "bot_name": bot_name,
        "recording_mode": recording_mode,
        "transcription_options": {
            "provider": "recall_ai",  # Use Recall's own transcription
        },
    }
    # If a webhook secret is configured, Recall will sign its webhooks
    # and include the X-Recall-Signature header.
    if settings.recall_webhook_secret:
        body["webhook_url"] = f"{settings.host}:{settings.port}/v1/recall/webhook"
        # Note: Recall needs a publicly reachable URL. In dev, use ngrok or similar.

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{RECALL_API_BASE}/bot",
            headers=_recall_headers(),
            json=body,
        )
    if response.status_code >= 400:
        detail = response.text
        try:
            detail = response.json()
        except Exception:
            pass
        logger.error("Recall create_bot failed HTTP %s: %s", response.status_code, detail)
        raise RuntimeError(f"Recall bot creation failed: {response.status_code}")

    bot = response.json()
    logger.info("Recall bot created id=%s meeting=%s", bot.get("id"), meeting_url)
    return bot


async def get_recall_bot(bot_id: str) -> dict[str, Any]:
    """Get a Recall.ai bot by ID."""
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            f"{RECALL_API_BASE}/bot/{bot_id}",
            headers=_recall_headers(),
        )
    if response.status_code >= 400:
        raise RuntimeError(f"Recall get_bot failed: {response.status_code}")
    return response.json()


async def stop_recall_bot(bot_id: str) -> dict[str, Any]:
    """Stop (leave) a Recall.ai bot."""
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            f"{RECALL_API_BASE}/bot/{bot_id}/leave",
            headers=_recall_headers(),
        )
    if response.status_code >= 400:
        logger.warning("Recall stop_bot failed HTTP %s for bot=%s", response.status_code, bot_id)
        return {"status": "error", "bot_id": bot_id}
    logger.info("Recall bot stopped id=%s", bot_id)
    return response.json()


async def wait_for_bot_ready(bot_id: str, timeout: float = RECALL_BOT_JOIN_TIMEOUT_SECONDS) -> str:
    """Poll until the bot is in a terminal state, returning its final status.

    Returns one of: "ready", "fatal", "done", or "timeout".
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            bot = await get_recall_bot(bot_id)
            status = (bot.get("status") or "").lower()
            if status in {"ready", "fatal", "done"}:
                return status
        except Exception as exc:
            logger.warning("Recall poll failed for bot=%s: %s", bot_id, exc)
        await asyncio.sleep(RECALL_BOT_POLL_INTERVAL_SECONDS)
    return "timeout"


# ---------------------------------------------------------------------------
# Transcript parsing
# ---------------------------------------------------------------------------


def parse_recall_transcript(transcript_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Parse a Recall.ai transcript.data webhook payload into turn dicts.

    Each turn dict has: {speaker, text, external_turn_id}.

    Recall's transcript format provides per-participant word/turn data.
    We extract the final transcript lines for each speaker.
    """
    turns: list[dict[str, Any]] = []

    # Recall transcript structure: { "transcript": { "speakers": [...], "lines": [...] } }
    transcript = transcript_data.get("transcript") or transcript_data
    if not isinstance(transcript, dict):
        return turns

    # Build speaker name lookup
    speakers: dict[str, str] = {}
    speaker_list = transcript.get("speakers") or []
    for spk in speaker_list:
        if isinstance(spk, dict):
            sid = spk.get("id") or spk.get("speaker_id") or ""
            name = spk.get("name") or spk.get("display_name") or sid
            if sid:
                speakers[str(sid)] = name

    # Parse transcript lines
    lines = transcript.get("lines") or transcript.get("utterances") or []
    for line in lines:
        if not isinstance(line, dict):
            continue
        text = (line.get("text") or line.get("content") or "").strip()
        if not text:
            continue
        speaker_id = str(line.get("speaker") or line.get("speaker_id") or "")
        speaker_name = speakers.get(speaker_id, "Speaker")
        external_id = line.get("id") or line.get("uuid") or None

        turns.append({
            "speaker": speaker_name,
            "text": text,
            "external_turn_id": str(external_id) if external_id else None,
        })

    return turns


# ---------------------------------------------------------------------------
# Webhook event handling
# ---------------------------------------------------------------------------


async def handle_recall_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    """Route a Recall.ai webhook event to the appropriate handler.

    Event types we handle:
    - bot.status_change: update session metadata with bot status
    - transcript.data: parse and ingest transcript turns
    """
    event_type = (payload.get("event") or "").lower()
    logger.info("Recall webhook event=%s", event_type)

    if event_type == "bot.status_change":
        return await _handle_bot_status_change(payload)

    if event_type == "transcript.data":
        return await _handle_transcript_data(payload)

    # Acknowledge unhandled events silently
    return {"status": "ok", "event": event_type}


async def _handle_bot_status_change(payload: dict[str, Any]) -> dict[str, Any]:
    """Handle bot.status_change — lookup session and update metadata."""
    data = payload.get("data") or {}
    bot_id = data.get("bot_id") or data.get("botId") or payload.get("bot_id") or ""
    new_status = data.get("status") or data.get("current_status") or ""

    logger.info("Recall bot status_change bot=%s status=%s", bot_id, new_status)

    # The session lookup by bot_id is done in the caller (live_sessions)
    # since this module doesn't have access to the session store.
    # We return enough info for the router to do the lookup.
    return {
        "status": "ok",
        "bot_id": bot_id,
        "bot_status": new_status,
    }


async def _handle_transcript_data(payload: dict[str, Any]) -> dict[str, Any]:
    """Handle transcript.data — parse turns and return them for ingestion."""
    data = payload.get("data") or {}
    turns = parse_recall_transcript(data)
    logger.info("Recall transcript.data turns=%s", len(turns))
    return {
        "status": "ok",
        "turns": turns,
    }
