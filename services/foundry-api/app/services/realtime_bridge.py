from __future__ import annotations

import asyncio
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

RealtimeToolHandler = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]
RealtimeStatusHandler = Callable[[str, str | None], None]


@dataclass
class NormalizedTurn:
    """Provider-agnostic transcript turn passed to the checklist bridge.

    The bridge only looks at *speaker_label* and *text* — never at the raw
    source string.  *provider* is informational for logging.
    """
    provider: str       # "desktop_audio" | "zoom_rtms"
    speaker_label: str  # "Founder" | "Interviewee" | participant name
    text: str
    timestamp_ms: int = 0

    def to_labeled_line(self) -> str:
        return f"{self.speaker_label}: {self.text}"


@dataclass(frozen=True)
class RealtimeConnectionConfig:
    url: str
    headers: dict[str, str]
    model: str
    provider: str
    target: str


def _checkable_topics(session: LiveSessionState) -> list[dict[str, str]]:
    return [
        {"id": topic.id, "label": topic.label, "category": topic.category}
        for topic in session.topics
        if topic.category in {"goal", "question"}
    ]


def _instructions(session: LiveSessionState) -> str:
    topics = "\n".join(
        f"- {topic['id']} [{topic['category']}]: {topic['label']}"
        for topic in _checkable_topics(session)
    )
    return (
        "You are a silent customer-interview notepad assistant. "
        "Read source-labeled live transcript turns and keep track of which "
        "existing checklist items have clearly been covered.\n\n"
        "Rules:\n"
        "- Do not speak to the meeting participants.\n"
        "- Do not create, edit, save, or delete checklist items.\n"
        "- Only call mark_item_covered or mark_items_covered for existing item IDs listed below.\n"
        "- Transcript turns are labeled as Founder: ..., Interviewee: ..., Speaker: ..., or a participant name.\n"
        "- Questions should normally be marked only from Founder: turns.\n"
        "- Goals should normally be marked only from Interviewee: turns.\n"
        "- If the label is a participant name or Speaker, use the content of the exchange rather than the label alone.\n"
        "- Do not mark a goal from Founder: restating a hoped-for answer unless "
        "an Interviewee: turn confirms it.\n"
        "- Call the tool only when the founder clearly asked the question, or "
        "the interviewee produced usable evidence for the goal.\n"
        "- For long checklist items, match the core intent rather than requiring "
        "every word in the item to be repeated.\n"
        "- If a listed question is asked verbatim, nearly verbatim, or with the "
        "same practical intent, mark that question immediately.\n"
        "- If one answer or exchange clearly covers multiple listed items, call "
        "mark_items_covered with every covered item.\n"
        "- If the evidence is partial, ambiguous, or merely related, do nothing.\n"
        "- Never mark signal items covered in this V1.\n"
        "- Keep evidence to one short sentence grounded in what was heard.\n\n"
        f"Interviewee: {session.person_name}\n"
        "Checklist:\n"
        f"{topics or '- No checkable items'}"
    )


def _item_tool_schema() -> dict:
    return {
        "type": "function",
        "name": "mark_item_covered",
        "description": "Mark one existing interview checklist item as covered.",
        "parameters": {
            "type": "object",
            "properties": {
                "item_id": {
                    "type": "string",
                    "description": "The exact checklist item id to mark covered.",
                },
                "evidence": {
                    "type": "string",
                    "description": "One short sentence explaining what was heard.",
                },
                "reason": {
                    "type": "string",
                    "enum": ["question_asked", "goal_covered"],
                },
            },
            "required": ["item_id", "evidence", "reason"],
            "additionalProperties": False,
        },
    }


def _bulk_tool_schema() -> dict:
    return {
        "type": "function",
        "name": "mark_items_covered",
        "description": "Mark several existing interview checklist items as covered from the same exchange.",
        "parameters": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "item_id": {
                                "type": "string",
                                "description": "The exact checklist item id to mark covered.",
                            },
                            "evidence": {
                                "type": "string",
                                "description": "One short sentence explaining what was heard.",
                            },
                            "reason": {
                                "type": "string",
                                "enum": ["question_asked", "goal_covered"],
                            },
                        },
                        "required": ["item_id", "evidence", "reason"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": ["items"],
            "additionalProperties": False,
        },
    }


def _tool_schemas() -> list[dict]:
    return [_item_tool_schema(), _bulk_tool_schema()]


