from __future__ import annotations

import json

from fastapi import APIRouter, Header, Request

from ..config import get_settings
from ..errors import BadRequestError, UnauthorizedError
from ..services.zoom_rtms import handle_zoom_rtms_event, verify_zoom_webhook_signature


router = APIRouter(prefix="/v1/zoom/rtms", tags=["zoom-rtms"])


@router.post("/webhook")
async def zoom_rtms_webhook(
    request: Request,
    x_zm_request_timestamp: str | None = Header(default=None, alias="x-zm-request-timestamp"),
    x_zm_signature: str | None = Header(default=None, alias="x-zm-signature"),
):
    settings = get_settings()
    if not settings.zoom_rtms_enabled:
        raise BadRequestError("Zoom RTMS is disabled")
    if not settings.zoom_rtms_webhook_secret_token:
        raise BadRequestError("Zoom RTMS webhook secret is not configured")

    raw_body = await request.body()
    try:
        body = json.loads(raw_body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise BadRequestError("Invalid JSON") from exc

    if body.get("event") != "endpoint.url_validation":
        if not verify_zoom_webhook_signature(
            raw_body,
            timestamp=x_zm_request_timestamp,
            signature=x_zm_signature,
            secret_token=settings.zoom_rtms_webhook_secret_token,
        ):
            raise UnauthorizedError("Invalid Zoom webhook signature")

    return await handle_zoom_rtms_event(body)
