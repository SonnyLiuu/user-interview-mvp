from __future__ import annotations

import base64
import asyncio
import hashlib
import hmac
import json
import logging
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from ..config import get_settings
from ..db import get_pool
from ..errors import NotFoundError, UnauthorizedError
from ..repositories import call_prep as call_prep_repo
from ..repositories import people as people_repo
from .call_prep import fallback_call_brief_content, normalize_call_brief_content
from .project_context import normalize_json
from .realtime_bridge import RealtimeBridge
from .source_transcription_bridge import SourceTranscriptionBridge


logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _b64url(data: bytes | str) -> str:
    raw = data.encode("utf-8") if isinstance(data, str) else data
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + padding)


@dataclass
class LiveTopicState:
    id: str
    label: str
    category: str
    checked: bool = False
    checked_by: str | None = None
    checked_at: str | None = None
    evidence: str | None = None
    manual_override: bool = False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "label": self.label,
            "category": self.category,
            "checked": self.checked,
            "checkedBy": self.checked_by,
            "checkedAt": self.checked_at,
            "evidence": self.evidence,
            "manualOverride": self.manual_override,
        }


@dataclass
class LiveSessionEvent:
    id: str
    type: str
    created_at: str
    data: dict[str, Any]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "createdAt": self.created_at,
            "data": self.data,
        }


@dataclass
class LiveTranscriptTurn:
    speaker: str
    source: str
    text: str
    created_at: str

    def to_dict(self) -> dict:
        return {
            "speaker": self.speaker,
            "source": self.source,
            "text": self.text,
            "createdAt": self.created_at,
        }


@dataclass
class LiveSessionState:
    session_id: str
    user_id: str
    person_id: str
    person_name: str
    status: str
    started_at: str
    topics: list[LiveTopicState] = field(default_factory=list)
    ended_at: str | None = None
    realtime_status: str = "pending"
    realtime_error: str | None = None
    transcript_turns: list[LiveTranscriptTurn] = field(default_factory=list)
    events: list[LiveSessionEvent] = field(default_factory=list)

    def to_dict(self, *, include_token: str | None = None) -> dict:
        body = {
            "sessionId": self.session_id,
            "personId": self.person_id,
            "personName": self.person_name,
            "status": self.status,
            "topics": [topic.to_dict() for topic in self.topics],
            "startedAt": self.started_at,
            "endedAt": self.ended_at,
            "realtimeStatus": self.realtime_status,
            "realtimeError": self.realtime_error,
            "transcriptTurns": [turn.to_dict() for turn in self.transcript_turns],
            "transcriptRaw": format_transcript(self),
            "events": [event.to_dict() for event in self.events],
        }
        if include_token is not None:
            body["liveToken"] = include_token
        return body


_sessions: dict[str, LiveSessionState] = {}
_bridges: dict[str, RealtimeBridge] = {}
_transcription_bridges: dict[str, SourceTranscriptionBridge] = {}
_event_queues: dict[str, list[asyncio.Queue[LiveSessionEvent]]] = {}