def _safety_identifier(session: LiveSessionState) -> str:
    return hashlib.sha256(session.user_id.encode("utf-8")).hexdigest()


def _checklist_provider() -> str:
    settings = get_settings()
    provider = settings.checklist_ai_provider.strip().lower()
    if provider:
        return provider
    # Fall back to the main AI_PROVIDER if CHECKLIST_AI_PROVIDER is not set
    return settings.ai_provider.strip().lower() or "openai"


def _realtime_api_key() -> str | None:
    settings = get_settings()
    return settings.openai_realtime_api_key or settings.openai_api_key


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
            "openai.azure.com, for example https://user-interview-ai-resource.openai.azure.com/openai/v1. "
            "Do not use the Azure AI Foundry project endpoint ending in services.ai.azure.com."
        )
    if not host.endswith(".openai.azure.com"):
        raise ValueError(
            "AZURE_OPENAI_REALTIME_ENDPOINT must be an Azure OpenAI endpoint ending in openai.azure.com, "
            "for example https://user-interview-ai-resource.openai.azure.com/openai/v1."
        )
    return f"wss://{parsed.netloc}/openai/v1/realtime"


def _azure_realtime_deployment() -> str:
    deployment = (get_settings().azure_openai_realtime_deployment or "").strip()
    if not deployment:
        raise ValueError("AZURE_OPENAI_REALTIME_DEPLOYMENT is not configured")
    return deployment


def _azure_realtime_api_key() -> str | None:
    return get_settings().azure_openai_realtime_api_key


