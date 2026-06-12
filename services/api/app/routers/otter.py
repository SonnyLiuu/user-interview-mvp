"""
Otter.ai router — import and webhook endpoints.

Phase 4: Users can import an Otter transcript by speech URL or ID,
and Otter webhooks push transcripts when meetings complete.
"""

from __future__ import annotations

import json
import logging
import re

from fastapi import APIRouter, Header, Request
from pydantic import BaseModel, Field

from ..config import get_settings
from ..errors import BadRequestError, UnauthorizedError
from ..services.live_sessions import ingest_otter_webhook_turns, otter_ingest_turns
from ..services.otter_provider import (
    fetch_otter_transcript,
    parse_otter_transcript,
    verify_otter_webhook_signature,
)

router = APIRouter(prefix="/v1/otter", tags=["otter"])
logger = logging.getLogger(__name__)

# Otter.ai URL patterns: https://otter.ai/u/SPEECH_ID
_OTTER_URL_RE = re.compile(r"otter\.ai/(?:u|speech)/([a-zA-Z0-9_-]+)")

# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class OtterImportRequest(BaseModel):
    speech_url_or_id: str = Field(alias="speechUrlOrId")
    session_id: str = Field(alias="sessionId")
    live_token: str = Field(alias="liveToken")


class OtterImportResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    turns_ingested: int = Field(alias="turnsIngested")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.post("/import", response_model=OtterImportResponse, response_model_by_alias=True)
async def import_otter_transcript(body: OtterImportRequest):
    """Import an Otter.ai transcript by speech URL or ID."""
    speech_id = _extract_speech_id(body.speech_url_or_id)

    transcript = await fetch_otter_transcript(speech_id)
    if not transcript:
        raise BadRequestError(
            "Otter transcript not found. Check the speech URL/ID and that OTTER_API_KEY is configured."
        )

    turns = parse_otter_transcript(transcript)
    if not turns:
        raise BadRequestError("No utterances found in the Otter speech")

    return await otter_ingest_turns(
        body.session_id,
        body.live_token,
        turns=turns,
        speech_id=speech_id,
    )


@router.post("/webhook")
async def otter_webhook(
    request: Request,
    x_otter_signature: str | None = Header(default=None, alias="x-otter-signature"),
):
    """Receive Otter.ai webhook events.

    Verifies HMAC-SHA256 signature if OTTER_WEBHOOK_SECRET is configured.
    Parses the transcript and ingests turns into the matching live session.
    """
    settings = get_settings()
    if not settings.otter_api_key:
        raise BadRequestError("Otter.ai is not configured (missing OTTER_API_KEY)")

    raw_body = await request.body()
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise BadRequestError("Invalid JSON") from exc

    if settings.otter_webhook_secret:
        if not verify_otter_webhook_signature(
            raw_body,
            signature=x_otter_signature,
            secret=settings.otter_webhook_secret,
        ):
            raise UnauthorizedError("Invalid Otter webhook signature")

    from ..services.otter_provider import handle_otter_webhook

    result = await handle_otter_webhook(payload)
    turns = result.get("turns") or []
    speech_id = result.get("speech_id") or ""

    if not turns:
        return {"status": "ok", "turns_ingested": 0}

    ingested = await ingest_otter_webhook_turns(speech_id, turns)
    if ingested is None:
        logger.info("Otter webhook: no active session found for speech=%s", speech_id)
        return {"status": "ok", "turns_ingested": 0, "note": "no active session for this speech"}

    logger.info("Otter webhook: ingested %s turns for speech=%s", ingested, speech_id)
    return {"status": "ok", "turns_ingested": ingested}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_speech_id(url_or_id: str) -> str:
    """Extract an Otter speech ID from a URL or return the string as-is."""
    m = _OTTER_URL_RE.search(url_or_id)
    return m.group(1) if m else url_or_id.strip()
