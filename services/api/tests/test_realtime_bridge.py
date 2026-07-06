from __future__ import annotations

import asyncio
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.services import realtime_bridge, source_transcription_bridge
from app.services.realtime_bridge import ChecklistEvaluator, NormalizedTurn


def _azure_settings(
    *,
    deployment: str = "gpt-realtime-1.5",
    transcription_deployment: str | None = None,
    checklist_provider: str = "azure",
) -> SimpleNamespace:
    return SimpleNamespace(
        ai_provider="openai",
        checklist_ai_provider=checklist_provider,
        azure_openai_realtime_endpoint="https://example.openai.azure.com/",
        azure_openai_realtime_api_key="test-key",
        azure_openai_realtime_deployment=deployment,
        azure_openai_transcription_deployment=transcription_deployment,
        openai_api_key=None,
        openai_realtime_api_key=None,
        openai_realtime_model="gpt-realtime",
        ai_request_timeout_seconds=30,
    )


def _session(**overrides) -> SimpleNamespace:
    base = dict(
        session_id="session-1",
        user_id="user-1",
        person_name="Taylor",
        status="active",
        realtime_status="connected",
        topics=[],
        transcript_turns=[],
    )
    base.update(overrides)
    return SimpleNamespace(**base)


def _topic(topic_id: str, category: str, label: str, *, checked: bool = False, manual_override: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        id=topic_id,
        category=category,
        label=label,
        checked=checked,
        manual_override=manual_override,
    )


def _turn(speaker: str, text: str) -> SimpleNamespace:
    return SimpleNamespace(speaker=speaker, text=text)


async def wait_for(predicate, *, timeout: float = 2.0) -> None:
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        if predicate():
            return
        await asyncio.sleep(0.01)
    raise AssertionError("condition not met before timeout")


class FakeTransport(realtime_bridge._EvaluationTransport):
    provider = "fake"
    target = "fake"
    model = "fake"

    def __init__(self, results: list | None = None) -> None:
        self.calls: list[tuple[str, str]] = []  # (rubric, prompt)
        self.results = list(results or [])
        self.closed = 0
        self.prepared = 0

    async def prepare(self) -> None:
        self.prepared += 1

    async def evaluate(self, rubric: str, prompt: str) -> list[tuple[str, dict]]:
        self.calls.append((rubric, prompt))
        result = self.results.pop(0) if self.results else []
        if isinstance(result, Exception):
            raise result
        return result

    async def close(self) -> None:
        self.closed += 1


class FakeRealtimeWS:
    def __init__(self, events: list[dict]) -> None:
        self.sent: list[dict] = []
        self._events = list(events)

    async def send(self, payload: str) -> None:
        self.sent.append(json.loads(payload))

    async def recv(self) -> str:
        if not self._events:
            raise AssertionError("no more scripted events")
        return json.dumps(self._events.pop(0))

    async def close(self) -> None:
        pass


class ConnectionConfigTests(unittest.IsolatedAsyncioTestCase):
    async def test_azure_realtime_uses_ga_url_for_gpt_realtime_deployment(self) -> None:
        with patch.object(realtime_bridge, "get_settings", return_value=_azure_settings()):
            config = realtime_bridge._realtime_connection_config("azure", _session())

        self.assertEqual(
            config.url,
            "wss://example.openai.azure.com/openai/v1/realtime?model=gpt-realtime-1.5",
        )
        self.assertNotIn("api-version=2024-10-01-preview", config.url)

    async def test_azure_transcription_deployment_uses_input_transcription_mode(self) -> None:
        with patch.object(
            source_transcription_bridge,
            "get_settings",
            return_value=_azure_settings(transcription_deployment="gpt-4o-transcribe-prod"),
        ):
            config = source_transcription_bridge._connection_config(_session())

        self.assertEqual(config.mode, "input_transcription")
        self.assertEqual(config.model, "gpt-4o-transcribe-prod")

    async def test_azure_transcription_uses_ga_url_for_gpt_realtime_deployment(self) -> None:
        with patch.object(
            source_transcription_bridge,
            "get_settings",
            return_value=_azure_settings(),
        ):
            config = source_transcription_bridge._connection_config(_session())

        self.assertEqual(
            config.url,
            "wss://example.openai.azure.com/openai/v1/realtime?model=gpt-realtime-1.5",
        )
        self.assertNotIn("api-version=2024-10-01-preview", config.url)
        self.assertEqual(config.mode, "realtime_text")


