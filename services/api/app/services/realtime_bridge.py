"""Checklist auto-cross-off engine for live interview sessions.

Architecture: one :class:`ChecklistEvaluator` per live session. Incoming
transcript turns only mark the evaluator dirty; after a short debounce it runs
a single STATELESS evaluation — all still-unchecked checklist items plus a
window of the most recent transcript are sent to the model, which returns tool
calls marking covered items. Because every evaluation re-evaluates all
unchecked items against the window:

- a failed or skipped evaluation self-heals (the next one covers it),
- items that only become clear with later context are picked up naturally,
- no conversation state accumulates, so nothing can drift or grow unbounded.

Transports (selected by CHECKLIST_AI_PROVIDER):

- ``openai`` / ``azure`` — persistent realtime WebSocket using out-of-band
  responses (``conversation: "none"`` with per-response instructions/tools),
  reconnecting on demand. Idle sockets routinely get closed by the provider
  mid-call; reconnect-on-use makes that a non-event.
- ``gemini`` / ``anthropic`` — per-evaluation REST calls.
- ``mock`` — deterministic local matcher for tests and demos.
"""

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

from ..core.config import get_settings

if TYPE_CHECKING:
    from .live_sessions import LiveSessionState

logger = logging.getLogger(__name__)

RealtimeToolHandler = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]
RealtimeStatusHandler = Callable[[str, str | None], None]

_TOOL_NAMES = {"mark_item_covered", "mark_items_covered"}

# Evaluation cadence. Module constants are read at call time so tests can
# patch them.
_DEBOUNCE_SECONDS = 1.2       # quiet time after a turn before evaluating
_WINDOW_TURNS = 30            # transcript turns included per evaluation
_TURN_CHAR_LIMIT = 300        # per-turn excerpt length in the window
_BACKOFF_BASE_SECONDS = 1.0
_MAX_BACKOFF_SECONDS = 30.0


@dataclass
class NormalizedTurn:
    """Provider-agnostic transcript turn passed to the checklist evaluator.

    The evaluator only looks at *speaker_label* and *text* — never at the raw
    source string.  *provider* is informational for logging.
    """
    provider: str       # e.g. "desktop_audio", "recall_ai", "fireflies", "otter"
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


# ---------------------------------------------------------------------------
# Prompting
# ---------------------------------------------------------------------------

_RUBRIC = (
    "You are a silent checklist assistant for a live customer-discovery interview. "
    "Each request gives you (1) the checklist items that are still unchecked and "
    "(2) a window of the most recent transcript, labeled by speaker. Decide which "
    "unchecked items the transcript clearly covers, then call mark_items_covered "
    "with every covered item (or mark_item_covered for a single one). If nothing "
    "is covered, reply with the single word no_op.\n\n"
    "Speaker labels:\n"
    "- Founder: the interviewer (asks questions, guides the conversation).\n"
    "- Interviewee: the person being interviewed (gives answers and experiences).\n"
    "- Speaker or a participant name: unknown side — judge by content. A turn that "
    "asks a question reads as Founder; one that answers or explains reads as "
    "Interviewee.\n\n"
    "What counts as covered:\n"
    "- [question] items: the founder asked it — verbatim, near-verbatim, or with "
    "the same practical intent.\n"
    "- [goal] items: the interviewee said something that provides usable evidence "
    "for the goal. A founder merely restating a hoped-for answer does not cover a "
    "goal; the interviewee's own words do.\n\n"
    "Decision rubric, in priority order:\n"
    "1. CLEAR MATCH -> mark it. The exact question was asked, or an answer "
    "directly addresses the item.\n"
    "2. STRONG IMPLICATION -> mark it. The core intent was addressed in different "
    "words. Example: item says 'What workaround do you use?' and the interviewee "
    "says 'We export to Excel and email it around' -> covered.\n"
    "3. PARTIAL / RELATED -> mark it only if you are at least 70% confident. A "
    "false positive is cheap to uncheck; a missed item is easy to overlook.\n"
    "4. VAGUE / UNRELATED -> skip it. If you would have to guess, do not mark.\n\n"
    "Hard rules:\n"
    "- Only use item ids that appear in the unchecked list of the current request.\n"
    "- Evidence must be one short sentence grounded in what was actually said.\n"
    "- Never speak to the participants; your only outputs are tool calls or no_op."
)


