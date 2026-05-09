from __future__ import annotations

import asyncio
import base64
import json
import logging
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING, Any

import websockets

from ..config import get_settings

if TYPE_CHECKING:
    from .live_sessions import LiveSessionState

logger = logging.getLogger(__name__)

RealtimeToolHandler = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]
RealtimeStatusHandler = Callable[[str, str | None], None]


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
        "Listen to the meeting audio and keep track of which existing checklist "
        "items have clearly been covered.\n\n"
        "Rules:\n"
        "- Do not speak to the meeting participants.\n"
        "- Do not create, edit, save, or delete checklist items.\n"
        "- Only call mark_item_covered for an existing item ID listed below.\n"
        "- Call the tool only when the founder clearly asked the question, or "
        "the conversation produced usable evidence for the goal.\n"
        "- If the evidence is partial, ambiguous, or merely related, do nothing.\n"
        "- Never mark signal items covered in this V1.\n"
        "- Keep evidence to one short sentence grounded in what was heard.\n\n"
        f"Interviewee: {session.person_name}\n"
        "Checklist:\n"
        f"{topics or '- No checkable items'}"
    )


def _tool_schema() -> dict:
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
        self._stop = asyncio.Event()
        self._send_lock = asyncio.Lock()
        self._ws = None
        self._handled_call_ids: set[str] = set()

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self.run())

    async def stop(self) -> None:
        self._stop.set()
        if self._ws is not None:
            await self._ws.close()
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def run(self) -> None:
        settings = get_settings()
        if not settings.openai_api_key:
            self._on_status("error", "OPENAI_API_KEY is not configured")
            return

        model = settings.openai_realtime_model
        url = f"wss://api.openai.com/v1/realtime?model={model}"
        headers = {"Authorization": f"Bearer {settings.openai_api_key}"}

        try:
            async with websockets.connect(url, additional_headers=headers) as ws:
                self._ws = ws
                self._on_status("connecting", None)
                await self._configure_session()
                self._on_status("connected", None)
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

    async def _configure_session(self) -> None:
        await self._send(
            {
                "type": "session.update",
                "session": {
                    "type": "realtime",
                    "model": get_settings().openai_realtime_model,
                    "instructions": _instructions(self.session),
                    "output_modalities": ["text"],
                    "audio": {
                        "input": {
                            "format": {"type": "audio/pcm", "rate": 24000},
                            "turn_detection": {
                                "type": "semantic_vad",
                                "create_response": True,
                            },
                        },
                    },
                    "tools": [_tool_schema()],
                    "tool_choice": "auto",
                },
            }
        )

    async def _handle_event(self, event: dict[str, Any]) -> None:
        event_type = event.get("type")
        if event_type == "error":
            error = event.get("error") or {}
            self._on_status("error", error.get("message") or "Realtime API error")
            return

        if event_type == "response.output_item.done":
            item = event.get("item") or {}
            if item.get("type") == "function_call":
                await self._handle_function_call(item)
            return

        if event_type == "response.function_call_arguments.done":
            await self._handle_function_call(event)

    async def _handle_function_call(self, item: dict[str, Any]) -> None:
        name = item.get("name")
        if name != "mark_item_covered":
            return

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

    async def send_audio(self, audio: bytes) -> bool:
        if not audio or self._ws is None:
            return False
        await self._send(
            {
                "type": "input_audio_buffer.append",
                "audio": base64.b64encode(audio).decode("ascii"),
            }
        )
        return True
