from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any
from urllib.parse import quote, urlparse

import websockets

from ..config import get_settings

if TYPE_CHECKING:
    from .live_sessions import LiveSessionState

logger = logging.getLogger(__name__)

TranscriptHandler = Callable[[str, str], Awaitable[None]]
TranscriptionStatusHandler = Callable[[str, str | None], None]

_TRANSCRIPTION_SOURCES = ("mic", "loopback")
_TRANSCRIPTION_MODEL = "gpt-4o-transcribe"
_AZURE_TRANSCRIPTION_MODEL = "whisper-1"
_TRANSCRIPTION_MODE_INPUT = "input_transcription"
_TRANSCRIPTION_MODE_REALTIME_TEXT = "realtime_text"


@dataclass(frozen=True)
class TranscriptionConnectionConfig:
    url: str
    headers: dict[str, str]
    provider: str
    target: str
    session_type: str
    model: str = _TRANSCRIPTION_MODEL
    mode: str = _TRANSCRIPTION_MODE_INPUT


def _checklist_provider() -> str:
    settings = get_settings()
    provider = settings.checklist_ai_provider.strip().lower()
    if provider:
        return provider
    return settings.ai_provider.strip().lower() or "openai"


def _realtime_api_key() -> str | None:
    settings = get_settings()
    return settings.openai_realtime_api_key or settings.openai_api_key


def _safety_identifier(session: LiveSessionState) -> str:
    return hashlib.sha256(session.user_id.encode("utf-8")).hexdigest()


def _azure_realtime_endpoint() -> str:
    endpoint = (get_settings().azure_openai_realtime_endpoint or "").strip()
    if not endpoint:
        raise ValueError("AZURE_OPENAI_REALTIME_ENDPOINT is not configured")
    if not endpoint.startswith(("http://", "https://")):
        endpoint = f"https://{endpoint}"

    parsed = urlparse(endpoint)
    if not parsed.netloc:
        raise ValueError("AZURE_OPENAI_REALTIME_ENDPOINT must be a valid Azure OpenAI endpoint")
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    if host.endswith(".services.ai.azure.com") or "/api/projects" in path:
        raise ValueError(
            "AZURE_OPENAI_REALTIME_ENDPOINT must be the Azure OpenAI endpoint ending in "
            "openai.azure.com. Do not use the Azure AI Foundry project endpoint."
        )
    if not host.endswith(".openai.azure.com"):
        raise ValueError("AZURE_OPENAI_REALTIME_ENDPOINT must end in openai.azure.com")
    return f"wss://{parsed.netloc}/openai/v1/realtime"


def _azure_realtime_deployment() -> str:
    deployment = (get_settings().azure_openai_realtime_deployment or "").strip()
    if not deployment:
        raise ValueError("AZURE_OPENAI_REALTIME_DEPLOYMENT is not configured")
    return deployment


def _azure_transcription_deployment() -> str | None:
    deployment = (get_settings().azure_openai_transcription_deployment or "").strip()
    return deployment or None


def _azure_realtime_api_key() -> str | None:
    return get_settings().azure_openai_realtime_api_key


def _connection_config(session: LiveSessionState) -> TranscriptionConnectionConfig:
    provider = _checklist_provider()
    if provider == "openai":
        api_key = _realtime_api_key()
        if not api_key:
            raise ValueError("OPENAI_REALTIME_API_KEY or OPENAI_API_KEY is not configured")
        return TranscriptionConnectionConfig(
            url="wss://api.openai.com/v1/realtime?intent=transcription",
            headers={
                "Authorization": f"Bearer {api_key}",
                "OpenAI-Safety-Identifier": _safety_identifier(session),
            },
            provider="openai",
            target="api.openai.com",
            session_type="transcription",
            mode=_TRANSCRIPTION_MODE_INPUT,
        )

    if provider == "azure":
        api_key = _azure_realtime_api_key()
        if not api_key:
            raise ValueError("AZURE_OPENAI_REALTIME_API_KEY is not configured")
        deployment = _azure_realtime_deployment()
        transcription_deployment = _azure_transcription_deployment()
        endpoint = _azure_realtime_endpoint()
        parsed = urlparse(endpoint)
        return TranscriptionConnectionConfig(
            url=f"{endpoint}?model={quote(deployment, safe='')}",
            headers={"api-key": api_key},
            provider="azure",
            target=parsed.netloc,
            session_type="realtime",
            model=transcription_deployment or _AZURE_TRANSCRIPTION_MODEL,
            mode=_TRANSCRIPTION_MODE_INPUT,
        )

    raise ValueError("CHECKLIST_AI_PROVIDER must be openai, azure, or mock for transcription")


