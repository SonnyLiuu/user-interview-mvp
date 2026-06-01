"""
Otter.ai provider — transcript import and webhook ingestion.

Otter provides REST APIs for fetching meeting transcripts and optional
webhooks for push-based delivery when a meeting completes.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
from typing import Any

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

OTTER_API_BASE = "https://api.otter.ai/v1"
OTTER_SOURCE = "otter"

# ---------------------------------------------------------------------------
# Webhook signature verification
# ---------------------------------------------------------------------------


def verify_otter_webhook_signature(
    raw_body: bytes,
    signature: str | None,
    secret: str,
) -> bool:
    """Verify an Otter.ai webhook signature using HMAC-SHA256."""
    if not signature or not secret:
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ---------------------------------------------------------------------------
# Transcript fetch (pull-based import)
# ---------------------------------------------------------------------------


def _otter_headers() -> dict[str, str]:
    settings = get_settings()
    if not settings.otter_api_key:
        raise ValueError("OTTER_API_KEY is not configured")
    return {
        "Authorization": f"Bearer {settings.otter_api_key}",
        "Content-Type": "application/json",
    }


async def fetch_otter_transcript(speech_id: str) -> dict[str, Any] | None:
    """Fetch an Otter.ai transcript by speech ID.

    Otter's API: GET /v1/speeches/{speech_id}
    Returns the transcript with utterances.
    """
    settings = get_settings()
    if not settings.otter_api_key:
        logger.warning("OTTER_API_KEY not configured")
        return None

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{OTTER_API_BASE}/speeches/{speech_id}",
                headers=_otter_headers(),
            )
        if response.status_code >= 400:
            logger.error("Otter API failed HTTP %s: %s", response.status_code, response.text[:500])
            return None
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else payload
        return data if isinstance(data, dict) else None
    except Exception as exc:
        logger.exception("Otter API call failed: %s", exc)
        return None


async def fetch_otter_speeches(limit: int = 50) -> list[dict[str, Any]]:
    """List recent Otter speeches (meetings/transcripts)."""
    settings = get_settings()
    if not settings.otter_api_key:
        logger.warning("OTTER_API_KEY not configured")
        return []

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{OTTER_API_BASE}/speeches",
                headers=_otter_headers(),
                params={"limit": limit},
            )
        if response.status_code >= 400:
            logger.error("Otter list failed HTTP %s", response.status_code)
            return []
        payload = response.json()
        speeches = payload.get("data") if isinstance(payload, dict) else payload
        return speeches if isinstance(speeches, list) else []
    except Exception as exc:
        logger.exception("Otter list call failed: %s", exc)
        return []


# ---------------------------------------------------------------------------
# Transcript parsing
# ---------------------------------------------------------------------------


def parse_otter_transcript(transcript_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Parse Otter.ai transcript utterances into turn dicts.

    Each turn dict has: {speaker, text, external_turn_id}.

    Otter provides per-utterance speaker attribution with word-level timestamps.
    """
    turns: list[dict[str, Any]] = []

    utterances = transcript_data.get("utterances") or transcript_data.get("transcript") or []
    if isinstance(utterances, dict):
        utterances = utterances.get("utterances") or utterances.get("speakers") or []
    if not isinstance(utterances, list):
        return turns

    # Build speaker name lookup from transcript metadata
    speaker_map: dict[str, str] = {}
    speakers = transcript_data.get("speakers") or []
    if isinstance(speakers, list):
        for spk in speakers:
            if isinstance(spk, dict):
                sid = spk.get("id") or spk.get("speaker_id") or ""
                name = spk.get("name") or spk.get("display_name") or sid
                if sid:
                    speaker_map[str(sid)] = name

    speech_id = transcript_data.get("speech_id") or transcript_data.get("id") or ""

    for i, utterance in enumerate(utterances):
        if not isinstance(utterance, dict):
            continue
        text = (utterance.get("transcript") or utterance.get("text") or "").strip()
        if not text:
            continue
        speaker_id = str(utterance.get("speaker") or utterance.get("speaker_id") or "")
        speaker = speaker_map.get(speaker_id, utterance.get("speaker_name") or "Speaker")
        uid = utterance.get("id") or utterance.get("utterance_id") or None
        external_id = f"otter_{speech_id}_{uid}" if uid and speech_id else None

        turns.append({
            "speaker": speaker,
            "text": text,
            "external_turn_id": external_id,
        })

    return turns


# ---------------------------------------------------------------------------
# Webhook event handling
# ---------------------------------------------------------------------------


async def handle_otter_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    """Route an Otter.ai webhook event.

    Otter webhooks deliver transcripts when a meeting/speech completes.
    """
    event_type = (payload.get("event") or payload.get("event_type") or "").lower()
    logger.info("Otter webhook event=%s", event_type)

    data = payload.get("data") or payload
    speech_id = (
        data.get("speech_id")
        or data.get("speechId")
        or data.get("id")
        or ""
    )

    turns = parse_otter_transcript(data)
    logger.info("Otter webhook: parsed %s turns from speech=%s", len(turns), speech_id)

    return {
        "status": "ok",
        "event": event_type,
        "speech_id": str(speech_id),
        "turns": turns,
    }