def _evaluation_prompt(
    person_name: str,
    unchecked: list[Any],
    window: list[Any],
) -> str:
    items = "\n".join(
        f"- {topic.id} [{topic.category}]: {topic.label}" for topic in unchecked
    )
    transcript = "\n".join(
        f"{turn.speaker}: {turn.text[:_TURN_CHAR_LIMIT]}" for turn in window
    )
    return (
        f"Interviewee: {person_name}\n\n"
        "Unchecked checklist items:\n"
        f"{items}\n\n"
        f"Transcript (most recent {len(window)} turns, oldest first):\n"
        f"{transcript}\n\n"
        "Mark every unchecked item that this transcript clearly covers."
    )


# ---------------------------------------------------------------------------
# Tool schemas
# ---------------------------------------------------------------------------

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
        "description": "Mark several existing interview checklist items as covered.",
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


def _rest_tool_declarations() -> list[dict]:
    """Provider-neutral tool declarations (name/description/parameters)."""
    return [
        {
            "name": schema["name"],
            "description": schema["description"],
            "parameters": schema["parameters"],
        }
        for schema in _tool_schemas()
    ]


# ---------------------------------------------------------------------------
# Provider configuration
# ---------------------------------------------------------------------------

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
            "openai.azure.com, for example https://user-interview-ai-resource.openai.azure.com/openai/v1. "
            "Do not use the Azure AI Foundry project endpoint ending in services.ai.azure.com."
        )
    if not host.endswith(".openai.azure.com"):
        raise ValueError(
            "AZURE_OPENAI_REALTIME_ENDPOINT must be an Azure OpenAI endpoint ending in openai.azure.com, "
            "for example https://user-interview-ai-resource.openai.azure.com."
        )
    return f"wss://{parsed.netloc}"


def _azure_realtime_url(deployment: str) -> str:
    endpoint = _azure_realtime_endpoint()
    if "preview" in deployment.lower():
        return (
            f"{endpoint}/openai/realtime"
            f"?api-version=2025-04-01-preview&deployment={quote(deployment, safe='')}"
        )
    return f"{endpoint}/openai/v1/realtime?model={quote(deployment, safe='')}"


def _azure_realtime_deployment() -> str:
    deployment = (get_settings().azure_openai_realtime_deployment or "").strip()
    if not deployment:
        raise ValueError("AZURE_OPENAI_REALTIME_DEPLOYMENT is not configured")
    return deployment


def _azure_realtime_api_key() -> str | None:
    return get_settings().azure_openai_realtime_api_key


def _realtime_connection_config(provider: str, session: LiveSessionState) -> RealtimeConnectionConfig:
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
                "OpenAI-Safety-Identifier": _safety_identifier(session),
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
        url = _azure_realtime_url(deployment)
        parsed = urlparse(url)
        return RealtimeConnectionConfig(
            url=url,
            headers={"api-key": api_key},
            model=deployment,
            provider="azure",
            target=parsed.netloc,
        )

    raise ValueError("CHECKLIST_AI_PROVIDER must be openai, azure, gemini, anthropic, or mock")


# ---------------------------------------------------------------------------
# Evaluator
# ---------------------------------------------------------------------------

