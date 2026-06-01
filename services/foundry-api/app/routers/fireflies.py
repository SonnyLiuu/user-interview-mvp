"""
Fireflies.ai router — import and webhook endpoints.

Phase 3: Users can import a Fireflies transcript by meeting URL or ID,
and Fireflies webhooks push transcripts automatically when meetings complete.
"""

from __future__ import annotations

import json
import logging
import re

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel, Field

from ..config import get_settings
from ..errors import BadRequestError, UnauthorizedError
from ..services.fireflies_provider import (
    fetch_transcript_by_id,
    parse_fireflies_transcript,
    verify_fireflies_webhook_signature,
)
from ..services.live_sessions import fireflies_ingest_turns, find_session_by_fireflies_meeting

router = APIRouter(prefix="/v1/fireflies", tags=["fireflies"])
logger = logging.getLogger(__name__)

# Fireflies meeting URL patterns: https://app.fireflies.ai/view/MEETING_ID
# or https://app.fireflies.ai/meeting/MEETING_ID
_FIREFLIES_URL_RE = re.compile(
    r"fireflies\.ai/(?:view|meeting)/([a-zA-Z0-9_-]+)"
)

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class FirefliesImportRequest(BaseModel):
    meeting_url_or_id: str = Field(alias="meetingUrlOrId")
    session_id: str = Field(alias="sessionId")
    live_token: str = Field(alias="liveToken")


class FirefliesImportResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    turns_ingested: int = Field(alias="turnsIngested")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/import", response_model=FirefliesImportResponse, response_model_by_alias=True)
async def import_fireflies_transcript(body: FirefliesImportRequest):
    """Import a Fireflies transcript by meeting URL or transcript ID."""
    meeting_id = _extract_meeting_id(body.meeting_url_or_id)

    transcript = await fetch_transcript_by_id(meeting_id)
    if not transcript:
        raise BadRequestError(
            "Fireflies transcript not found. Check the meeting URL/ID and that FIREFLIES_API_KEY is configured."
        )

    turns = parse_fireflies_transcript(transcript)
    if not turns:
        raise BadRequestError("No transcript sentences found in the Fireflies meeting")

    return await fireflies_ingest_turns(
        body.session_id,
        body.live_token,
        turns=turns,
        meeting_id=meeting_id,
    )


@router.post("/webhook")
async def fireflies_webhook(
    request: Request,
    x_fireflies_signature: str | None = Header(default=None, alias="x-fireflies-signature"),
):
    """Receive Fireflies.ai webhook events.

    Verifies HMAC-SHA256 signature if FIREFLIES_WEBHOOK_SECRET is configured.
    Parses the transcript and ingests turns into the matching live session.
    """
    settings = get_settings()
    if not settings.fireflies_api_key:
        raise BadRequestError("Fireflies is not configured (missing FIREFLIES_API_KEY)")

    raw_body = await request.body()
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise BadRequestError("Invalid JSON") from exc

    # Verify webhook signature if secret is configured
    if settings.fireflies_webhook_secret:
        if not verify_fireflies_webhook_signature(
            raw_body,
            signature=x_fireflies_signature,
            secret=settings.fireflies_webhook_secret,
        ):
            raise UnauthorizedError("Invalid Fireflies webhook signature")

    from ..services.fireflies_provider import handle_fireflies_webhook

    result = await handle_fireflies_webhook(payload)
    turns = result.get("turns") or []
    meeting_id = result.get("meeting_id") or ""

    if not turns:
        return {"status": "ok", "turns_ingested": 0}

    # Find session by meeting metadata (stored when user starts a fireflies session)
    session = find_session_by_fireflies_meeting(meeting_id)
    if not session:
        logger.info("Fireflies webhook: no active session found for meeting=%s", meeting_id)
        return {"status": "ok", "turns_ingested": 0, "note": "no active session for this meeting"}

    from ..services.live_sessions import _handle_transcript_turn

    ingested = 0
    for turn in turns:
        text = turn.get("text", "").strip()
        if not text:
            continue
        recorded = await _handle_transcript_turn(
            session,
            source="fireflies",
            transcript=text,
            speaker=turn.get("speaker", "Speaker"),
            external_turn_id=turn.get("external_turn_id"),
        )
        if recorded:
            ingested += 1

    logger.info("Fireflies webhook: ingested %s turns for meeting=%s", ingested, meeting_id)
    return {"status": "ok", "turns_ingested": ingested}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_meeting_id(url_or_id: str) -> str:
    """Extract a Fireflies meeting ID from a URL or return the string as-is."""
    m = _FIREFLIES_URL_RE.search(url_or_id)
    return m.group(1) if m else url_or_id.strip()
