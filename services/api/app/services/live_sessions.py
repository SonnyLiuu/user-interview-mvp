from __future__ import annotations

import base64
import binascii
import asyncio
import hashlib
import hmac
import json
import logging
import re
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from ..core.config import get_settings
from ..core.db import get_pool
from ..core.errors import BadRequestError, NotFoundError, UnauthorizedError
from ..repositories import call_prep as call_prep_repo
from ..repositories import people as people_repo
from .call_prep import fallback_call_brief_content, normalize_call_brief_content
from ..domain.project_context import normalize_json
from .realtime_bridge import ChecklistEvaluator, NormalizedTurn
from .source_transcription_bridge import SourceTranscriptionBridge
from .transcript_parser import apply_speaker_map, parse_transcript
from .zoom_meetings import normalize_zoom_meeting_identifier


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
    external_turn_id: str | None
    created_at: str

    def to_dict(self) -> dict:
        return {
            "speaker": self.speaker,
            "source": self.source,
            "text": self.text,
            "externalTurnId": self.external_turn_id,
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
    capture_provider: str = "desktop_audio"
    audio_capture_enabled: bool = False
    zoom_meeting_identifier: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
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
            "captureProvider": self.capture_provider,
            "audioCaptureEnabled": self.audio_capture_enabled,
            "zoomMeetingIdentifier": self.zoom_meeting_identifier,
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
_bridges: dict[str, ChecklistEvaluator] = {}
_transcription_bridges: dict[str, SourceTranscriptionBridge] = {}
_event_queues: dict[str, list[asyncio.Queue[LiveSessionEvent]]] = {}

_DIAGNOSTIC_TRANSCRIPT_LINE_RE = re.compile(
    r"""
    ^\s*
    (?:[A-Za-z]+:\s*)?
    (?:
        (?:Realtime|REST|Transcription|Desktop\ audio|Sent\ transcription|Starting\ (?:source\ transcription|realtime|REST|mock\ realtime)|Signal\ auto-detected|Emitting\ topic_checked|Transcript\ turn)
        \b.*\bsession=[0-9a-f-]{8,}.*
      |
        INFO:\s+\d{1,3}(?:\.\d{1,3}){3}:\d+\s+-\s+".*?/v1/desktop/live-sessions/.*
      |
        HTTP/\d(?:\.\d)?"?\s+\d{3}\s+\w+
    )
    \s*$
    """,
    re.IGNORECASE | re.VERBOSE,
)


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


def _verify_live_session_token_payload(token: str) -> dict[str, Any]:
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
    try:
        actual = _b64url_decode(signature_part)
    except (ValueError, binascii.Error) as exc:
        raise UnauthorizedError("Invalid live session token") from exc
    if not hmac.compare_digest(expected, actual):
        raise UnauthorizedError("Invalid live session token signature")

    try:
        payload = json.loads(_b64url_decode(payload_part).decode("utf-8"))
    except (ValueError, binascii.Error, UnicodeDecodeError) as exc:
        raise UnauthorizedError("Invalid live session token") from exc
    if not isinstance(payload, dict):
        raise UnauthorizedError("Invalid live session token")
    if payload.get("typ") != "desktop_live_session":
        raise UnauthorizedError("Invalid live session token type")
    if payload.get("exp", 0) < int(time.time()):
        raise UnauthorizedError("Live session token expired")

    return payload


async def _session_for_token(token: str) -> LiveSessionState:
    payload = _verify_live_session_token_payload(token)
    session = _sessions.get(payload.get("sid") or "")
    if session and session.user_id == payload.get("sub"):
        _ensure_active_session_runtime(session)
        return session

    session = await _load_session_from_db(payload.get("sid") or "", payload.get("sub") or "")
    if not session:
        raise UnauthorizedError("Live session not found")
    _sessions[session.session_id] = session
    _ensure_active_session_runtime(session)
    return session


async def _require_session_for_token(
    session_id: str,
    live_token: str,
    *,
    active: bool = False,
) -> LiveSessionState:
    session = await _session_for_token(live_token)
    if session.session_id != session_id:
        raise UnauthorizedError("Live session token does not match session")
    if active and session.status != "active":
        raise NotFoundError("Live session is not active")
    return session


def verify_live_session_token(token: str) -> LiveSessionState:
    payload = _verify_live_session_token_payload(token)
    session = _sessions.get(payload.get("sid") or "")
    if not session or session.user_id != payload.get("sub"):
        raise UnauthorizedError("Live session not found")
    return session


def _ensure_active_session_runtime(session: LiveSessionState) -> None:
    if session.status != "active":
        return
    if session.session_id not in _bridges:
        _start_realtime_bridge(session)
    if session.audio_capture_enabled and session.session_id not in _transcription_bridges:
        _start_transcription_bridge(session)


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
    settings = get_settings()
    provider = settings.checklist_ai_provider.strip().lower()
    if provider:
        return provider
    return settings.ai_provider.strip().lower() or "openai"


def _speaker_for_source(source: str) -> str:
    if source == "mic":
        return "Founder"
    if source == "loopback":
        return "Interviewee"
    if source in {"external", "manual_upload"}:
        return "Speaker"
    return "Unknown"


def format_transcript(session: LiveSessionState) -> str:
    return "\n".join(
        f"{turn.speaker}: {turn.text}" for turn in session.transcript_turns
    )


def _capture_provider(value: str | None) -> str:
    provider = (value or "desktop_audio").strip().lower()
    if provider not in {"desktop_audio", "manual_upload"}:
        raise BadRequestError("Unsupported capture provider")
    return provider


def _topic_from_dict(value: dict[str, Any]) -> LiveTopicState:
    return LiveTopicState(
        id=str(value.get("id") or ""),
        label=str(value.get("label") or ""),
        category=str(value.get("category") or "goal"),
        checked=bool(value.get("checked")),
        checked_by=value.get("checkedBy") or value.get("checked_by"),
        checked_at=value.get("checkedAt") or value.get("checked_at"),
        evidence=value.get("evidence"),
        manual_override=bool(value.get("manualOverride") or value.get("manual_override")),
    )


def _turn_from_row(row: Any) -> LiveTranscriptTurn:
    return LiveTranscriptTurn(
        speaker=row["speaker"] or _speaker_for_source(row["source"] or "external"),
        source=row["source"] or "external",
        text=row["text"] or "",
        external_turn_id=row["external_turn_id"],
        created_at=row["created_at"].isoformat().replace("+00:00", "Z"),
    )


def _session_from_row(row: Any, turns: list[LiveTranscriptTurn]) -> LiveSessionState:
    topics_raw = normalize_json(row["topics_json"]) or []
    topics = [
        _topic_from_dict(topic)
        for topic in topics_raw
        if isinstance(topic, dict)
    ]
    started_at = row["started_at"].isoformat().replace("+00:00", "Z")
    ended_at = row["ended_at"].isoformat().replace("+00:00", "Z") if row["ended_at"] else None
    return LiveSessionState(
        session_id=str(row["id"]),
        user_id=str(row["user_id"]),
        person_id=str(row["person_id"]),
        person_name=row["person_name"] or "Unnamed person",
        status=row["status"] or "active",
        started_at=started_at,
        capture_provider=row["capture_provider"] or "desktop_audio",
        audio_capture_enabled=(row["capture_provider"] == "desktop_audio"),
        zoom_meeting_identifier=row["zoom_meeting_identifier"],
        metadata=normalize_json(row["metadata"]) or {},
        topics=topics,
        ended_at=ended_at,
        transcript_turns=turns,
    )


async def _load_session_from_db(session_id: str, user_id: str | None = None) -> LiveSessionState | None:
    pool = get_pool()
    async with pool.acquire() as conn:
        if user_id:
            row = await conn.fetchrow(
                """
                select lcs.*, p.name as person_name
                from live_call_sessions lcs
                left join people p on p.id = lcs.person_id
                where lcs.id = $1::uuid and lcs.user_id = $2
                limit 1
                """,
                session_id,
                user_id,
            )
        else:
            row = await conn.fetchrow(
                """
                select lcs.*, p.name as person_name
                from live_call_sessions lcs
                left join people p on p.id = lcs.person_id
                where lcs.id = $1::uuid
                limit 1
                """,
                session_id,
            )
        if not row:
            return None
        turn_rows = await conn.fetch(
            """
            select * from live_transcript_turns
            where live_session_id = $1::uuid
            order by created_at asc, id asc
            """,
            session_id,
        )
    return _session_from_row(row, [_turn_from_row(turn) for turn in turn_rows])


def _parse_iso(value: str | None) -> datetime | None:
    """Parse an ISO-8601 string to a timezone-aware datetime for DB storage."""
    if not value:
        return None
    # Handle 'Z' suffix and timezone offsets
    normalized = value.replace("Z", "+00:00")
    return datetime.fromisoformat(normalized)


async def _persist_session(session: LiveSessionState) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            insert into live_call_sessions (
                id, user_id, person_id, status, capture_provider,
                zoom_meeting_identifier, topics_json, metadata, started_at, ended_at, updated_at
            )
            values ($1::uuid, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::timestamptz, $10::timestamptz, now())
            on conflict (id) do update set
                status = excluded.status,
                capture_provider = excluded.capture_provider,
                zoom_meeting_identifier = excluded.zoom_meeting_identifier,
                topics_json = excluded.topics_json,
                metadata = excluded.metadata,
                ended_at = excluded.ended_at,
                updated_at = now()
            """,
            session.session_id,
            session.user_id,
            session.person_id,
            session.status,
            session.capture_provider,
            session.zoom_meeting_identifier,
            json.dumps([topic.to_dict() for topic in session.topics]),
            json.dumps(session.metadata),
            _parse_iso(session.started_at),
            _parse_iso(session.ended_at),
        )


async def _persist_topics(session: LiveSessionState) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            update live_call_sessions
            set topics_json = $2::jsonb, status = $3, ended_at = $4::timestamptz, updated_at = now()
            where id = $1::uuid
            """,
            session.session_id,
            json.dumps([topic.to_dict() for topic in session.topics]),
            session.status,
            _parse_iso(session.ended_at),
        )