class SourceTranscriptionBridge:
    def __init__(
        self,
        session: LiveSessionState,
        *,
        on_transcript: TranscriptHandler,
        on_status: TranscriptionStatusHandler,
    ) -> None:
        self.session = session
        self._on_transcript = on_transcript
        self._on_status = on_status
        self._transcribers: dict[str, _SourceTranscriber] = {}

    def start(self) -> None:
        if _checklist_provider() == "mock":
            return
        try:
            config = _connection_config(self.session)
        except ValueError as exc:
            self._on_status("error", str(exc))
            return

        logger.warning(
            "Starting source transcription session=%s provider=%s target=%s session_type=%s mode=%s transcription_model=%s",
            self.session.session_id,
            config.provider,
            config.target,
            config.session_type,
            config.mode,
            config.model,
        )
        for source in _TRANSCRIPTION_SOURCES:
            transcriber = _SourceTranscriber(
                self.session,
                source,
                config,
                on_transcript=self._on_transcript,
                on_status=self._on_status,
            )
            self._transcribers[source] = transcriber
            transcriber.start()

    async def stop(self) -> None:
        transcribers = list(self._transcribers.values())
        self._transcribers.clear()
        await asyncio.gather(
            *(transcriber.stop() for transcriber in transcribers),
            return_exceptions=True,
        )

    async def send_audio(self, source: str, audio: bytes) -> bool:
        if not audio:
            return False
        transcriber = self._transcribers.get(source)
        if not transcriber:
            if source not in {"mixed", "unknown"}:
                logger.warning(
                    "No transcriber for source session=%s source=%s",
                    self.session.session_id,
                    source,
                )
            return False
        await transcriber.send_audio(audio)
        return True


