from __future__ import annotations

import asyncio
import hashlib
import hmac
import importlib
import logging
import os
import threading
import time
from typing import Any

from ..config import get_settings
from .live_sessions import (
    bind_zoom_rtms_stream,
    ingest_rtms_transcript_turn,
    mark_zoom_rtms_stream_stopped,
    record_unbound_zoom_rtms_event,
)
from .zoom_meetings import normalize_zoom_meeting_identifier


logger = logging.getLogger(__name__)
_clients: dict[str, Any] = {}
_client_threads: dict[str, threading.Thread] = {}


def zoom_url_validation_response(plain_token: str, secret_token: str) -> dict[str, str]:
    encrypted = hmac.new(
        secret_token.encode("utf-8"),
        plain_token.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return {"plainToken": plain_token, "encryptedToken": encrypted}


def verify_zoom_webhook_signature(
    raw_body: bytes,
    *,
    timestamp: str | None,
    signature: str | None,
    secret_token: str,
    tolerance_seconds: int = 300,
) -> bool:
    if not timestamp or not signature or not secret_token:
        return False
    try:
        request_ts = int(timestamp)
    except ValueError:
        return False
    if abs(int(time.time()) - request_ts) > tolerance_seconds:
        return False

    message = b"v0:" + timestamp.encode("utf-8") + b":" + raw_body
    digest = hmac.new(secret_token.encode("utf-8"), message, hashlib.sha256).hexdigest()
    expected = f"v0={digest}"
    return hmac.compare_digest(expected, signature)


def extract_zoom_rtms_keys(payload: dict[str, Any]) -> dict[str, str | None]:
    meeting_id = normalize_zoom_meeting_identifier(
        payload.get("meeting_id") or payload.get("meetingId") or payload.get("id")
    )
    return {
        "meeting_id": meeting_id,
        "meeting_uuid": payload.get("meeting_uuid") or payload.get("meetingUuid") or payload.get("uuid"),
        "rtms_stream_id": payload.get("rtms_stream_id") or payload.get("rtmsStreamId"),
    }


async def handle_zoom_rtms_event(body: dict[str, Any]) -> dict[str, Any]:
    event = body.get("event")
    payload = body.get("payload") if isinstance(body.get("payload"), dict) else {}
    if event == "endpoint.url_validation":
        plain_token = ((payload.get("plainToken") or "") if isinstance(payload, dict) else "").strip()
        return zoom_url_validation_response(plain_token, get_settings().zoom_rtms_webhook_secret_token)

    if event == "meeting.rtms_started":
        keys = extract_zoom_rtms_keys(payload)
        session = await bind_zoom_rtms_stream(
            zoom_meeting_id=keys["meeting_id"],
            zoom_meeting_uuid=keys["meeting_uuid"],
            rtms_stream_id=keys["rtms_stream_id"],
            metadata={"zoomRtmsStartedAt": _now_ms(body), "zoomRtmsPayload": payload},
        )
        if not session:
            await record_unbound_zoom_rtms_event(
                event_type=event,
                zoom_meeting_id=keys["meeting_id"],
                zoom_meeting_uuid=keys["meeting_uuid"],
                rtms_stream_id=keys["rtms_stream_id"],
                payload=body,
            )
            logger.warning("Unbound Zoom RTMS stream started: %s", keys)
            return {"ok": True, "bound": False}

        _start_rtms_client(session.session_id, payload)
        return {"ok": True, "bound": True, "sessionId": session.session_id}

    if event == "meeting.rtms_stopped":
        keys = extract_zoom_rtms_keys(payload)
        stream_id = keys["rtms_stream_id"]
        client = _clients.pop(stream_id or "", None)
        if client and hasattr(client, "leave"):
            try:
                client.leave()
            except Exception:
                logger.exception("Failed leaving Zoom RTMS stream %s", stream_id)
        await mark_zoom_rtms_stream_stopped(
            zoom_meeting_id=keys["meeting_id"],
            zoom_meeting_uuid=keys["meeting_uuid"],
            rtms_stream_id=stream_id,
        )
        return {"ok": True, "stopped": True}

    logger.info("Ignoring Zoom RTMS webhook event=%s", event)
    return {"ok": True, "ignored": True}


def _now_ms(body: dict[str, Any]) -> int | None:
    value = body.get("event_ts")
    return value if isinstance(value, int) else None


def _start_rtms_client(session_id: str, payload: dict[str, Any]) -> None:
    stream_id = payload.get("rtms_stream_id")
    if not stream_id or stream_id in _clients:
        return

    thread = threading.Thread(
        target=_run_rtms_client,
        args=(session_id, payload),
        daemon=True,
        name=f"zoom-rtms-{stream_id}",
    )
    _client_threads[stream_id] = thread
    thread.start()


def _run_rtms_client(session_id: str, payload: dict[str, Any]) -> None:
    stream_id = payload.get("rtms_stream_id")
    try:
        settings = get_settings()
        if settings.zoom_rtms_client_id:
            os.environ.setdefault("ZM_RTMS_CLIENT", settings.zoom_rtms_client_id)
            os.environ.setdefault("ZOOM_CLIENT_ID", settings.zoom_rtms_client_id)
        if settings.zoom_rtms_client_secret:
            os.environ.setdefault("ZM_RTMS_SECRET", settings.zoom_rtms_client_secret)
            os.environ.setdefault("ZOOM_CLIENT_SECRET", settings.zoom_rtms_client_secret)
        rtms = importlib.import_module("rtms")
        client = rtms.Client()
        _clients[stream_id] = client
        _register_transcript_callbacks(client, session_id)
        client.join(
            meeting_uuid=payload.get("meeting_uuid"),
            rtms_stream_id=stream_id,
            server_urls=payload.get("server_urls"),
            signature=payload.get("signature"),
        )
        while stream_id in _clients:
            poll = getattr(client, "_poll_if_needed", None)
            if callable(poll):
                poll()
            time.sleep(0.01)
    except Exception:
        logger.exception("Zoom RTMS client failed for stream %s", stream_id)
    finally:
        _clients.pop(stream_id or "", None)


def _register_transcript_callbacks(client: Any, session_id: str) -> None:
    async def ingest(text: str, speaker: str | None, external_turn_id: str | None) -> None:
        await ingest_rtms_transcript_turn(
            session_id,
            speaker=speaker,
            text=text,
            external_turn_id=external_turn_id,
        )

    def handler(*args: Any, **kwargs: Any) -> None:
        text, speaker, external_turn_id = _extract_transcript(args, kwargs)
        if not text:
            return
        asyncio.run(ingest(text, speaker, external_turn_id))

    registered = False
    for name in ("onTranscriptData", "onTranscript", "onTranscriptionData"):
        callback = getattr(client, name, None)
        if callable(callback):
            try:
                callback(handler)
                registered = True
            except TypeError:
                try:
                    callback(handler)  # SDKs differ between decorator and setter forms.
                    registered = True
                except Exception:
                    logger.debug("Could not register RTMS callback %s", name, exc_info=True)
    if not registered:
        logger.warning("Zoom RTMS client has no recognized transcript callback")


def _extract_transcript(args: tuple[Any, ...], kwargs: dict[str, Any]) -> tuple[str, str | None, str | None]:
    candidate = kwargs or (args[0] if args and isinstance(args[0], dict) else {})
    if isinstance(candidate, dict):
        text = candidate.get("text") or candidate.get("transcript") or candidate.get("content") or ""
        speaker = candidate.get("speaker") or candidate.get("user_name") or candidate.get("userName")
        external_id = candidate.get("id") or candidate.get("message_id") or candidate.get("timestamp")
        return str(text), str(speaker) if speaker else None, str(external_id) if external_id else None
    if args:
        text = args[0]
        speaker = None
        metadata = args[-1] if isinstance(args[-1], dict) else None
        if metadata:
            speaker = metadata.get("userName") or metadata.get("user_name")
        return str(text), str(speaker) if speaker else None, None
    return "", None, None