async def _persist_transcript_turn(session: LiveSessionState, turn: LiveTranscriptTurn) -> bool:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            insert into live_transcript_turns (
                live_session_id, source, speaker, text, external_turn_id, created_at
            )
            values ($1::uuid, $2, $3, $4, $5, $6::timestamptz)
            on conflict (live_session_id, external_turn_id) where external_turn_id is not null do nothing
            returning id
            """,
            session.session_id,
            turn.source,
            turn.speaker,
            turn.text,
            turn.external_turn_id,
            _parse_iso(turn.created_at),
        )
    return bool(row)


async def start_live_session(
    user_id: str,
    person_id: str,
    *,
    capture_provider: str = "desktop_audio",
    zoom_meeting_identifier: str | None = None,
) -> dict:
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

    provider = _capture_provider(capture_provider)
    normalized_zoom_meeting_identifier = normalize_zoom_meeting_identifier(zoom_meeting_identifier)
    session = LiveSessionState(
        session_id=str(uuid.uuid4()),
        user_id=user_id,
        person_id=person_id,
        person_name=person["name"] or "Unnamed person",
        status="active",
        started_at=_now_iso(),
        capture_provider=provider,
        audio_capture_enabled=provider == "desktop_audio" and _checklist_provider() != "mock",
        zoom_meeting_identifier=normalized_zoom_meeting_identifier,
        topics=_topics_from_call_brief(content),
    )
    _sessions[session.session_id] = session
    try:
        await _persist_session(session)
    except Exception:
        logger.exception(
            "Failed to persist live session %s (continuing in-memory only)",
            session.session_id,
        )
    _start_realtime_bridge(session)
    if session.audio_capture_enabled:
        _start_transcription_bridge(session)

    token = sign_live_session_token(session)
    return session.to_dict(include_token=token)


async def get_live_session(session_id: str, live_token: str) -> dict:
    session = await _require_session_for_token(session_id, live_token)
    return session.to_dict()


async def override_live_session_topic(
    session_id: str,
    live_token: str,
    topic_id: str,
    *,
    checked: bool,
) -> dict:
    session = await _require_session_for_token(session_id, live_token, active=True)

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
    await _persist_topics(session)
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
    session = await _require_session_for_token(session_id, live_token)
    if session.status != "active":
        return False
    if not session.audio_capture_enabled:
        logger.warning(
            "Ignoring desktop audio for capture_provider=%s session=%s",
            session.capture_provider,
            session.session_id,
        )
        return False
    if source in {"mixed", "unknown"}:
        logger.warning(
            "Ignoring unlabeled audio for hybrid matcher session=%s source=%s",
            session.session_id,
            source,
        )
        return False
    if _checklist_provider() == "mock":
        # Mock: silently acknowledge audio without generating fake transcript text.
        # The transcript only gets real content via the Paste Transcript feature.
        return True
    transcriber = _transcription_bridges.get(session.session_id)
    if not transcriber:
        return False
    return await transcriber.send_audio(source, audio)


async def ingest_live_transcript_turn(
    session_id: str,
    live_token: str,
    *,
    source: str,
    speaker: str | None = None,
    transcript: str,
    external_turn_id: str | None = None,
) -> dict[str, Any]:
    session = await _require_session_for_token(session_id, live_token, active=True)

    recorded_turn = await _handle_transcript_turn(
        session,
        source,
        transcript,
        speaker=speaker,
        external_turn_id=external_turn_id,
    )
    if recorded_turn is None and external_turn_id:
        recorded_turn = _transcript_turn_by_external_id(session, external_turn_id)
    if recorded_turn is None:
        raise BadRequestError("Transcript text is required")

    return {
        "sessionId": session.session_id,
        "turn": recorded_turn.to_dict(),
        "transcriptRaw": format_transcript(session),
    }


async def ingest_transcript_upload(
    session_id: str,
    live_token: str,
    *,
    content: bytes,
    filename: str,
    speaker_map: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Parse an uploaded transcript file and ingest all turns into a live session."""
    session = await _require_session_for_token(session_id, live_token, active=True)

    turns = parse_transcript(content, filename)
    if not turns:
        raise BadRequestError("No transcript turns found in the uploaded file")

    turns = apply_speaker_map(turns, speaker_map)

    ingested: list[dict[str, Any]] = []
    for i, turn in enumerate(turns):
        external_id = f"upload_{filename}_{i + 1}"
        recorded_turn = await _handle_transcript_turn(
            session,
            source="manual_upload",
            transcript=turn.text,
            speaker=turn.speaker,
            external_turn_id=external_id,
        )
        if recorded_turn is not None:
            ingested.append(recorded_turn.to_dict())

    logger.info(
        "Transcript upload session=%s file=%s turns_parsed=%s turns_ingested=%s",
        session.session_id,
        filename,
        len(turns),
        len(ingested),
    )

    return {
        "sessionId": session.session_id,
        "turnsIngested": len(ingested),
        "turns": ingested,
    }


