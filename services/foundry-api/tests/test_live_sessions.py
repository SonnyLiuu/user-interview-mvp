from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from app.services import live_sessions
from app.services.live_sessions import (
    LiveSessionState,
    LiveTranscriptTurn,
    ingest_live_transcript_turn,
    ingest_transcript_upload,
)


class LiveSessionServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        live_sessions._sessions.clear()
        live_sessions._bridges.clear()
        live_sessions._transcription_bridges.clear()

    def tearDown(self) -> None:
        live_sessions._sessions.clear()
        live_sessions._bridges.clear()
        live_sessions._transcription_bridges.clear()

    async def test_duplicate_external_turn_returns_existing_turn(self) -> None:
        session = LiveSessionState(
            session_id="session-1",
            user_id="user-1",
            person_id="person-1",
            person_name="Taylor",
            status="active",
            started_at="2026-01-01T00:00:00Z",
            transcript_turns=[
                LiveTranscriptTurn(
                    speaker="Founder",
                    source="external",
                    text="Original duplicate",
                    external_turn_id="turn-1",
                    created_at="2026-01-01T00:00:01Z",
                ),
                LiveTranscriptTurn(
                    speaker="Speaker",
                    source="external",
                    text="Later turn",
                    external_turn_id="turn-2",
                    created_at="2026-01-01T00:00:02Z",
                ),
            ],
        )

        with (
            patch.object(
                live_sessions,
                "_require_session_for_token",
                AsyncMock(return_value=session),
            ),
            patch.object(
                live_sessions,
                "_persist_transcript_turn",
                AsyncMock(return_value=False),
            ),
            patch.object(live_sessions, "_append_event") as append_event,
            patch.object(live_sessions, "_detect_signals", AsyncMock()),
        ):
            result = await ingest_live_transcript_turn(
                "session-1",
                "token",
                source="external",
                transcript="Duplicate retry",
                external_turn_id="turn-1",
            )

        self.assertEqual(result["turn"]["externalTurnId"], "turn-1")
        self.assertEqual(result["turn"]["text"], "Original duplicate")
        self.assertEqual(len(session.transcript_turns), 2)
        append_event.assert_not_called()

    async def test_transcript_upload_does_not_count_duplicate_turns(self) -> None:
        session = LiveSessionState(
            session_id="session-1",
            user_id="user-1",
            person_id="person-1",
            person_name="Taylor",
            status="active",
            started_at="2026-01-01T00:00:00Z",
        )

        with (
            patch.object(
                live_sessions,
                "_require_session_for_token",
                AsyncMock(return_value=session),
            ),
            patch.object(
                live_sessions,
                "_persist_transcript_turn",
                AsyncMock(return_value=False),
            ),
            patch.object(live_sessions, "_append_event") as append_event,
            patch.object(live_sessions, "_detect_signals", AsyncMock()),
        ):
            result = await ingest_transcript_upload(
                "session-1",
                "token",
                content=b"Founder: Tell me about the workflow.",
                filename="call.txt",
            )

        self.assertEqual(result["turnsIngested"], 0)
        self.assertEqual(result["turns"], [])
        self.assertEqual(session.transcript_turns, [])
        append_event.assert_not_called()

    async def test_diagnostic_transcript_turn_is_rejected(self) -> None:
        session = LiveSessionState(
            session_id="38a76cd6-a322-48e4-a528-9eb71cbc294a",
            user_id="user-1",
            person_id="person-1",
            person_name="Taylor",
            status="active",
            started_at="2026-01-01T00:00:00Z",
        )

        with (
            patch.object(
                live_sessions,
                "_require_session_for_token",
                AsyncMock(return_value=session),
            ),
            patch.object(
                live_sessions,
                "_persist_transcript_turn",
                AsyncMock(return_value=True),
            ) as persist_turn,
            patch.object(live_sessions, "_append_event") as append_event,
            patch.object(live_sessions, "_detect_signals", AsyncMock()),
        ):
            with self.assertRaises(live_sessions.BadRequestError):
                await ingest_live_transcript_turn(
                    "session-1",
                    "token",
                    source="loopback",
                    transcript=(
                        "Desktop audio websocket received "
                        "session=38a76cd6-a322-48e4-a528-9eb71cbc294a "
                        "source=mic chunks=17500 bytes=8399982"
                    ),
                )

        self.assertEqual(session.transcript_turns, [])
        persist_turn.assert_not_called()
        append_event.assert_not_called()

    async def test_multiline_transcript_turn_strips_diagnostics(self) -> None:
        session = LiveSessionState(
            session_id="38a76cd6-a322-48e4-a528-9eb71cbc294a",
            user_id="user-1",
            person_id="person-1",
            person_name="Taylor",
            status="active",
            started_at="2026-01-01T00:00:00Z",
        )

        with (
            patch.object(
                live_sessions,
                "_require_session_for_token",
                AsyncMock(return_value=session),
            ),
            patch.object(
                live_sessions,
                "_persist_transcript_turn",
                AsyncMock(return_value=True),
            ),
            patch.object(live_sessions, "_append_event"),
            patch.object(live_sessions, "_detect_signals", AsyncMock()),
        ):
            result = await ingest_live_transcript_turn(
                "session-1",
                "token",
                source="external",
                transcript=(
                    "Realtime requested tool "
                    "session=38a76cd6-a322-48e4-a528-9eb71cbc294a "
                    "name=mark_item_covered\n"
                    "Founder: What is painful about the current workflow?"
                ),
            )

        self.assertEqual(
            result["turn"]["text"],
            "Founder: What is painful about the current workflow?",
        )

    async def test_loaded_active_session_restarts_runtime_bridges(self) -> None:
        session = LiveSessionState(
            session_id="session-1",
            user_id="user-1",
            person_id="person-1",
            person_name="Taylor",
            status="active",
            started_at="2026-01-01T00:00:00Z",
            capture_provider="desktop_audio",
            audio_capture_enabled=True,
        )

        with (
            patch.object(
                live_sessions,
                "_verify_live_session_token_payload",
                return_value={"sid": "session-1", "sub": "user-1"},
            ),
            patch.object(
                live_sessions,
                "_load_session_from_db",
                AsyncMock(return_value=session),
            ),
            patch.object(live_sessions, "_start_realtime_bridge") as start_realtime,
            patch.object(live_sessions, "_start_transcription_bridge") as start_transcription,
        ):
            result = await live_sessions._session_for_token("token")

        self.assertIs(result, session)
        self.assertIs(live_sessions._sessions["session-1"], session)
        start_realtime.assert_called_once_with(session)
        start_transcription.assert_called_once_with(session)


if __name__ == "__main__":
    unittest.main()