class WSTransportTests(unittest.IsolatedAsyncioTestCase):
    def _azure_config(self) -> realtime_bridge.RealtimeConnectionConfig:
        return realtime_bridge.RealtimeConnectionConfig(
            url="wss://example.openai.azure.com/openai/v1/realtime?model=gpt-realtime-1.5",
            headers={"api-key": "test-key"},
            model="gpt-realtime-1.5",
            provider="azure",
            target="example.openai.azure.com",
        )

    async def test_session_update_sets_type_but_not_model_for_azure(self) -> None:
        fake_ws = FakeRealtimeWS([])
        transport = realtime_bridge._RealtimeWSTransport(self._azure_config())
        with patch.object(realtime_bridge.websockets, "connect", AsyncMock(return_value=fake_ws)):
            await transport.prepare()

        session_update = fake_ws.sent[0]
        self.assertEqual(session_update["type"], "session.update")
        # The GA realtime API requires session.type on Azure too; the model is
        # selected by the URL query param instead.
        self.assertEqual(session_update["session"]["type"], "realtime")
        self.assertNotIn("model", session_update["session"])

    async def test_evaluation_is_out_of_band_with_tools_and_dedupes_calls(self) -> None:
        arguments = json.dumps(
            {"items": [{"item_id": "4", "evidence": "asked", "reason": "question_asked"}]}
        )
        fake_ws = FakeRealtimeWS(
            [
                {"type": "response.created"},
                {
                    "type": "response.function_call_arguments.done",
                    "call_id": "call-1",
                    "name": "mark_items_covered",
                    "arguments": arguments,
                },
                {
                    "type": "response.output_item.done",
                    "item": {
                        "type": "function_call",
                        "call_id": "call-1",
                        "name": "mark_items_covered",
                        "arguments": arguments,
                    },
                },
                {"type": "response.done"},
            ]
        )
        transport = realtime_bridge._RealtimeWSTransport(self._azure_config())
        transport._ws = fake_ws

        calls = await transport.evaluate("the rubric", "the prompt")

        # Duplicate delivery of the same call_id collapses to one tool call.
        self.assertEqual(len(calls), 1)
        name, args = calls[0]
        self.assertEqual(name, "mark_items_covered")
        self.assertEqual(args["items"][0]["item_id"], "4")

        response_create = fake_ws.sent[0]
        self.assertEqual(response_create["type"], "response.create")
        response = response_create["response"]
        # Stateless: out-of-band conversation with per-response config.
        self.assertEqual(response["conversation"], "none")
        self.assertEqual(response["instructions"], "the rubric")
        self.assertEqual(
            {tool["name"] for tool in response["tools"]},
            {"mark_item_covered", "mark_items_covered"},
        )
        self.assertEqual(response["input"][0]["content"][0]["text"], "the prompt")

    async def test_error_event_raises(self) -> None:
        fake_ws = FakeRealtimeWS(
            [{"type": "error", "error": {"message": "boom"}}]
        )
        transport = realtime_bridge._RealtimeWSTransport(self._azure_config())
        transport._ws = fake_ws

        with self.assertRaises(RuntimeError):
            await transport.evaluate("rubric", "prompt")