async def stream_live_session_events(
    session_id: str,
    live_token: str,
) -> AsyncIterator[dict[str, Any]]:
    session = await _require_session_for_token(session_id, live_token)

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
    session = await _require_session_for_token(session_id, live_token)
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
        await _persist_topics(session)
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
    bridge = ChecklistEvaluator(
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
    *,
    speaker: str | None = None,
    external_turn_id: str | None = None,
) -> LiveTranscriptTurn | None:
    text = _clean_transcript_text(transcript)
    if not text:
        return None
    speaker_label = _clean_arg(speaker) or _speaker_for_source(source)
    turn = LiveTranscriptTurn(
        speaker=speaker_label,
        source=source,
        text=text,
        external_turn_id=_clean_arg(external_turn_id) or None,
        created_at=_now_iso(),
    )
    if not await _persist_transcript_turn(session, turn):
        return None
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
        normalized = _normalize_turn(session.capture_provider, source, text, speaker_label)
        await bridge.send_labeled_turn(normalized)

    # --- Signal auto-detection: simple keyword matching for signal topics ---
    await _detect_signals(session, text)

    return turn


def _transcript_turn_by_external_id(
    session: LiveSessionState,
    external_turn_id: str | None,
) -> LiveTranscriptTurn | None:
    external_id = _clean_arg(external_turn_id)
    if not external_id:
        return None
    for turn in session.transcript_turns:
        if turn.external_turn_id == external_id:
            return turn
    return None