class RealtimeBridge:
    def __init__(
        self,
        session: LiveSessionState,
        *,
        on_tool_call: RealtimeToolHandler,
        on_status: RealtimeStatusHandler,
    ) -> None:
        self.session = session
        self._on_tool_call = on_tool_call
        self._on_status = on_status
        self._task: asyncio.Task | None = None
        self._turn_task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._send_lock = asyncio.Lock()
        self._ws = None
        self._handled_call_ids: set[str] = set()
        self._mock_checked_ids: set[str] = set()
        self._turn_queue: asyncio.Queue[NormalizedTurn] = asyncio.Queue()
        self._response_done = asyncio.Event()
        self._response_done.set()
        self._connection_provider = ""
        self._turns_sent = 0
        self._seen_event_types: set[str] = set()
        self._pending_turn: NormalizedTurn | None = None
        self._pending_flush_task: asyncio.Task | None = None

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self.run())

    async def stop(self) -> None:
        self._stop.set()
        if self._ws is not None:
            await self._ws.close()
        if self._pending_flush_task and not self._pending_flush_task.done():
            self._pending_flush_task.cancel()
            try:
                await self._pending_flush_task
            except asyncio.CancelledError:
                pass
        # Flush any pending coalesced turn before stopping the worker
        if self._pending_turn is not None:
            self._turn_queue.put_nowait(self._pending_turn)
            self._pending_turn = None
        if self._turn_task and not self._turn_task.done():
            self._turn_task.cancel()
            try:
                await self._turn_task
            except asyncio.CancelledError:
                pass
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def run(self) -> None:
        provider = _checklist_provider()
        if provider == "mock":
            await self._run_mock()
            return

        try:
            connection = self._connection_config(provider)
        except ValueError as exc:
            self._on_status("error", str(exc))
            return

        logger.warning(
            "Starting realtime checklist bridge session=%s provider=%s target=%s model=%s",
            self.session.session_id,
            connection.provider,
            connection.target,
            connection.model,
        )
        self._connection_provider = connection.provider

        try:
            async with websockets.connect(connection.url, additional_headers=connection.headers) as ws:
                self._ws = ws
                self._on_status("connecting", None)
                await self._configure_session(connection)
                self._on_status("connected", None)
                self._turn_task = asyncio.create_task(self._turn_worker())
                while not self._stop.is_set():
                    raw = await ws.recv()
                    await self._handle_event(json.loads(raw))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception("Realtime bridge failed for session %s", self.session.session_id)
            self._on_status("error", str(exc))
        finally:
            self._ws = None
            if self.session.status == "active" and self.session.realtime_status != "error":
                self._on_status("closed", None)

    def _connection_config(self, provider: str) -> RealtimeConnectionConfig:
        settings = get_settings()
        if provider == "openai":
            api_key = _realtime_api_key()
            if not api_key:
                raise ValueError("OPENAI_REALTIME_API_KEY or OPENAI_API_KEY is not configured")
            model = settings.openai_realtime_model
            return RealtimeConnectionConfig(
                url=f"wss://api.openai.com/v1/realtime?model={quote(model, safe='')}",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "OpenAI-Safety-Identifier": _safety_identifier(self.session),
                },
                model=model,
                provider="openai",
                target="api.openai.com",
            )

        if provider == "azure":
            api_key = _azure_realtime_api_key()
            if not api_key:
                raise ValueError("AZURE_OPENAI_REALTIME_API_KEY is not configured")
            deployment = _azure_realtime_deployment()
            endpoint = _azure_realtime_endpoint()
            parsed = urlparse(endpoint)
            return RealtimeConnectionConfig(
                url=f"{endpoint}?model={quote(deployment, safe='')}",
                headers={"api-key": api_key},
                model=deployment,
                provider="azure",
                target=parsed.netloc,
            )

        raise ValueError("CHECKLIST_AI_PROVIDER must be openai, azure, or mock for checklist matching")

    async def _run_mock(self) -> None:
        logger.warning("Starting mock realtime checklist bridge session=%s", self.session.session_id)
        self._connection_provider = "mock"
        self._on_status("connected", None)
        try:
            await self._stop.wait()
        finally:
            if self.session.status == "active" and self.session.realtime_status != "error":
                self._on_status("closed", None)

    async def _configure_session(self, connection: RealtimeConnectionConfig) -> None:
        session = {
            "type": "realtime",
            "model": connection.model,
            "instructions": _instructions(self.session),
            "output_modalities": ["text"],
            "tools": _tool_schemas(),
            "tool_choice": "auto",
        }

        await self._send({"type": "session.update", "session": session})

    async def _handle_event(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")
        if event_type and event_type not in self._seen_event_types:
            self._seen_event_types.add(event_type)
            logger.warning("Realtime first event session=%s type=%s", self.session.session_id, event_type)
        if event_type == "error":
            error = event.get("error") or {}
            self._on_status("error", error.get("message") or "Realtime API error")
            return

        if event_type in {
            "session.created",
            "session.updated",
            "response.created",
        }:
            logger.warning("Realtime event session=%s type=%s", self.session.session_id, event_type)
            return
        if event_type == "response.done":
            logger.warning("Realtime event session=%s type=%s", self.session.session_id, event_type)
            self._response_done.set()
            return

        if event_type == "response.output_item.done":
            item = event.get("item") or {}
            logger.warning(
                "Realtime output item session=%s item_type=%s name=%s",
                self.session.session_id,
                item.get("type"),
                item.get("name"),
            )
            if item.get("type") == "function_call":
                await self._handle_function_call(item)
            return

        if event_type == "response.function_call_arguments.done":
            logger.warning(
                "Realtime function args done session=%s name=%s",
                self.session.session_id,
                event.get("name"),
            )
            await self._handle_function_call(event)

    async def _handle_function_call(self, item: dict[str, Any]) -> None:
        name = item.get("name")
        if name not in {"mark_item_covered", "mark_items_covered"}:
            return
        logger.warning("Realtime requested tool session=%s name=%s", self.session.session_id, name)

        call_id = item.get("call_id") or item.get("callId") or item.get("id")
        if call_id and call_id in self._handled_call_ids:
            return
        if call_id:
            self._handled_call_ids.add(call_id)

        raw_args = item.get("arguments") or "{}"
        try:
            args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
        except json.JSONDecodeError:
            args = {}

        result = await self._on_tool_call(name, args if isinstance(args, dict) else {})
        logger.warning(
            "Realtime tool result session=%s name=%s accepted=%s reason=%s args=%s",
            self.session.session_id,
            name,
            result.get("accepted") if isinstance(result, dict) else None,
            result.get("reason") if isinstance(result, dict) else None,
            args,
        )
        if call_id:
            await self._send(
                {
                    "type": "conversation.item.create",
                    "item": {
                        "type": "function_call_output",
                        "call_id": call_id,
                        "output": json.dumps(result),
                    },
                }
            )

    async def _send(self, event: dict[str, Any]) -> None:
        if self._ws is None:
            raise RuntimeError("Realtime WebSocket is not connected")
        async with self._send_lock:
            await self._ws.send(json.dumps(event, separators=(",", ":")))

    async def send_labeled_turn(self, turn: NormalizedTurn) -> bool:
        text = " ".join(turn.text.strip().split())
        if not text:
            return False
        if _checklist_provider() == "mock":
            return await self._send_mock_turn_for_turn(turn)

        # Coalesce consecutive same-speaker turns within a short window so that
        # VAD-split utterances arrive at the model as a single coherent turn.
        if self._pending_turn is not None and self._pending_turn.speaker_label == turn.speaker_label:
            merged_text = f"{self._pending_turn.text} {text}"
            self._pending_turn = NormalizedTurn(
                provider=turn.provider,
                speaker_label=turn.speaker_label,
                text=merged_text,
                timestamp_ms=turn.timestamp_ms,
            )
            # Reset the flush timer
            if self._pending_flush_task and not self._pending_flush_task.done():
                self._pending_flush_task.cancel()
            self._pending_flush_task = asyncio.create_task(self._flush_pending_after_delay())
            return True

        # Different speaker (or first turn) — flush any pending turn first
        if self._pending_turn is not None:
            await self._turn_queue.put(self._pending_turn)
            if self._pending_flush_task and not self._pending_flush_task.done():
                self._pending_flush_task.cancel()

        self._pending_turn = NormalizedTurn(
            provider=turn.provider,
            speaker_label=turn.speaker_label,
            text=text,
            timestamp_ms=turn.timestamp_ms,
        )
        self._pending_flush_task = asyncio.create_task(self._flush_pending_after_delay())
        return True

    async def _flush_pending_after_delay(self) -> None:
        """Flush the pending coalesced turn into the worker queue after a short delay."""
        await asyncio.sleep(0.8)
        if self._pending_turn is not None:
            turn = self._pending_turn
            self._pending_turn = None
            await self._turn_queue.put(turn)

    async def _turn_worker(self) -> None:
        while not self._stop.is_set():
            turn: NormalizedTurn = await self._turn_queue.get()
            try:
                await self._response_done.wait()
                self._response_done.clear()
                labeled_text = turn.to_labeled_line()
                await self._send(
                    {
                        "type": "conversation.item.create",
                        "item": {
                            "type": "message",
                            "role": "user",
                            "content": [
                                {
                                    "type": "input_text",
                                    "text": labeled_text,
                                }
                            ],
                        },
                    }
                )
                await self._send(
                    {
                        "type": "response.create",
                        "response": {
                            "output_modalities": ["text"],
                        },
                    }
                )
                self._turns_sent += 1
                if self._turns_sent in {1, 5, 25} or self._turns_sent % 100 == 0:
                    logger.warning(
                        "Sent labeled transcript turn session=%s provider=%s turns=%s",
                        self.session.session_id,
                        turn.provider,
                        self._turns_sent,
                    )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._response_done.set()
                self._on_status("error", f"Realtime text matcher failed: {exc}")
            finally:
                self._turn_queue.task_done()

    async def _send_mock_turn_for_turn(self, turn: NormalizedTurn) -> bool:
        if not turn.text:
            return False
        is_founder = turn.speaker_label == "Founder"
        for topic in self.session.topics:
            if topic.category not in {"goal", "question"}:
                continue
            if topic.checked or topic.manual_override or topic.id in self._mock_checked_ids:
                continue
            if topic.category == "question" and not is_founder:
                continue
            if topic.category == "goal" and is_founder:
                continue
            self._mock_checked_ids.add(topic.id)
            await self._on_tool_call(
                "mark_item_covered",
                {
                    "item_id": topic.id,
                    "evidence": f"{turn.speaker_label} said: {turn.text[:160]}",
                    "reason": "question_asked" if topic.category == "question" else "goal_covered",
                },
            )
            break
        return True


def _speaker_for_source(source: str) -> str:
    if source == "mic":
        return "Founder"
    if source == "loopback":
        return "Interviewee"
    if source in {"rtms", "meeting_sdk", "external"}:
        return "Speaker"
    return "Unknown"


# ---------------------------------------------------------------------------
# REST-based checklist bridge (for Gemini, Anthropic, and non-OpenAI providers)
# ---------------------------------------------------------------------------

_REST_FLUSH_INTERVAL_SECONDS = 4.0
_REST_MAX_TURNS_PER_FLUSH = 8


def _rest_tool_declarations() -> list[dict]:
    return [
        {
            "name": "mark_item_covered",
            "description": "Mark one existing interview checklist item as covered.",
            "parameters": {
                "type": "object",
                "properties": {
                    "item_id": {"type": "string", "description": "The exact checklist item id to mark covered."},
                    "evidence": {"type": "string", "description": "One short sentence explaining what was heard."},
                    "reason": {"type": "string", "enum": ["question_asked", "goal_covered"]},
                },
                "required": ["item_id", "evidence", "reason"],
            },
        },
        {
            "name": "mark_items_covered",
            "description": "Mark several existing interview checklist items as covered from the same exchange.",
            "parameters": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "minItems": 1,
                        "items": {
                            "type": "object",
                            "properties": {
                                "item_id": {"type": "string", "description": "The exact checklist item id to mark covered."},
                                "evidence": {"type": "string", "description": "One short sentence explaining what was heard."},
                                "reason": {"type": "string", "enum": ["question_asked", "goal_covered"]},
                            },
                            "required": ["item_id", "evidence", "reason"],
                        },
                    },
                },
                "required": ["items"],
            },
        },
    ]


