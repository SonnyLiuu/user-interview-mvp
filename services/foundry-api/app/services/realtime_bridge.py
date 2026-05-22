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
        "- Transcript turns are labeled exactly as Founder: ... or Interviewee: ... .\n"
        "- Questions should normally be marked only from Founder: turns.\n"
        "- Goals should normally be marked only from Interviewee: turns.\n"
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
    provider = get_settings().checklist_ai_provider.strip().lower()
    return provider if provider else "openai"


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
        self._turn_queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue()
        self._response_done = asyncio.Event()
        self._response_done.set()
        self._connection_provider = ""
        self._turns_sent = 0
        self._seen_event_types: set[str] = set()

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self.run())

    async def stop(self) -> None:
        self._stop.set()
        if self._ws is not None:
            await self._ws.close()
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

    async def send_labeled_turn(self, source: str, transcript: str) -> bool:
        text = " ".join(transcript.strip().split())
        if not text:
            return False
        if _checklist_provider() == "mock":
            return await self._send_mock_turn(source, text)
        await self._turn_queue.put((source, text))
        return True

    async def _turn_worker(self) -> None:
        while not self._stop.is_set():
            source, text = await self._turn_queue.get()
            try:
                await self._response_done.wait()
                self._response_done.clear()
                speaker = _speaker_for_source(source)
                labeled_text = f"{speaker}: {text}"
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
                        "Sent labeled transcript turn session=%s source=%s turns=%s",
                        self.session.session_id,
                        source,
                        self._turns_sent,
                    )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                self._response_done.set()
                self._on_status("error", f"Realtime text matcher failed: {exc}")
            finally:
                self._turn_queue.task_done()

    async def _send_mock_turn(self, source: str, transcript: str) -> bool:
        if not transcript:
            return False
        for topic in self.session.topics:
            if topic.category not in {"goal", "question"}:
                continue
            if topic.checked or topic.manual_override or topic.id in self._mock_checked_ids:
                continue
            if topic.category == "question" and source != "mic":
                continue
            if topic.category == "goal" and source != "loopback":
                continue
            self._mock_checked_ids.add(topic.id)
            await self._on_tool_call(
                "mark_item_covered",
                {
                    "item_id": topic.id,
                    "evidence": f"{_speaker_for_source(source)} said: {transcript[:160]}",
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
    return "Unknown"