def _normalize_turn(
    capture_provider: str,
    source: str,
    text: str,
    speaker_label: str,
) -> NormalizedTurn:
    """Convert a raw transcript turn into a provider-agnostic NormalizedTurn."""
    import time as _time
    return NormalizedTurn(
        provider=capture_provider or "desktop_audio",
        speaker_label=speaker_label,
        text=text,
        timestamp_ms=int(_time.time() * 1000),
    )


async def _handle_realtime_tool_call(
    session: LiveSessionState,
    name: str,
    args: dict[str, Any],
) -> dict[str, Any]:
    if name == "mark_items_covered":
        return await _mark_items_covered(session, args)
    if name != "mark_item_covered":
        return _reject_tool_call(session, "unsupported_tool", args)

    return await _mark_item_covered(session, args)


async def _mark_items_covered(session: LiveSessionState, args: dict[str, Any]) -> dict[str, Any]:
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
        results.append(await _mark_item_covered(session, item))

    accepted = [result for result in results if result.get("accepted")]
    return {
        "accepted": bool(accepted),
        "acceptedCount": len(accepted),
        "results": results,
    }


# --- Signal auto-detection ---
# Simple keyword-based detection for signal-type checklist items.
# Signal topics track behavioral indicators (workarounds, referrals, buying signals)
# that are harder for the AI to detect via the standard prompt. This runs on every
# transcript turn and checks signal topics against accumulated transcript text.