class _SourceTranscriber:
    def __init__(
        self,
        session: LiveSessionState,
        source: str,
        config: TranscriptionConnectionConfig,
        *,
        on_transcript: TranscriptHandler,
        on_status: TranscriptionStatusHandler,
    ) -> None:
        self.session = session
        self.source = source
        self.config = config
        self._on_transcript = on_transcript
        self._on_status = on_status
        self._stop = asyncio.Event()
        self._send_lock = asyncio.Lock()
        self._queue: asyncio.Queue[bytes] = asyncio.Queue()
        self._task: asyncio.Task | None = None
        self._send_task: asyncio.Task | None = None
        self._ws = None
        self._chunks_sent = 0
        self._seen_event_types: set[str] = set()
        self._response_text: dict[str, list[str]] = {}
        self._completed_response_ids: set[str] = set()

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        if self._ws is not None:
            await self._ws.close()
        if self._send_task and not self._send_task.done():
            self._send_task.cancel()
            try:
                await self._send_task
            except asyncio.CancelledError:
                pass
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def send_audio(self, audio: bytes) -> None:
        await self._queue.put(audio)

    async def _run(self) -> None:
        try:
            async with websockets.connect(
                self.config.url,
                additional_headers=self.config.headers,
            ) as ws:
                self._ws = ws
                await self._configure_session()
                self._send_task = asyncio.create_task(self._send_worker())
                while not self._stop.is_set():
                    raw = await ws.recv()
                    await self._handle_event(json.loads(raw))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception(
                "Source transcription failed session=%s source=%s",
                self.session.session_id,
                self.source,
            )
            self._on_status("error", f"{self.source} transcription failed: {exc}")
        finally:
            self._ws = None

    async def _configure_session(self) -> None:
        audio_input = {
            "format": {
                "type": "audio/pcm",
                "rate": 24000,
            },
            "noise_reduction": {
                "type": "near_field" if self.source == "mic" else "far_field",
            },
            "turn_detection": {
                "type": "server_vad",
                "threshold": 0.5,
                "prefix_padding_ms": 300,
                "silence_duration_ms": 1200,
            },
        }

        session: dict[str, Any] = {
            "type": self.config.session_type,
            "audio": {
                "input": audio_input,
            },
        }

        if self.config.mode == _TRANSCRIPTION_MODE_INPUT:
            audio_input["transcription"] = {
                "model": self.config.model,
                "prompt": "Idea validation interview. Expect startup, workflow, pain point, buyer, budget, and product vocabulary.",
                "language": "en",
            }
            audio_input["turn_detection"]["create_response"] = False
        else:
            audio_input["turn_detection"]["create_response"] = True
            session["model"] = self.config.model
            session["instructions"] = _realtime_text_transcription_instructions(self.source)
            session["output_modalities"] = ["text"]

        await self._send(
            {
                "type": "session.update",
                "session": session,
            }
        )

    async def _send_worker(self) -> None:
        while not self._stop.is_set():
            audio = await self._queue.get()
            try:
                await self._send(
                    {
                        "type": "input_audio_buffer.append",
                        "audio": base64.b64encode(audio).decode("ascii"),
                    }
                )
                self._chunks_sent += 1
                if self._chunks_sent in {1, 25, 100} or self._chunks_sent % 500 == 0:
                    logger.warning(
                        "Sent transcription audio session=%s source=%s chunks=%s",
                        self.session.session_id,
                        self.source,
                        self._chunks_sent,
                    )
            finally:
                self._queue.task_done()

    async def _handle_event(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")
        if event_type and event_type not in self._seen_event_types:
            self._seen_event_types.add(event_type)
            logger.warning(
                "Transcription first event session=%s source=%s type=%s",
                self.session.session_id,
                self.source,
                event_type,
            )
        if event_type == "error":
            error = event.get("error") or {}
            self._on_status(
                "error",
                f"{self.source} transcription error: {error.get('message') or 'Realtime transcription API error'}",
            )
            return

        if event_type == "conversation.item.input_audio_transcription.failed":
            error = event.get("error") or {}
            logger.warning(
                "Transcription item failed session=%s source=%s code=%s message=%s",
                self.session.session_id,
                self.source,
                error.get("code"),
                error.get("message") or "No transcription failure detail provided",
            )
            return

        if self.config.mode == _TRANSCRIPTION_MODE_REALTIME_TEXT:
            await self._handle_realtime_text_event(event)
            return

        if event_type != "conversation.item.input_audio_transcription.completed":
            return

        transcript = _clean_transcript(event.get("transcript"))
        if transcript:
            await self._on_transcript(self.source, transcript)

    async def _handle_realtime_text_event(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")
        if event_type == "response.output_text.delta":
            response_id = _response_id(event)
            delta = event.get("delta")
            if isinstance(delta, str):
                self._response_text.setdefault(response_id, []).append(delta)
            return

        if event_type == "response.output_text.done":
            response_id = _response_id(event)
            text = _clean_transcript(event.get("text")) or _clean_transcript(
                "".join(self._response_text.pop(response_id, []))
            )
            if text:
                self._completed_response_ids.add(response_id)
                await self._on_transcript(self.source, text)
            return

        if event_type != "response.done":
            return

        response = event.get("response") or {}
        response_id = _response_id(event)
        if response_id in self._completed_response_ids:
            return
        text = _extract_response_text(response) or _clean_transcript(
            "".join(self._response_text.pop(response_id, []))
        )
        if text:
            self._completed_response_ids.add(response_id)
            await self._on_transcript(self.source, text)

    async def _send(self, event: dict[str, Any]) -> None:
        if self._ws is None:
            raise RuntimeError("Transcription WebSocket is not connected")
        async with self._send_lock:
            await self._ws.send(json.dumps(event, separators=(",", ":")))


def _clean_transcript(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.strip().split())


def _response_id(event: dict[str, Any]) -> str:
    response_id = event.get("response_id")
    if isinstance(response_id, str) and response_id:
        return response_id
    response = event.get("response")
    if isinstance(response, dict):
        response_id = response.get("id")
        if isinstance(response_id, str) and response_id:
            return response_id
    return "default"


def _extract_response_text(response: dict[str, Any]) -> str:
    parts: list[str] = []
    output = response.get("output")
    if not isinstance(output, list):
        return ""
    for item in output:
        if not isinstance(item, dict):
            continue
        content = item.get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") in {"output_text", "text"}:
                text = part.get("text")
                if isinstance(text, str):
                    parts.append(text)
    return _clean_transcript(" ".join(parts))


def _realtime_text_transcription_instructions(source: str) -> str:
    speaker = "founder using the local microphone" if source == "mic" else "interviewee from system audio"
    return (
        f"You transcribe one side of a idea validation call: the {speaker}. "
        "For each detected speech turn, output only the words spoken in that turn. "
        "Do not answer questions. Do not summarize. Do not add speaker labels. "
        "Do not mention audio quality. If the speech is unintelligible, output nothing."
    )