class ChecklistEvaluator:
    """Auto-cross-off engine for one live session. See module docstring."""

    def __init__(
        self,
        session: LiveSessionState,
        *,
        on_tool_call: RealtimeToolHandler,
        on_status: RealtimeStatusHandler,
        transport_factory: Callable[[], _EvaluationTransport] | None = None,
    ) -> None:
        self.session = session
        self._on_tool_call = on_tool_call
        self._on_status = on_status
        self._transport_factory = transport_factory
        self._provider = _checklist_provider()
        self._task: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._dirty = asyncio.Event()
        self._transport: _EvaluationTransport | None = None
        self._mock_checked_ids: set[str] = set()
        self._consecutive_failures = 0
        self._had_error = False
        self._evaluations = 0

    def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._stop.set()
        self._dirty.set()
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._transport is not None:
            await self._transport.close()
            self._transport = None

    async def send_labeled_turn(self, turn: NormalizedTurn) -> bool:
        text = " ".join(turn.text.strip().split())
        if not text:
            return False
        if self._provider == "mock":
            return await self._mock_evaluate(turn, text)
        self._dirty.set()
        return True

    # -- worker ------------------------------------------------------------

    async def _run(self) -> None:
        if self._provider == "mock":
            logger.warning(
                "Starting mock checklist evaluator session=%s", self.session.session_id
            )
            self._on_status("connected", None)
            try:
                await self._stop.wait()
            finally:
                self._finish_status()
            return

        try:
            if self._transport_factory is not None:
                transport = self._transport_factory()
            else:
                transport = _make_transport(self._provider, self.session)
        except ValueError as exc:
            self._on_status("error", str(exc))
            return
        self._transport = transport

        logger.warning(
            "Starting checklist evaluator session=%s provider=%s target=%s model=%s",
            self.session.session_id,
            transport.provider,
            transport.target,
            transport.model,
        )
        try:
            await transport.prepare()
            self._on_status("connected", None)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # Not fatal: evaluations reconnect on demand.
            self._had_error = True
            self._on_status("error", f"Checklist matcher connect failed: {exc}")

        try:
            while not self._stop.is_set():
                await self._dirty.wait()
                if self._stop.is_set():
                    break
                # Debounce so VAD-fragmented utterances evaluate as one batch.
                await asyncio.sleep(_DEBOUNCE_SECONDS)
                self._dirty.clear()
                await self._evaluate_once()
        except asyncio.CancelledError:
            raise
        finally:
            self._finish_status()

    def _finish_status(self) -> None:
        if self.session.status == "active" and self.session.realtime_status != "error":
            self._on_status("closed", None)

    async def _evaluate_once(self) -> None:
        if self.session.status != "active":
            return
        unchecked = [
            topic
            for topic in self.session.topics
            if topic.category in {"goal", "question"}
            and not topic.checked
            and not topic.manual_override
        ]
        if not unchecked:
            return
        window = list(self.session.transcript_turns)[-_WINDOW_TURNS:]
        if not window:
            return

        prompt = _evaluation_prompt(
            getattr(self.session, "person_name", "") or "Unknown",
            unchecked,
            window,
        )
        timeout = get_settings().ai_request_timeout_seconds + 15
        try:
            assert self._transport is not None
            tool_calls = await asyncio.wait_for(
                self._transport.evaluate(_RUBRIC, prompt),
                timeout=timeout,
            )
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            self._consecutive_failures += 1
            self._had_error = True
            logger.exception(
                "Checklist evaluation failed session=%s failures=%s",
                self.session.session_id,
                self._consecutive_failures,
            )
            self._on_status("error", f"Checklist matcher failed: {exc}")
            # A timed-out WebSocket may be mid-response; drop it so the next
            # evaluation starts on a clean connection.
            if self._transport is not None:
                await self._transport.close()
            # Self-heal: retry (with backoff) even if no new turns arrive.
            self._dirty.set()
            await asyncio.sleep(
                min(
                    _BACKOFF_BASE_SECONDS * (2 ** (self._consecutive_failures - 1)),
                    _MAX_BACKOFF_SECONDS,
                )
            )
            return

        self._consecutive_failures = 0
        if self._had_error:
            self._had_error = False
            self._on_status("connected", None)

        self._evaluations += 1
        if self._evaluations in {1, 5, 25} or self._evaluations % 100 == 0:
            logger.warning(
                "Checklist evaluation session=%s count=%s unchecked=%s tool_calls=%s",
                self.session.session_id,
                self._evaluations,
                len(unchecked),
                len(tool_calls),
            )

        for name, args in tool_calls:
            if name not in _TOOL_NAMES:
                continue
            result = await self._on_tool_call(name, args)
            logger.warning(
                "Checklist tool result session=%s name=%s accepted=%s args=%s",
                self.session.session_id,
                name,
                result.get("accepted") if isinstance(result, dict) else None,
                args,
            )

    async def _mock_evaluate(self, turn: NormalizedTurn, text: str) -> bool:
        # Deterministic local matcher used by tests and demo mode: checks the
        # first eligible topic per turn (questions from the founder, goals
        # from the interviewee).
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
                    "evidence": f"{turn.speaker_label} said: {text[:160]}",
                    "reason": "question_asked" if topic.category == "question" else "goal_covered",
                },
            )
            break
        return True


# ---------------------------------------------------------------------------
# Transports
# ---------------------------------------------------------------------------

class _EvaluationTransport:
    """One evaluation request/response. Implementations must be safe to call
    repeatedly and to close() at any time."""

    provider = ""
    target = ""
    model = ""

    async def prepare(self) -> None:
        """Optional eager setup so connection problems surface at start."""

    async def evaluate(self, rubric: str, prompt: str) -> list[tuple[str, dict]]:
        raise NotImplementedError

    async def close(self) -> None:
        pass