_SIGNAL_KEYWORD_GROUPS: dict[str, list[list[str]]] = {
    # "They describe a recent, repeated, or expensive workaround."
    "workaround": [
        ["workaround", "manual", "spreadsheet", "excel"],
        ["export", "copy", "paste", "email"],
        ["hack", "duct tape", "band-aid", "temporary"],
        ["pain", "frustrating", "annoying", "waste time", "takes forever"],
        ["expensive", "costs us", "spending", "paying for"],
    ],
    # "They can name other people who share or own the problem."
    "referral": [
        ["you should talk to", "speak with", "connect you"],
        ["my colleague", "my team", "my boss", "my manager"],
        ["other people", "other teams", "other departments"],
        ["also has this", "same problem", "similar issue", "deals with"],
        ["not just me", "everyone", "whole team"],
    ],
    # "They ask to see the solution or offer a relevant introduction."
    "buying_signal": [
        ["show me", "demo", "see it", "try it"],
        ["how does it work", "what does it do", "can it"],
        ["pricing", "how much", "cost", "trial"],
        ["next steps", "follow up", "let me introduce"],
        ["when can we", "how soon", "timeline"],
    ],
}


def _detect_signal_hit(signal_type: str, text_lower: str, full_transcript: str) -> bool:
    """Check if a transcript turn + accumulated context matches signal patterns."""
    groups = _SIGNAL_KEYWORD_GROUPS.get(signal_type, [])
    if not groups:
        return False

    # Search both the current turn and the last ~2000 chars of full transcript
    search_text = (full_transcript[-2000:] + " " + text_lower).lower()

    # A group matches if ALL keywords in the group appear in the text
    for group in groups:
        if all(keyword.lower() in search_text for keyword in group):
            return True
    return False


async def _detect_signals(session: LiveSessionState, turn_text: str) -> None:
    """Check un-checked signal topics against the current transcript turn."""
    if session.status != "active":
        return

    text_lower = turn_text.lower()
    full_transcript = format_transcript(session)

    for topic in session.topics:
        if topic.category != "signal":
            continue
        if topic.checked or topic.manual_override:
            continue

        label_lower = topic.label.lower()
        signal_type = None

        if "workaround" in label_lower or "hack" in label_lower:
            signal_type = "workaround"
        elif "other people" in label_lower or "share" in label_lower or "introduction" in label_lower:
            signal_type = "referral"
        elif "see the solution" in label_lower or "ask to see" in label_lower or "offer" in label_lower:
            signal_type = "buying_signal"

        if signal_type and _detect_signal_hit(signal_type, text_lower, full_transcript):
            checked_at = _now_iso()
            topic.checked = True
            topic.checked_by = "signal_detection"
            topic.checked_at = checked_at
            topic.evidence = f"Signal detected from transcript: {turn_text[:200]}"

            _append_event(
                session,
                "topic_checked",
                {
                    "sessionId": session.session_id,
                    "topic": topic.to_dict(),
                    "reason": "signal_detected",
                    "source": "signal_detection",
                },
            )
            await _persist_topics(session)
            logger.warning(
                "Signal auto-detected session=%s topic=%s type=%s",
                session.session_id,
                topic.id,
                signal_type,
            )


async def _mark_item_covered(session: LiveSessionState, args: dict[str, Any]) -> dict[str, Any]:
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
    await _persist_topics(session)
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


def _clean_transcript_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    lines = []
    for line in value.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        cleaned = " ".join(line.strip().split())
        if not cleaned or _DIAGNOSTIC_TRANSCRIPT_LINE_RE.match(cleaned):
            continue
        lines.append(cleaned)
    return " ".join(lines)


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