class ChecklistEvaluatorTests(unittest.IsolatedAsyncioTestCase):
    def _patches(self, settings: SimpleNamespace):
        return (
            patch.object(realtime_bridge, "get_settings", return_value=settings),
            patch.object(realtime_bridge, "_DEBOUNCE_SECONDS", 0.01),
            patch.object(realtime_bridge, "_BACKOFF_BASE_SECONDS", 0.01),
        )

    async def test_turn_triggers_debounced_full_evaluation(self) -> None:
        session = _session(
            topics=[
                _topic("1", "question", "When did you last hit this problem?"),
                _topic("2", "goal", "Learn the workaround", checked=True),
                _topic("3", "signal", "They ask for a demo"),
            ],
            transcript_turns=[_turn("Founder", "When did you last hit this problem?")],
        )
        transport = FakeTransport(results=[[("mark_item_covered", {"item_id": "1"})]])
        tool_calls: list[tuple[str, dict]] = []

        async def on_tool_call(name: str, args: dict) -> dict:
            tool_calls.append((name, args))
            return {"accepted": True}

        p1, p2, p3 = self._patches(_azure_settings())
        with p1, p2, p3:
            evaluator = ChecklistEvaluator(
                session,
                on_tool_call=on_tool_call,
                on_status=lambda _status, _error: None,
                transport_factory=lambda: transport,
            )
            evaluator.start()
            try:
                await evaluator.send_labeled_turn(NormalizedTurn("test", "Founder", "hello"))
                await wait_for(lambda: len(transport.calls) == 1)
            finally:
                await evaluator.stop()

        rubric, prompt = transport.calls[0]
        self.assertIn("silent checklist assistant", rubric)
        # Only unchecked, checkable items appear.
        self.assertIn("- 1 [question]: When did you last hit this problem?", prompt)
        self.assertNotIn("- 2 ", prompt)
        self.assertNotIn("- 3 ", prompt)
        # The transcript window is included.
        self.assertIn("Founder: When did you last hit this problem?", prompt)
        self.assertEqual(tool_calls, [("mark_item_covered", {"item_id": "1"})])

    async def test_no_evaluation_when_everything_checked(self) -> None:
        session = _session(
            topics=[_topic("1", "question", "Q", checked=True)],
            transcript_turns=[_turn("Founder", "hi")],
        )
        transport = FakeTransport()

        p1, p2, p3 = self._patches(_azure_settings())
        with p1, p2, p3:
            evaluator = ChecklistEvaluator(
                session,
                on_tool_call=AsyncMock(return_value={"accepted": True}),
                on_status=lambda _status, _error: None,
                transport_factory=lambda: transport,
            )
            evaluator.start()
            try:
                await evaluator.send_labeled_turn(NormalizedTurn("test", "Founder", "hi"))
                await asyncio.sleep(0.1)
            finally:
                await evaluator.stop()

        self.assertEqual(transport.calls, [])

    async def test_failure_reports_error_then_recovers(self) -> None:
        session = _session(
            topics=[_topic("1", "question", "Q")],
            transcript_turns=[_turn("Founder", "Q?")],
        )
        transport = FakeTransport(
            results=[RuntimeError("socket died"), [("mark_item_covered", {"item_id": "1"})]]
        )
        statuses: list[tuple[str, str | None]] = []
        tool_calls: list[str] = []

        async def on_tool_call(name: str, args: dict) -> dict:
            tool_calls.append(name)
            return {"accepted": True}

        p1, p2, p3 = self._patches(_azure_settings())
        with p1, p2, p3:
            evaluator = ChecklistEvaluator(
                session,
                on_tool_call=on_tool_call,
                on_status=lambda status, error: statuses.append((status, error)),
                transport_factory=lambda: transport,
            )
            evaluator.start()
            try:
                await evaluator.send_labeled_turn(NormalizedTurn("test", "Founder", "Q?"))
                # Failure retries on its own (self-heal), then succeeds.
                await wait_for(lambda: len(tool_calls) == 1)
            finally:
                await evaluator.stop()

        error_statuses = [s for s in statuses if s[0] == "error"]
        self.assertEqual(len(error_statuses), 1)
        self.assertIn("socket died", error_statuses[0][1])
        # The failed transport connection was dropped for a clean restart.
        self.assertGreaterEqual(transport.closed, 1)
        # Recovery reports connected again after the error (stop() then
        # appends a final "closed").
        error_index = statuses.index(error_statuses[0])
        self.assertIn("connected", [s[0] for s in statuses[error_index + 1:]])

    async def test_mock_provider_checks_first_eligible_topic(self) -> None:
        session = _session(
            topics=[
                _topic("1", "goal", "Learn the workaround"),
                _topic("2", "question", "When did it last happen?"),
            ],
        )
        tool_calls: list[tuple[str, dict]] = []

        async def on_tool_call(name: str, args: dict) -> dict:
            tool_calls.append((name, args))
            return {"accepted": True}

        settings = _azure_settings(checklist_provider="mock")
        with patch.object(realtime_bridge, "get_settings", return_value=settings):
            evaluator = ChecklistEvaluator(
                session,
                on_tool_call=on_tool_call,
                on_status=lambda _status, _error: None,
            )
            await evaluator.send_labeled_turn(NormalizedTurn("test", "Founder", "asking"))
            await evaluator.send_labeled_turn(NormalizedTurn("test", "Interviewee", "answering"))

        self.assertEqual(
            [(name, args["item_id"]) for name, args in tool_calls],
            [("mark_item_covered", "2"), ("mark_item_covered", "1")],
        )