def _make_transport(provider: str, session: LiveSessionState) -> _EvaluationTransport:
    if provider in {"openai", "azure"}:
        return _RealtimeWSTransport(_realtime_connection_config(provider, session))
    if provider == "gemini":
        return _GeminiTransport()
    if provider == "anthropic":
        return _AnthropicTransport()
    raise ValueError("CHECKLIST_AI_PROVIDER must be openai, azure, gemini, anthropic, or mock")


class _RealtimeWSTransport(_EvaluationTransport):
    """Stateless evaluations over a persistent realtime WebSocket.

    Each evaluation is an out-of-band response (``conversation: "none"``) with
    per-response instructions, tools, and input — the server-side conversation
    never grows. The socket reconnects on demand, so provider-side idle
    disconnects between utterances (or before the call starts) cannot kill
    auto-cross-off for the rest of the session.
    """

    def __init__(self, config: RealtimeConnectionConfig) -> None:
        self._config = config
        self._ws = None
        self.provider = config.provider
        self.target = config.target
        self.model = config.model

    async def prepare(self) -> None:
        await self._ensure_connected()

    async def close(self) -> None:
        ws, self._ws = self._ws, None
        if ws is not None:
            try:
                await ws.close()
            except Exception:
                pass

    async def evaluate(self, rubric: str, prompt: str) -> list[tuple[str, dict]]:
        try:
            await self._ensure_connected()
            return await self._evaluate_on_socket(rubric, prompt)
        except (websockets.ConnectionClosed, OSError):
            # The socket died since last use (idle timeouts are routine on
            # long calls) — reconnect once and retry.
            await self.close()
            await self._ensure_connected()
            return await self._evaluate_on_socket(rubric, prompt)

    async def _ensure_connected(self) -> None:
        if self._ws is not None:
            return
        ws = await websockets.connect(
            self._config.url, additional_headers=self._config.headers
        )
        try:
            # GA requires session.type; everything else is supplied per
            # response, keeping evaluations stateless.
            session_payload: dict[str, Any] = {
                "type": "realtime",
                "output_modalities": ["text"],
            }
            if self._config.provider != "azure":
                # Azure selects the deployment via the URL's model query param.
                session_payload["model"] = self._config.model
            await ws.send(json.dumps({"type": "session.update", "session": session_payload}))
        except Exception:
            try:
                await ws.close()
            except Exception:
                pass
            raise
        self._ws = ws

    async def _evaluate_on_socket(self, rubric: str, prompt: str) -> list[tuple[str, dict]]:
        ws = self._ws
        if ws is None:
            raise RuntimeError("Realtime WebSocket is not connected")
        await ws.send(
            json.dumps(
                {
                    "type": "response.create",
                    "response": {
                        "conversation": "none",
                        "output_modalities": ["text"],
                        "instructions": rubric,
                        "tools": _tool_schemas(),
                        "tool_choice": "auto",
                        "input": [
                            {
                                "type": "message",
                                "role": "user",
                                "content": [{"type": "input_text", "text": prompt}],
                            }
                        ],
                    },
                },
                separators=(",", ":"),
            )
        )

        calls: list[tuple[str, dict]] = []
        seen_call_ids: set[str] = set()
        while True:
            event = json.loads(await ws.recv())
            event_type = event.get("type")
            if event_type == "error":
                error = event.get("error") or {}
                logger.warning(
                    "Realtime API error target=%s error=%s",
                    self.target,
                    json.dumps(error),
                )
                raise RuntimeError(error.get("message") or "Realtime API error")
            if event_type == "response.output_item.done":
                item = event.get("item") or {}
                if item.get("type") == "function_call":
                    _collect_function_call(item, calls, seen_call_ids)
            elif event_type == "response.function_call_arguments.done":
                _collect_function_call(event, calls, seen_call_ids)
            elif event_type == "response.done":
                return calls


def _collect_function_call(
    item: dict[str, Any],
    calls: list[tuple[str, dict]],
    seen_call_ids: set[str],
) -> None:
    name = item.get("name")
    if name not in _TOOL_NAMES:
        return
    call_id = item.get("call_id") or item.get("id")
    if call_id:
        if call_id in seen_call_ids:
            return
        seen_call_ids.add(call_id)
    raw_args = item.get("arguments") or "{}"
    try:
        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
    except json.JSONDecodeError:
        args = {}
    calls.append((name, args if isinstance(args, dict) else {}))


