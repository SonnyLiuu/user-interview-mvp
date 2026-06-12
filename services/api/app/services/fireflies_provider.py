"""
Fireflies.ai provider — transcript import and webhook ingestion.

Fireflies provides a GraphQL API for fetching transcripts and optional
webhooks for push-based delivery. This module handles both paths.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any

import httpx

from ..config import get_settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FIREFLIES_GRAPHQL_URL = "https://api.fireflies.ai/graphql"
FIREFLIES_SOURCE = "fireflies"

# ---------------------------------------------------------------------------
# Webhook signature verification
# ---------------------------------------------------------------------------


def verify_fireflies_webhook_signature(
    raw_body: bytes,
    signature: str | None,
    secret: str,
) -> bool:
    """Verify a Fireflies.ai webhook signature using HMAC-SHA256."""
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


def _fireflies_headers() -> dict[str, str]:
    settings = get_settings()
    if not settings.fireflies_api_key:
        raise ValueError("FIREFLIES_API_KEY is not configured")
    return {
        "Authorization": f"Bearer {settings.fireflies_api_key}",
        "Content-Type": "application/json",
    }


async def fetch_transcript_by_id(transcript_id: str) -> dict[str, Any] | None:
    """Fetch a single Fireflies transcript by ID.

    Uses the Fireflies GraphQL API.
    """
    query = """
    query GetTranscript($id: String!) {
      transcript(id: $id) {
        id
        title
        date
        duration
        sentences {
          text
          speaker_name
          raw_text
          index
        }
        participants
      }
    }
    """
    return await _graphql_query(query, {"id": transcript_id})


async def fetch_transcripts_by_date(
    start_date: str,
    end_date: str | None = None,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Fetch transcripts from Fireflies within a date range."""
    query = """
    query GetTranscripts($limit: Int, $startDate: String, $endDate: String) {
      transcripts(limit: $limit, start_date: $startDate, end_date: $endDate) {
        id
        title
        date
        duration
        participants
        sentences {
          text
          speaker_name
          raw_text
          index
        }
      }
    }
    """
    variables: dict[str, Any] = {"limit": limit, "startDate": start_date}
    if end_date:
        variables["endDate"] = end_date

    result = await _graphql_query(query, variables)
    transcripts = (result.get("transcripts") or []) if result else []
    return transcripts if isinstance(transcripts, list) else []


async def _graphql_query(query: str, variables: dict[str, Any]) -> dict[str, Any] | None:
    """Execute a Fireflies GraphQL query."""
    settings = get_settings()
    if not settings.fireflies_api_key:
        logger.warning("FIREFLIES_API_KEY not configured, skipping GraphQL query")
        return None

    body = {"query": query, "variables": variables}
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                FIREFLIES_GRAPHQL_URL,
                headers=_fireflies_headers(),
                json=body,
            )
        if response.status_code >= 400:
            logger.error("Fireflies GraphQL failed HTTP %s: %s", response.status_code, response.text[:500])
            return None
        payload = response.json()
        data = payload.get("data") if isinstance(payload, dict) else None
        if isinstance(data, dict) and data.get("transcript"):
            return data["transcript"]
        if isinstance(data, dict) and data.get("transcripts"):
            return data
        return data
    except Exception as exc:
        logger.exception("Fireflies GraphQL call failed: %s", exc)
        return None


# ---------------------------------------------------------------------------
# Transcript parsing
# ---------------------------------------------------------------------------


def parse_fireflies_transcript(transcript_data: dict[str, Any]) -> list[dict[str, Any]]:
    """Parse Fireflies transcript sentences into turn dicts.

    Each turn dict has: {speaker, text, external_turn_id}.

    Fireflies provides per-sentence speaker attribution with excellent accuracy.
    """
    turns: list[dict[str, Any]] = []

    sentences = transcript_data.get("sentences") or []
    if not isinstance(sentences, list):
        return turns

    for sentence in sentences:
        if not isinstance(sentence, dict):
            continue
        text = (sentence.get("raw_text") or sentence.get("text") or "").strip()
        if not text:
            continue
        speaker = sentence.get("speaker_name") or "Speaker"
        idx = sentence.get("index")
        external_id = f"ff_{transcript_data.get('id', 'unknown')}_{idx}" if idx is not None else None

        turns.append({
            "speaker": speaker,
            "text": text,
            "external_turn_id": external_id,
        })

    return turns


# ---------------------------------------------------------------------------
# Webhook event handling
# ---------------------------------------------------------------------------


async def handle_fireflies_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    """Route a Fireflies.ai webhook event.

    Fireflies webhooks deliver transcripts when a meeting completes.
    The payload contains the full transcript with sentences.
    """
    event_type = (payload.get("event") or payload.get("eventType") or "").lower()
    logger.info("Fireflies webhook event=%s", event_type)

    transcript_data = payload.get("transcript") or payload.get("data") or payload

    # Extract meeting-level metadata for session lookup
    meeting_id = (
        transcript_data.get("meeting_id")
        or transcript_data.get("meetingId")
        or transcript_data.get("id")
        or ""
    )

    turns = parse_fireflies_transcript(transcript_data)
    logger.info("Fireflies webhook: parsed %s turns from meeting=%s", len(turns), meeting_id)

    return {
        "status": "ok",
        "event": event_type,
        "meeting_id": str(meeting_id),
        "turns": turns,
    }