def _rest_tool_declarations_openai() -> list[dict]:
    """OpenAI REST format: type: function + function: {name, description, parameters}."""
    result = []
    for decl in _rest_tool_declarations():
        result.append({"type": "function", "function": decl})
    return result


class RestChecklistBridge:
    """Checklist matcher that uses REST API calls instead of a persistent WebSocket.

    Transcript turns are buffered and flushed periodically (every ~4 s or after
    8 turns).  On each flush the accumulated turns are sent to the AI provider
    with function-calling tool definitions.  Any tool calls returned by the AI
    are forwarded to the same ``on_tool_call`` handler used by the realtime
    bridge.
    """

    def __init__(
        self,
        session: LiveSessionState,
        *,
        on_tool_call: RealtimeToolHandler,
        on_status: RealtimeStatusHandler,
    ) -> None:
        self._session = session
        self._on_tool_call = on_tool_call
        self._on_status = on_status
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._provider = _checklist_provider()
        self._buffer: list[dict[str, str]] = []  # [{speaker, text}, ...]
        self._buffer_event = asyncio.Event()

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        self._buffer_event.set()  # wake the worker
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def send_labeled_turn(self, turn: NormalizedTurn) -> bool:
        text = " ".join(turn.text.strip().split())
        if not text:
            return False
        self._buffer.append({"speaker": turn.speaker_label, "text": text})
        if len(self._buffer) >= _REST_MAX_TURNS_PER_FLUSH:
            self._buffer_event.set()
        return True

    async def _run(self) -> None:
        logger.warning(
            "Starting REST checklist bridge session=%s provider=%s",
            self._session.session_id,
            self._provider,
        )
        self._on_status("connected", None)
        try:
            while not self._stop.is_set():
                try:
                    await asyncio.wait_for(
                        self._buffer_event.wait(),
                        timeout=_REST_FLUSH_INTERVAL_SECONDS,
                    )
                except TimeoutError:
                    pass  # periodic flush
                self._buffer_event.clear()
                if self._buffer:
                    await self._flush()
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception(
                "REST checklist bridge failed for session %s",
                self._session.session_id,
            )
            self._on_status("error", str(exc))
        finally:
            if (
                self._session.status == "active"
                and self._session.realtime_status != "error"
            ):
                self._on_status("closed", None)

    async def _flush(self) -> None:
        if not self._buffer or self._session.status != "active":
            self._buffer.clear()
            return

        turns = self._buffer[:]
        self._buffer.clear()

        labeled = "\n".join(
            f"{turn['speaker']}: {turn['text']}" for turn in turns
        )
        prompt = (
            "Recent transcript turns (labeled by speaker source):\n\n"
            f"{labeled}\n\n"
            "Call mark_item_covered or mark_items_covered for any checklist items "
            "that have clearly been covered in these turns.  If nothing is clearly "
            "covered, respond with a single 'no_op' text."
        )

        try:
            tool_calls = await self._call_ai(prompt)
            for name, args in tool_calls:
                if name in {"mark_item_covered", "mark_items_covered"}:
                    result = await self._on_tool_call(name, args)
                    logger.warning(
                        "REST tool result session=%s name=%s accepted=%s",
                        self._session.session_id,
                        name,
                        result.get("accepted") if isinstance(result, dict) else None,
                    )
        except Exception:
            logger.exception("REST flush failed session=%s", self._session.session_id)

    async def _call_ai(self, prompt: str) -> list[tuple[str, dict]]:
        settings = get_settings()
        instructions = _instructions(self._session)

        if self._provider == "gemini":
            return await self._call_gemini(settings, instructions, prompt)
        if self._provider == "openai":
            return await self._call_openai_rest(settings, instructions, prompt)
        if self._provider == "anthropic":
            return await self._call_anthropic(settings, instructions, prompt)
        # Fallback: try OpenAI REST if key is available, else no-op
        if settings.openai_api_key:
            return await self._call_openai_rest(settings, instructions, prompt)
        logger.warning(
            "REST bridge: unsupported provider %s, no API key available",
            self._provider,
        )
        return []

    async def _call_gemini(
        self, settings, instructions: str, prompt: str
    ) -> list[tuple[str, dict]]:
        if not settings.gemini_api_key:
            self._on_status("error", "GEMINI_API_KEY is not configured")
            return []

        import google.generativeai as genai

        genai.configure(api_key=settings.gemini_api_key)
        # Gemini expects tools wrapped in {"function_declarations": [...]}
        gemini_tools = [{"function_declarations": _rest_tool_declarations()}]
        model = genai.GenerativeModel(
            model_name=settings.gemini_model,
            system_instruction=instructions,
            tools=gemini_tools,
        )
        tool_config = {"function_calling_config": {"mode": "auto"}}

        try:
            response = await asyncio.wait_for(
                model.generate_content_async(
                    prompt,
                    tools=gemini_tools,
                    tool_config=tool_config,
                    request_options={"timeout": int(settings.ai_request_timeout_seconds)},
                ),
                timeout=settings.ai_request_timeout_seconds + 10,
            )
        except Exception as exc:
            self._on_status("error", f"Gemini REST call failed: {exc}")
            return []

        return _extract_gemini_tool_calls(response)

    async def _call_openai_rest(
        self, settings, instructions: str, prompt: str
    ) -> list[tuple[str, dict]]:
        api_key = settings.openai_api_key
        if not api_key:
            self._on_status("error", "OPENAI_API_KEY is not configured")
            return []

        import httpx

        url = "https://api.openai.com/v1/chat/completions"
        body = {
            "model": settings.openai_model,
            "messages": [
                {"role": "system", "content": instructions},
                {"role": "user", "content": prompt},
            ],
            "tools": _rest_tool_declarations_openai(),
            "tool_choice": "auto",
        }
        try:
            async with httpx.AsyncClient(timeout=settings.ai_request_timeout_seconds + 10) as client:
                response = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=body,
                )
            if response.status_code >= 400:
                self._on_status(
                    "error",
                    f"OpenAI REST call failed with HTTP {response.status_code}",
                )
                return []
            payload = response.json()
        except Exception as exc:
            self._on_status("error", f"OpenAI REST call failed: {exc}")
            return []

        return _extract_openai_tool_calls(payload)

    async def _call_anthropic(
        self, settings, instructions: str, prompt: str
    ) -> list[tuple[str, dict]]:
        if not settings.anthropic_api_key:
            self._on_status("error", "ANTHROPIC_API_KEY is not configured")
            return []

        # Anthropic has its own tool-use format. For now, skip.
        logger.warning("REST bridge: Anthropic tool use not implemented yet")
        return []