def sign_live_session_token(session: LiveSessionState) -> str:
    settings = get_settings()
    payload = {
        "typ": "desktop_live_session",
        "sid": session.session_id,
        "sub": session.user_id,
        "person_id": session.person_id,
        "exp": int(time.time()) + 60 * 60 * 2,
    }
    encoded_payload = _b64url(json.dumps(payload, separators=(",", ":")))
    signature = hmac.new(
        settings.backend_shared_secret.encode("utf-8"),
        encoded_payload.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return f"{encoded_payload}.{_b64url(signature)}"


def verify_live_session_token(token: str) -> LiveSessionState:
    settings = get_settings()
    try:
        payload_part, signature_part = token.split(".", 1)
    except ValueError as exc:
        raise UnauthorizedError("Invalid live session token") from exc

    expected = hmac.new(
        settings.backend_shared_secret.encode("utf-8"),
        payload_part.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    actual = _b64url_decode(signature_part)
    if not hmac.compare_digest(expected, actual):
        raise UnauthorizedError("Invalid live session token signature")

    payload = json.loads(_b64url_decode(payload_part).decode("utf-8"))
    if payload.get("typ") != "desktop_live_session":
        raise UnauthorizedError("Invalid live session token type")
    if payload.get("exp", 0) < int(time.time()):
        raise UnauthorizedError("Live session token expired")

    session = _sessions.get(payload.get("sid") or "")
    if not session or session.user_id != payload.get("sub"):
        raise UnauthorizedError("Live session not found")
    return session


def _topics_from_call_brief(content: dict) -> list[LiveTopicState]:
    topics: list[LiveTopicState] = []
    specs = [
        ("goals", "goal"),
        ("questions", "question"),
        ("signals", "signal"),
    ]
    for key, category in specs:
        values = content.get(key) if isinstance(content.get(key), list) else []
        for label in values:
            if not isinstance(label, str) or not label.strip():
                continue
            topics.append(
                LiveTopicState(
                    id=str(len(topics) + 1),
                    label=" ".join(label.strip().split()),
                    category=category,
                )
            )
    return topics


def _checklist_provider() -> str:
    provider = get_settings().checklist_ai_provider.strip().lower()
    return provider if provider else "openai"


def _speaker_for_source(source: str) -> str:
    if source == "mic":
        return "Founder"
    if source == "loopback":
        return "Interviewee"
    return "Unknown"


def format_transcript(session: LiveSessionState) -> str:
    return "\n".join(
        f"{turn.speaker}: {turn.text}" for turn in session.transcript_turns
    )


async def start_live_session(user_id: str, person_id: str) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        person = await people_repo.get_owned_person(conn, user_id, person_id)
        if not person:
            raise NotFoundError("Not found")
        call_prep = await call_prep_repo.get_current_call_prep(conn, person_id)

    raw_content = normalize_json(dict(call_prep)["content"]) if call_prep else None
    content = normalize_call_brief_content(raw_content)
    if not any(content.get(key) for key in ("goals", "questions", "signals")):
        content = fallback_call_brief_content()

    session = LiveSessionState(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        person_id=person_id,
        person_name=person["name"] or "Unnamed person",
        status="active",
        started_at=_now_iso(),
        topics=_topics_from_call_brief(content),
    )
    _sessions[session.session_id] = session
    _start_realtime_bridge(session)
    _start_transcription_bridge(session)
    token = sign_live_session_token(session)
    return session.to_dict(include_token=token)


def get_live_session(session_id: str, live_token: str) -> dict:
    session = verify_live_session_token(live_token)
    if session.session_id != session_id:
        raise UnauthorizedError("Live session token does not match session")
    return session.to_dict()


def override_live_session_topic(
    session_id: str,
    live_token: str,
    topic_id: str,
    *,
    checked: bool,
) -> dict:
    session = verify_live_session_token(live_token)
    if session.session_id != session_id:
        raise UnauthorizedError("Live session token does not match session")
    if session.status != "active":
        raise NotFoundError("Live session is not active")

    topic = _topic_by_id(session, topic_id)
    if not topic:
        raise NotFoundError("Topic not found")

    topic.checked = checked
    topic.checked_by = "manual"
    topic.checked_at = _now_iso()
    topic.evidence = None
    topic.manual_override = True

    event = _append_event(
        session,
        "topic_updated",
        {
            "sessionId": session.session_id,
            "topic": topic.to_dict(),
            "source": "manual",
        },
    )
    logger.info(
        "Manual topic override session=%s topic_id=%s checked=%s",
        session.session_id,
        topic.id,
        checked,
    )
    return {
        "sessionId": session.session_id,
        "topic": topic.to_dict(),
        "event": event.to_dict(),
    }


async def stream_audio_to_live_session(
    session_id: str,
    live_token: str,
    audio: bytes,
    *,
    source: str = "mixed",
) -> bool:
    session = verify_live_session_token(live_token)
    if session.session_id != session_id:
        raise UnauthorizedError("Live session token does not match session")
    if session.status != "active":
        return False
    if source in {"mixed", "unknown"}:
        logger.warning(
            "Ignoring unlabeled audio for hybrid matcher session=%s source=%s",
            session.session_id,
            source,
        )
        return False
    if _checklist_provider() == "mock":
        text = f"Mock {source} transcript turn received {len(audio)} bytes of live audio."
        await _handle_transcript_turn(session, source, text)
        return True
    transcriber = _transcription_bridges.get(session.session_id)
    if not transcriber:
        return False
    return await transcriber.send_audio(source, audio)


async def stream_live_session_events(
    session_id: str,
    live_token: str,
) -> AsyncIterator[dict[str, Any]]:
    session = verify_live_session_token(live_token)
    if session.session_id != session_id:
        raise UnauthorizedError("Live session token does not match session")

    queue: asyncio.Queue[LiveSessionEvent] = asyncio.Queue()
    _event_queues.setdefault(session.session_id, []).append(queue)
    try:
        yield {
            "id": "snapshot",
            "type": "session_snapshot",
            "data": session.to_dict(),
        }
        while session.status == "active":
            try:
                event = await asyncio.wait_for(queue.get(), timeout=15)
            except TimeoutError:
                yield {
                    "id": "heartbeat",
                    "type": "heartbeat",
                    "data": {"sessionId": session.session_id},
                }
                continue
            yield event.to_dict()
    finally:
        queues = _event_queues.get(session.session_id)
        if queues and queue in queues:
            queues.remove(queue)
        if queues == []:
            _event_queues.pop(session.session_id, None)


async def end_live_session(session_id: str, live_token: str) -> dict:
    session = verify_live_session_token(live_token)
    if session.session_id != session_id:
        raise UnauthorizedError("Live session token does not match session")
    if session.status != "ended":
        session.status = "ended"
        session.ended_at = _now_iso()
        _append_event(
            session,
            "session_closed",
            {
                "sessionId": session.session_id,
                "status": session.status,
                "endedAt": session.ended_at,
            },
        )
    transcriber = _transcription_bridges.pop(session.session_id, None)
    if transcriber:
        await transcriber.stop()
    bridge = _bridges.pop(session.session_id, None)
    if bridge:
        await bridge.stop()
    return {
        "sessionId": session.session_id,
        "status": session.status,
        "endedAt": session.ended_at,
    }


def _start_realtime_bridge(session: LiveSessionState) -> None:
    _set_realtime_status(session, "starting", None)
    bridge = RealtimeBridge(
        session,
        on_tool_call=lambda name, args: _handle_realtime_tool_call(session, name, args),
        on_status=lambda status, error: _set_realtime_status(session, status, error),
    )
    _bridges[session.session_id] = bridge
    bridge.start()


def _start_transcription_bridge(session: LiveSessionState) -> None:
    if _checklist_provider() == "mock":
        return
    bridge = SourceTranscriptionBridge(
        session,
        on_transcript=lambda source, transcript: _handle_transcript_turn(
            session, source, transcript
        ),
        on_status=lambda status, error: _set_realtime_status(
            session, status, error
        ),
    )
    _transcription_bridges[session.session_id] = bridge
    bridge.start()


def _set_realtime_status(session: LiveSessionState, status: str, error: str | None) -> None:
    session.realtime_status = status
    session.realtime_error = error
    _append_event(
        session,
        "realtime_status",
        {
            "sessionId": session.session_id,
            "status": status,
            "message": error,
        },
    )
    if error:
        _append_event(
            session,
            "realtime_error",
            {
                "sessionId": session.session_id,
                "status": status,
                "message": error,
            },
        )
        logger.warning("Realtime session %s status=%s error=%s", session.session_id, status, error)


async def _handle_transcript_turn(
    session: LiveSessionState,
    source: str,
    transcript: str,
) -> None:
    text = _clean_arg(transcript)
    if not text:
        return
    turn = LiveTranscriptTurn(
        speaker=_speaker_for_source(source),
        source=source,
        text=text,
        created_at=_now_iso(),
    )
    session.transcript_turns.append(turn)
    logger.warning(
        "Transcript turn session=%s source=%s speaker=%s text=%s",
        session.session_id,
        source,
        turn.speaker,
        text[:160],
    )
    _append_event(
        session,
        "transcript_turn",
        {
            "sessionId": session.session_id,
            "turn": turn.to_dict(),
            "transcriptRaw": format_transcript(session),
        },
    )
    bridge = _bridges.get(session.session_id)
    if bridge:
        await bridge.send_labeled_turn(source, text)


async def _handle_realtime_tool_call(
    session: LiveSessionState,
    name: str,
    args: dict[str, Any],
) -> dict[str, Any]:
    if name == "mark_items_covered":
        return _mark_items_covered(session, args)
    if name != "mark_item_covered":
        return _reject_tool_call(session, "unsupported_tool", args)

    return _mark_item_covered(session, args)


def _mark_items_covered(session: LiveSessionState, args: dict[str, Any]) -> dict[str, Any]:
    raw_items = args.get("items")
    if not isinstance(raw_items, list) or not raw_items:
        return _reject_tool_call(session, "items_required", args)

    results: list[dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            results.append(
                {
                    "accepted": False,
                    "reason": "invalid_item",
                    "topic": None,
                }
            )
            continue
        results.append(_mark_item_covered(session, item))

    accepted = [result for result in results if result.get("accepted")]
    return {
        "accepted": bool(accepted),
        "acceptedCount": len(accepted),
        "results": results,
    }


def _mark_item_covered(session: LiveSessionState, args: dict[str, Any]) -> dict[str, Any]:
    if session.status != "active":
        return _reject_tool_call(session, "session_not_active", args)

    item_id = _clean_arg(args.get("item_id") or args.get("itemId"))
    evidence = _clean_arg(args.get("evidence"))
    reason = _clean_arg(args.get("reason"))

    if not item_id:
        return _reject_tool_call(session, "item_id_required", args)

    topic = _topic_by_id(session, item_id)
    if not topic:
        return _reject_tool_call(session, "unknown_item", args)
    if topic.category not in {"goal", "question"}:
        return _reject_tool_call(session, "item_not_checkable", args)
    if topic.manual_override:
        return _reject_tool_call(session, "manual_override_locked", args, topic=topic)
    if topic.checked:
        return _reject_tool_call(session, "already_checked", args, topic=topic)

    if reason not in {"question_asked", "goal_covered"}:
        reason = "question_asked" if topic.category == "question" else "goal_covered"
    if not evidence:
        evidence = "Realtime checklist assistant marked this item as covered from the live call audio."

    checked_at = _now_iso()
    topic.checked = True
    topic.checked_by = "gpt_realtime"
    topic.checked_at = checked_at
    topic.evidence = evidence

    event = _append_event(
        session,
        "topic_checked",
        {
            "sessionId": session.session_id,
            "topic": topic.to_dict(),
            "reason": reason,
            "source": "gpt_realtime",
        },
    )
    logger.info("Realtime checked topic %s in session %s", topic.id, session.session_id)
    return {
        "accepted": True,
        "event": event.to_dict(),
        "topic": topic.to_dict(),
    }


def _topic_by_id(session: LiveSessionState, item_id: str) -> LiveTopicState | None:
    for topic in session.topics:
        if topic.id == item_id:
            return topic
    return None


def _clean_arg(value: Any) -> str:
    if not isinstance(value, str):
        if isinstance(value, int):
            return str(value)
        return ""
    return " ".join(value.strip().split())


def _append_event(session: LiveSessionState, event_type: str, data: dict[str, Any]) -> LiveSessionEvent:
    event = LiveSessionEvent(
        id=str(len(session.events) + 1),
        type=event_type,
        created_at=_now_iso(),
        data=data,
    )
    session.events.append(event)
    if event_type == "topic_checked":
        logger.warning(
            "Emitting topic_checked session=%s topic_id=%s queues=%s",
            session.session_id,
            ((data.get("topic") or {}).get("id") if isinstance(data.get("topic"), dict) else None),
            len(_event_queues.get(session.session_id, [])),
        )
    for queue in _event_queues.get(session.session_id, []):
        queue.put_nowait(event)
    return event


def _reject_tool_call(
    session: LiveSessionState,
    reason: str,
    args: dict[str, Any],
    *,
    topic: LiveTopicState | None = None,
) -> dict[str, Any]:
    logger.info(
        "Rejected Realtime tool call in session %s: reason=%s args=%s",
        session.session_id,
        reason,
        args,
    )
    return {
        "accepted": False,
        "reason": reason,
        "topic": topic.to_dict() if topic else None,
    }