class _GeminiTransport(_EvaluationTransport):
    provider = "gemini"
    target = "generativelanguage.googleapis.com"

    def __init__(self) -> None:
        self.model = get_settings().gemini_model

    async def prepare(self) -> None:
        if not get_settings().gemini_api_key:
            raise ValueError("GEMINI_API_KEY is not configured")

    async def evaluate(self, rubric: str, prompt: str) -> list[tuple[str, dict]]:
        settings = get_settings()
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is not configured")

        import google.generativeai as genai

        genai.configure(api_key=settings.gemini_api_key)
        gemini_tools = [{"function_declarations": _rest_tool_declarations()}]
        model = genai.GenerativeModel(
            model_name=settings.gemini_model,
            system_instruction=rubric,
            tools=gemini_tools,
        )
        response = await model.generate_content_async(
            prompt,
            tools=gemini_tools,
            tool_config={"function_calling_config": {"mode": "auto"}},
            request_options={"timeout": int(settings.ai_request_timeout_seconds)},
        )
        return _extract_gemini_tool_calls(response)


class _OpenAIRestTransport(_EvaluationTransport):
    provider = "openai_rest"
    target = "api.openai.com"

    def __init__(self) -> None:
        self.model = get_settings().openai_model

    async def prepare(self) -> None:
        if not get_settings().openai_api_key:
            raise ValueError("OPENAI_API_KEY is not configured")

    async def evaluate(self, rubric: str, prompt: str) -> list[tuple[str, dict]]:
        settings = get_settings()
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY is not configured")

        import httpx

        body = {
            "model": settings.openai_model,
            "messages": [
                {"role": "system", "content": rubric},
                {"role": "user", "content": prompt},
            ],
            "tools": [
                {"type": "function", "function": declaration}
                for declaration in _rest_tool_declarations()
            ],
            "tool_choice": "auto",
        }
        async with httpx.AsyncClient(timeout=settings.ai_request_timeout_seconds + 10) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=body,
            )
        if response.status_code >= 400:
            raise RuntimeError(
                f"OpenAI API error HTTP {response.status_code}: {response.text[:200]}"
            )
        return _extract_openai_tool_calls(response.json())


class _AnthropicTransport(_EvaluationTransport):
    provider = "anthropic"
    target = "api.anthropic.com"

    def __init__(self) -> None:
        self.model = get_settings().anthropic_model

    async def prepare(self) -> None:
        if not get_settings().anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY is not configured")

    async def evaluate(self, rubric: str, prompt: str) -> list[tuple[str, dict]]:
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY is not configured")

        import httpx

        body = {
            "model": settings.anthropic_model,
            "max_tokens": 1024,
            "system": rubric,
            "messages": [{"role": "user", "content": prompt}],
            "tools": [
                {
                    "name": declaration["name"],
                    "description": declaration["description"],
                    "input_schema": declaration["parameters"],
                }
                for declaration in _rest_tool_declarations()
            ],
        }
        async with httpx.AsyncClient(timeout=settings.ai_request_timeout_seconds + 10) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=body,
            )
        if response.status_code >= 400:
            raise RuntimeError(
                f"Anthropic API error HTTP {response.status_code}: {response.text[:200]}"
            )
        payload = response.json()
        calls: list[tuple[str, dict]] = []
        for block in payload.get("content") or []:
            if not isinstance(block, dict) or block.get("type") != "tool_use":
                continue
            name = block.get("name")
            if name not in _TOOL_NAMES:
                continue
            args = block.get("input") or {}
            calls.append((name, args if isinstance(args, dict) else {}))
        return calls


def _proto_to_plain(value: Any) -> Any:
    """Convert Gemini proto MapComposite/RepeatedComposite values into plain
    dicts/lists so downstream isinstance checks work."""
    if isinstance(value, dict):
        return {key: _proto_to_plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_proto_to_plain(item) for item in value]
    if hasattr(value, "items"):
        return {key: _proto_to_plain(item) for key, item in value.items()}
    if hasattr(value, "__iter__") and not isinstance(value, (str, bytes)):
        return [_proto_to_plain(item) for item in value]
    return value


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
                args = _proto_to_plain(getattr(fn, "args", {}) or {})
                if name in _TOOL_NAMES:
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
            for tool_call in tool_calls:
                fn = tool_call.get("function") or {}
                name = fn.get("name", "")
                raw_args = fn.get("arguments", "{}")
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                except json.JSONDecodeError:
                    args = {}
                if name in _TOOL_NAMES:
                    results.append((name, args if isinstance(args, dict) else {}))
    except Exception:
        logger.exception("Failed to extract OpenAI tool calls")
    return results
