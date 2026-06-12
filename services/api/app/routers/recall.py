"""
Recall.ai router — webhook endpoint for Recall bot events.

Phase 2: bot.status_change and transcript.data webhooks are ingested
into live sessions. Bot creation happens through the live-sessions
start flow when capture_provider="recall_ai".
"""

from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Header, Request

from ..config import get_settings
from ..errors import BadRequestError, UnauthorizedError
from ..services.live_sessions import recall_webhook_ingest
from ..services.recall_provider import verify_recall_webhook_signature

router = APIRouter(prefix="/v1/recall", tags=["recall"])
logger = logging.getLogger(__name__)


@router.post("/webhook")
async def recall_webhook(
    request: Request,
    x_recall_signature: str | None = Header(default=None, alias="x-recall-signature"),
):
    """Receive Recall.ai webhook events.

    https://api.recall.ai/docs/webhooks

    Verifies the HMAC-SHA256 signature if RECALL_WEBHOOK_SECRET is configured.
    Routes bot.status_change and transcript.data events to the session store.
    """
    settings = get_settings()
    if not settings.recall_api_key:
        raise BadRequestError("Recall.ai is not configured (missing RECALL_API_KEY)")

    raw_body = await request.body()
    try:
        payload = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise BadRequestError("Invalid JSON") from exc

    # Verify webhook signature if secret is configured
    if settings.recall_webhook_secret:
        if not verify_recall_webhook_signature(
            raw_body,
            signature=x_recall_signature,
            secret=settings.recall_webhook_secret,
        ):
            raise UnauthorizedError("Invalid Recall webhook signature")

    await recall_webhook_ingest(payload)
    return {"status": "ok"}