def _extract_gemini_tool_calls(response) -> list[tuple[str, dict]]:
    """Extract function-call results from a Gemini GenerateContentResponse."""
    results: list[tuple[str, dict]] = []
    try:
        for candidate in getattr(response, "candidates", []) or []:
            for part in getattr(candidate, "content", None).parts if candidate.content else []:
                fn = getattr(part, "function_call", None)
                if fn is None:
                    continue
                name = getattr(fn, "name", "") or ""
                args = getattr(fn, "args", {}) or {}
                if name in {"mark_item_covered", "mark_items_covered"}:
                    results.append((name, args if isinstance(args, dict) else {}))
    except Exception:
        logger.exception("Failed to extract Gemini tool calls")
    return results


def _extract_openai_tool_calls(payload: dict) -> list[tuple[str, dict]]:
    """Extract function-call results from an OpenAI chat completion response."""
    results: list[tuple[str, dict]] = []
    try:
        choices = payload.get("choices") or []
        for choice in choices:
            message = choice.get("message") or {}
            tool_calls = message.get("tool_calls") or []
            for tc in tool_calls:
                fn = tc.get("function") or {}
                name = fn.get("name", "")
                raw_args = fn.get("arguments", "{}")
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except json.JSONDecodeError:
                    args = {}
                if name in {"mark_item_covered", "mark_items_covered"}:
                    results.append((name, args if isinstance(args, dict) else {}))
    except Exception:
        logger.exception("Failed to extract OpenAI tool calls")
    return results
