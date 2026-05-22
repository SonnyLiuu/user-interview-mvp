from __future__ import annotations

import json
import logging
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, Header, Query, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse

from ..auth import AuthContext, get_auth_context
from ..errors import UnauthorizedError
from ..schemas.live_sessions import (
    LiveSessionEndResponse,
    LiveSessionResponse,
    LiveSessionStartRequest,
    LiveSessionStateResponse,
    LiveTopicOverrideRequest,
    LiveTopicOverrideResponse,
)
from ..services.live_sessions import (
    end_live_session,
    get_live_session,
    override_live_session_topic,
    start_live_session,
    stream_audio_to_live_session,
    stream_live_session_events,
)

router = APIRouter(prefix="/v1/desktop/live-sessions", tags=["desktop-live-sessions"])
logger = logging.getLogger(__name__)
_AUDIO_FRAME_MAGIC = b"FAC1"
_AUDIO_SOURCE_MIC = 1
_AUDIO_SOURCE_LOOPBACK = 2


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing bearer token")
    return authorization.removeprefix("Bearer ").strip()


@router.post("", response_model=LiveSessionResponse, response_model_by_alias=True)
async def create_live_session(
    body: LiveSessionStartRequest,
    auth: AuthContext = Depends(get_auth_context),
):
    return await start_live_session(auth.user_id, body.person_id)


@router.get("/{session_id}", response_model=LiveSessionStateResponse, response_model_by_alias=True)
async def read_live_session(
    session_id: str,
    authorization: str | None = Header(default=None, alias="Authorization"),
):
    return get_live_session(session_id, _bearer_token(authorization))


@router.post("/{session_id}/end", response_model=LiveSessionEndResponse, response_model_by_alias=True)
async def close_live_session(
    session_id: str,
    authorization: str | None = Header(default=None, alias="Authorization"),
):
    return await end_live_session(session_id, _bearer_token(authorization))


@router.post(
    "/{session_id}/topics/{topic_id}/override",
    response_model=LiveTopicOverrideResponse,
    response_model_by_alias=True,
)
async def override_live_topic(
    session_id: str,
    topic_id: str,
    body: LiveTopicOverrideRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
):
    return override_live_session_topic(
        session_id,
        _bearer_token(authorization),
        topic_id,
        checked=body.checked,
    )


def _sse(event: dict) -> str:
    event_id = event.get("id")
    event_type = event.get("type") or "message"
    data = json.dumps(event.get("data") or {}, separators=(",", ":"))
    lines = []
    if event_id is not None:
        lines.append(f"id: {event_id}")
    lines.append(f"event: {event_type}")
    lines.append(f"data: {data}")
    return "\n".join(lines) + "\n\n"


def _split_audio_frame(chunk: bytes) -> tuple[str, bytes]:
    if not chunk.startswith(_AUDIO_FRAME_MAGIC):
        return "mixed", chunk
    if len(chunk) <= len(_AUDIO_FRAME_MAGIC):
        return "unknown", b""

    source_code = chunk[len(_AUDIO_FRAME_MAGIC)]
    audio = chunk[len(_AUDIO_FRAME_MAGIC) + 1 :]
    if source_code == _AUDIO_SOURCE_MIC:
        return "mic", audio
    if source_code == _AUDIO_SOURCE_LOOPBACK:
        return "loopback", audio
    return "unknown", audio


async def _sse_stream(session_id: str, live_token: str) -> AsyncIterator[str]:
    async for event in stream_live_session_events(session_id, live_token):
        yield _sse(event)


@router.get("/{session_id}/events")
async def stream_live_session_event_source(
    session_id: str,
    token: str | None = Query(default=None),
    authorization: str | None = Header(default=None, alias="Authorization"),
):
    live_token = token or _bearer_token(authorization)
    return StreamingResponse(
        _sse_stream(session_id, live_token),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.websocket("/{session_id}/audio")
async def stream_live_session_audio(
    websocket: WebSocket,
    session_id: str,
    token: str | None = Query(default=None),
):
    live_token = token
    authorization = websocket.headers.get("authorization")
    if not live_token and authorization:
        try:
            live_token = _bearer_token(authorization)
        except UnauthorizedError:
            live_token = None
    if not live_token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    chunk_count = 0
    byte_count = 0
    try:
        while True:
            message = await websocket.receive()
            if "bytes" in message and message["bytes"]:
                source, chunk = _split_audio_frame(message["bytes"])
                if not chunk:
                    continue
                chunk_count += 1
                byte_count += len(chunk)
                if chunk_count in {1, 25, 100} or chunk_count % 500 == 0:
                    logger.warning(
                        "Desktop audio websocket received session=%s source=%s chunks=%s bytes=%s",
                        session_id,
                        source,
                        chunk_count,
                        byte_count,
                    )
                await stream_audio_to_live_session(session_id, live_token, chunk, source=source)
            elif message.get("type") == "websocket.disconnect":
                break
    except (UnauthorizedError, WebSocketDisconnect):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