class TranscriptionSessionUpdateTests(unittest.IsolatedAsyncioTestCase):
    class FakeWebSocket:
        def __init__(self) -> None:
            self.events: list[dict] = []

        async def send(self, payload: str) -> None:
            self.events.append(json.loads(payload))

    def _transcriber(self, mode: str, model: str) -> source_transcription_bridge._SourceTranscriber:
        return source_transcription_bridge._SourceTranscriber(
            _session(),
            "mic",
            source_transcription_bridge.TranscriptionConnectionConfig(
                url="wss://example.openai.azure.com/openai/v1/realtime?model=gpt-realtime-1.5",
                headers={"api-key": "test-key"},
                provider="azure",
                target="example.openai.azure.com",
                session_type="realtime",
                model=model,
                mode=mode,
            ),
            on_transcript=lambda _source, _text: asyncio.sleep(0),
            on_status=lambda _status, _error: None,
        )

    async def test_azure_realtime_text_transcription_session_update_sets_type_but_not_model(self) -> None:
        transcriber = self._transcriber("realtime_text", "gpt-realtime-1.5")
        transcriber._ws = self.FakeWebSocket()

        await transcriber._configure_session()

        sent_session = transcriber._ws.events[0]["session"]
        self.assertEqual(sent_session["type"], "realtime")
        self.assertNotIn("model", sent_session)
        self.assertEqual(
            sent_session["audio"]["input"]["turn_detection"]["create_response"],
            True,
        )
        self.assertIn("instructions", sent_session)
        # GA `audio/pcm` accepts only `type` and `rate`.
        self.assertEqual(
            sent_session["audio"]["input"]["format"],
            {"type": "audio/pcm", "rate": 24000},
        )

    async def test_azure_input_transcription_session_update_keeps_transcription_model(self) -> None:
        transcriber = self._transcriber("input_transcription", "gpt-4o-transcribe-prod")
        transcriber._ws = self.FakeWebSocket()

        await transcriber._configure_session()

        sent_session = transcriber._ws.events[0]["session"]
        self.assertEqual(sent_session["type"], "realtime")
        self.assertEqual(
            sent_session["audio"]["input"]["transcription"]["model"],
            "gpt-4o-transcribe-prod",
        )

    async def test_realtime_text_transcription_accepts_response_text_events(self) -> None:
        transcripts: list[tuple[str, str]] = []

        async def on_transcript(source: str, text: str) -> None:
            transcripts.append((source, text))

        transcriber = source_transcription_bridge._SourceTranscriber(
            _session(),
            "mic",
            source_transcription_bridge.TranscriptionConnectionConfig(
                url="wss://example.openai.azure.com/openai/v1/realtime?model=gpt-realtime-1.5",
                headers={"api-key": "test-key"},
                provider="azure",
                target="example.openai.azure.com",
                session_type="realtime",
                model="gpt-realtime-1.5",
                mode="realtime_text",
            ),
            on_transcript=on_transcript,
            on_status=lambda _status, _error: None,
        )

        await transcriber._handle_event(
            {
                "type": "response.text.delta",
                "response_id": "response-1",
                "delta": "When did you ",
            }
        )
        await transcriber._handle_event(
            {
                "type": "response.text.done",
                "response_id": "response-1",
                "text": "When did you last run into this problem?",
            }
        )

        self.assertEqual(
            transcripts,
            [("mic", "When did you last run into this problem?")],
        )


if __name__ == "__main__":
    unittest.main()
