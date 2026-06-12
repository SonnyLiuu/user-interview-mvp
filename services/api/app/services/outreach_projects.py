from __future__ import annotations

import json
from typing import AsyncIterator

from fastapi.encoders import jsonable_encoder

from ..ai import stream_intake_reply
from ..db import get_pool
from ..errors import BadRequestError, NotFoundError
from ..outreach_onboarding_modes import (
    extract_outreach_update,
    get_outreach_onboarding_mode,
    is_ready as is_outreach_onboarding_ready,
    merge_update as merge_outreach_onboarding_update,
    normalize_state as normalize_outreach_onboarding_state,
)
from ..project_modes import (
    LEGACY_OUTREACH_TYPE_IDEA_VALIDATION,
    OUTREACH_TYPE_IDEA_VALIDATION,
    PROJECT_TYPE_STARTUP,
    get_outreach_project_type_config,
    is_creatable_outreach_project_type,
    is_valid_outreach_project_type,
    normalize_outreach_project_type,
    normalize_project_type,
)
from ..repositories import foundations as foundation_repo
from ..repositories import outreach_projects as outreach_project_repo
from ..repositories import projects as project_repo

IDEA_VALIDATION_KICKOFF = "What outcome do you want from this outreach?"

IDEA_VALIDATION_SLOTS = [
    {
        "key": "desiredOutcome",
        "required": True,
        "array": False,
        "fallback": {
            "question": "What outcome do you want from this outreach?",
            "choices": [
                {"id": "a", "label": "Validate whether the problem is painful enough", "normalizedValue": "Validate whether the problem is painful enough"},
                {"id": "b", "label": "Learn who owns the workflow or buying decision", "normalizedValue": "Learn who owns the workflow or buying decision"},
                {"id": "c", "label": "Understand current workarounds and switching friction", "normalizedValue": "Understand current workarounds and switching friction"},
                {"id": "d", "label": "Identify which segment has the strongest urgency", "normalizedValue": "Identify which segment has the strongest urgency"},
            ],
            "customPlaceholder": "Describe what you want to learn from these conversations...",
        },
    },
    {
        "key": "targetPeople",
        "required": True,
        "array": True,
        "fallback": {
            "question": "Who should you talk to first to learn this quickly?",
            "choices": [
                {"id": "a", "label": "Target users who feel the pain often and can explain their workaround", "normalizedValue": "Target users who feel the pain often and can explain their workaround"},
                {"id": "b", "label": "Power users or operators who own the workflow day to day", "normalizedValue": "Power users or operators who own the workflow day to day"},
                {"id": "c", "label": "Decision makers who know why tools get adopted or rejected", "normalizedValue": "Decision makers who know why tools get adopted or rejected"},
                {"id": "d", "label": "Domain experts who understand the market and failure modes", "normalizedValue": "Domain experts who understand the market and failure modes"},
            ],
            "customPlaceholder": "Name the roles, segments, or person types you want to interview...",
        },
    },
    {
        "key": "assumptionsToTest",
        "required": True,
        "array": True,
        "fallback": {
            "question": "What assumptions should these conversations test?",
            "choices": [
                {"id": "a", "label": "The problem is frequent or painful enough to prioritize", "normalizedValue": "The problem is frequent or painful enough to prioritize"},
                {"id": "b", "label": "The current workaround is expensive, slow, or unreliable", "normalizedValue": "The current workaround is expensive, slow, or unreliable"},
                {"id": "c", "label": "This buyer or user segment has stronger urgency than others", "normalizedValue": "This buyer or user segment has stronger urgency than others"},
                {"id": "d", "label": "The proposed value would change behavior or trigger adoption", "normalizedValue": "The proposed value would change behavior or trigger adoption"},
            ],
            "customPlaceholder": "List the riskiest assumptions or unknowns...",
        },
    },
    {
        "key": "learningGoals",
        "required": False,
        "array": True,
        "fallback": {
            "question": "What should you understand after these conversations?",
            "choices": [
                {"id": "a", "label": "How people describe the problem in their own words", "normalizedValue": "How people describe the problem in their own words"},
                {"id": "b", "label": "What triggers the problem and how often it appears", "normalizedValue": "What triggers the problem and how often it appears"},
                {"id": "c", "label": "What alternatives people use today", "normalizedValue": "What alternatives people use today"},
                {"id": "d", "label": "What would make someone try a new solution", "normalizedValue": "What would make someone try a new solution"},
            ],
            "customPlaceholder": "Add any specific learning goals...",
        },
    },
    {
        "key": "conversationBoundaries",
        "required": False,
        "array": True,
        "fallback": {
            "question": "What should this outreach avoid so it stays learning-oriented?",
            "choices": [
                {"id": "a", "label": "Do not pitch the product before understanding their experience", "normalizedValue": "Do not pitch the product before understanding their experience"},
                {"id": "b", "label": "Do not ask for a demo or purchase", "normalizedValue": "Do not ask for a demo or purchase"},
                {"id": "c", "label": "Ask for perspective, feedback, or experience instead of selling", "normalizedValue": "Ask for perspective, feedback, or experience instead of selling"},
                {"id": "d", "label": "Keep the ask short and respectful", "normalizedValue": "Keep the ask short and respectful"},
            ],
            "customPlaceholder": "Describe any language or asks to avoid...",
        },
    },
]


def _request_data(body) -> dict:
    return body.model_dump(exclude_none=True) if hasattr(body, "model_dump") else body


def _encode_row(row):
    if not row:
        return None

    encoded = dict(row)
    if encoded.get("type") == LEGACY_OUTREACH_TYPE_IDEA_VALIDATION:
        encoded["type"] = OUTREACH_TYPE_IDEA_VALIDATION
    if encoded.get("name") == "Information" + " " + "Discovery":
        encoded["name"] = "Idea Validation"
    return jsonable_encoder(encoded)


def _slot_keys() -> list[str]:
    return [slot["key"] for slot in IDEA_VALIDATION_SLOTS]


def _array_slots() -> set[str]:
    return {slot["key"] for slot in IDEA_VALIDATION_SLOTS if slot.get("array")}


def _required_slots() -> list[str]:
    return [slot["key"] for slot in IDEA_VALIDATION_SLOTS if slot.get("required")]


def _empty_idea_validation_state() -> dict:
    array_slots = _array_slots()
    keys = _slot_keys()
    return {
        **{key: ([] if key in array_slots else None) for key in keys},
        "completeness": {key: "missing" for key in keys},
        "followUpCounts": {key: 0 for key in keys},
    }


def _normalize_idea_validation_state(raw_state) -> dict:
    state = _empty_idea_validation_state()
    if not isinstance(raw_state, dict):
        return state
    for key in _slot_keys():
        if key in raw_state:
            if key in _array_slots():
                value = raw_state.get(key)
                state[key] = [item for item in value if isinstance(item, str) and item.strip()] if isinstance(value, list) else []
            else:
                value = raw_state.get(key)
                state[key] = value.strip() if isinstance(value, str) and value.strip() else None
    completeness = raw_state.get("completeness") or {}
    followups = raw_state.get("followUpCounts") or {}
    for key in _slot_keys():
        if completeness.get(key) in {"missing", "weak", "solid"}:
            state["completeness"][key] = completeness[key]
        if isinstance(followups.get(key), int):
            state["followUpCounts"][key] = max(0, followups[key])
    return state


def _normalize_onboarding_progress(row) -> dict:
    raw = dict(row).get("onboarding_state_json") or {}
    if not isinstance(raw, dict):
        raw = {}
    messages = raw.get("messages") if isinstance(raw.get("messages"), list) else []
    return {
        "state": _normalize_idea_validation_state(raw.get("state")),
        "messages": [
            {
                "role": msg.get("role"),
                "content": msg.get("content"),
                "messageType": msg.get("messageType"),
            }
            for msg in messages
            if isinstance(msg, dict) and msg.get("role") in {"assistant", "user"} and isinstance(msg.get("content"), str)
        ],
        "lastTurn": raw.get("lastTurn") if isinstance(raw.get("lastTurn"), dict) else None,
        "status": raw.get("status") if raw.get("status") in {"active", "ready", "completed"} else None,
    }


def _serialize_onboarding_progress(state: dict, messages: list[dict], last_turn: dict | None, status: str) -> dict:
    return {
        "layer": "outreach_project",
        "outreachProjectType": OUTREACH_TYPE_IDEA_VALIDATION,
        "status": status,
        "state": state,
        "messages": messages,
        "lastTurn": last_turn,
    }


def _fallback_turn(slot_key: str) -> dict:
    slot = next((slot for slot in IDEA_VALIDATION_SLOTS if slot["key"] == slot_key), None)
    if not slot:
        raise BadRequestError("Invalid outreach onboarding slot")
    fallback = slot["fallback"]
    return {
        "targetSlot": slot_key,
        "question": fallback["question"],
        "choices": [{**choice, "slotKey": slot_key} for choice in fallback["choices"]],
        "customPlaceholder": fallback["customPlaceholder"],
    }


def _choose_next_idea_validation_slot(state: dict) -> str | None:
    required = set(_required_slots())
    for key in _slot_keys():
        if key in required and state["completeness"].get(key) == "missing":
            return key
    for key in _slot_keys():
        if key not in required and state["completeness"].get(key) == "missing":
            return key
    return None


def _is_idea_validation_finishable(state: dict) -> bool:
    required_ready = all(state["completeness"].get(key) != "missing" for key in _required_slots())
    has_learning_context = bool(state.get("learningGoals") or state.get("assumptionsToTest") or state.get("targetPeople"))
    return required_ready and has_learning_context


def _merge_idea_validation_slot(state: dict, slot_key: str, value, quality: str = "solid") -> dict:
    next_state = {**state, "completeness": {**state["completeness"]}, "followUpCounts": {**state["followUpCounts"]}}
    next_state["completeness"][slot_key] = quality if quality in {"weak", "solid"} else "solid"
    if slot_key in _array_slots():
        values = value if isinstance(value, list) else [value]
        next_state[slot_key] = [item.strip() for item in values if isinstance(item, str) and item.strip()]
    else:
        next_state[slot_key] = ", ".join(value) if isinstance(value, list) else value
    return next_state


def _extract_kickoff_idea_validation(message: str) -> dict:
    state = _empty_idea_validation_state()
    clean = message.strip()
    if not clean:
        return state
    state = _merge_idea_validation_slot(state, "desiredOutcome", clean, "solid")
    lowered = clean.lower()
    learning_goals = []
    if any(word in lowered for word in ["validate", "pain", "problem"]):
        learning_goals.append("Validate whether the problem is painful enough")
    if any(word in lowered for word in ["workaround", "alternative", "today", "currently"]):
        learning_goals.append("Understand current workarounds and alternatives")
    if any(word in lowered for word in ["buyer", "decision", "pay", "purchase", "adopt"]):
        learning_goals.append("Learn buying, adoption, or decision-making friction")
    if any(word in lowered for word in ["segment", "who", "target", "persona"]):
        learning_goals.append("Identify which segment has the strongest urgency")
    if learning_goals:
        state = _merge_idea_validation_slot(state, "learningGoals", learning_goals, "solid")
    return state


def _merge_states(base_state: dict, patch_state: dict) -> dict:
    next_state = base_state
    for key in _slot_keys():
        if patch_state["completeness"].get(key) in {"weak", "solid"}:
            next_state = _merge_idea_validation_slot(next_state, key, patch_state.get(key), patch_state["completeness"][key])
    return next_state


def _resolve_selected_choices(last_turn: dict, choice_ids: list[str]) -> list[dict]:
    if not isinstance(choice_ids, list) or any(not isinstance(choice_id, str) for choice_id in choice_ids):
        raise BadRequestError("Invalid choice for current turn")
    requested_ids = set(choice_ids)
    if len(requested_ids) != len(choice_ids):
        raise BadRequestError("Invalid choice for current turn")
    selected = [choice for choice in last_turn.get("choices") or [] if choice.get("id") in requested_ids]
    if len(selected) != len(requested_ids):
        raise BadRequestError("Invalid choice for current turn")
    return selected


def _format_selected_suggestions(last_turn: dict, selected_choices: list[dict]) -> str:
    selected_ids = {choice.get("id") for choice in selected_choices}
    labels = [
        f"{index}. {choice['label']}"
        for index, choice in enumerate(last_turn.get("choices") or [], start=1)
        if choice.get("id") in selected_ids
    ]
    return f"Selected suggestions: {'; '.join(labels)}"


def _format_answer_message(last_turn: dict, selected_choices: list[dict], custom_text: str) -> str:
    if not selected_choices:
        return custom_text
    selected_summary = _format_selected_suggestions(last_turn, selected_choices)
    return f"{custom_text}\n{selected_summary}" if custom_text else selected_summary


def _chat_response(messages: list[dict], current_turn: dict | None, is_finishable: bool, status: str) -> dict:
    return {
        "messages": messages,
        "currentTurn": current_turn,
        "isFinishable": is_finishable,
        "sessionStatus": status,
    }


def _next_turn_or_ready(state: dict) -> tuple[dict | None, str, bool]:
    finishable = _is_idea_validation_finishable(state)
    if finishable:
        return None, "ready", True
    next_slot = _choose_next_idea_validation_slot(state)
    return (_fallback_turn(next_slot) if next_slot else None), "active", False


def _generate_idea_validation_brief(state: dict) -> dict:
    boundaries = state.get("conversationBoundaries") or ["Keep outreach framed as learning, not selling."]
    learning_goals = state.get("learningGoals") or [state.get("desiredOutcome") or "Clarify the most important unknowns"]
    target_people = state.get("targetPeople") or ["People who experience the problem directly"]
    assumptions = state.get("assumptionsToTest") or ["The problem is painful enough to justify a new workflow"]
    return {
        "type": OUTREACH_TYPE_IDEA_VALIDATION,
        "label": "Idea Validation",
        "desiredOutcome": state.get("desiredOutcome"),
        "learningGoals": learning_goals,
        "targetPeople": target_people,
        "assumptionsToTest": assumptions,
        "conversationBoundaries": boundaries,
        "outreachGuidance": (
            "Ask for perspective on the problem, current workarounds, and decision context. "
            "Avoid demo, purchase, or sales language unless the founder explicitly changes the goal."
        ),
        "starterAsk": (
            "I'm trying to learn how people handle this today. Would you be open to sharing your experience "
            "in a short conversation?"
        ),
    }


def _decode_foundation(row) -> dict:
    if not row:
        return {}
    raw = row["foundation_json"]
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            return {}
    return raw if isinstance(raw, dict) else {}


def _office_hours_messages(progress: dict) -> list[dict]:
    return [
        {
            "role": msg["role"],
            "content": msg["content"],
            "messageType": msg.get("messageType"),
        }
        for msg in progress.get("messages") or []
        if msg.get("role") in {"assistant", "user"} and isinstance(msg.get("content"), str)
    ]


async def stream_outreach_project_office_hours(
    user_id: str,
    outreach_project_id: str,
    message: str,
    recent_messages: list[dict] | None = None,
) -> AsyncIterator[str]:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await outreach_project_repo.find_for_owned_startup(conn, user_id, outreach_project_id)
        if not row:
            raise NotFoundError("Not found")
        outreach_type = normalize_outreach_project_type(dict(row).get("type"))
        mode = get_outreach_onboarding_mode(outreach_type)
        if not mode:
            label = get_outreach_project_type_config(outreach_type)["label"]
            raise BadRequestError(f"{label} onboarding is not available yet")
        foundation_row = await foundation_repo.get_latest_foundation(conn, row["startup_project_id"])

    progress = _normalize_onboarding_progress(row)
    state = normalize_outreach_onboarding_state(mode, progress["state"])
    persisted_messages = _office_hours_messages(progress)
    is_init = message == "__init__"

    if is_init and persisted_messages:
        return

    foundation = _decode_foundation(foundation_row)
    system_prompt = mode.build_system_prompt(foundation, state)
    history = recent_messages or persisted_messages
    api_messages = [
        {"role": msg.get("role"), "content": msg.get("content", "")}
        for msg in history[-10:]
        if msg.get("role") in {"assistant", "user"} and msg.get("content")
    ]
    if is_init:
        api_messages.append({"role": "user", "content": mode.kickoff_user_message})
    else:
        user_message = (message or "").strip()
        if not user_message:
            raise BadRequestError("Message is required")
        persisted_messages.append({"role": "user", "content": user_message, "messageType": "custom_answer"})
        api_messages.append({"role": "user", "content": user_message})

    full_response = ""
    async for chunk in stream_intake_reply(system_prompt, api_messages):
        full_response += chunk
        yield chunk

    update, brief_ready = extract_outreach_update(full_response)
    next_state = merge_outreach_onboarding_update(mode, state, update)
    persisted_messages.append({"role": "assistant", "content": full_response, "messageType": "advisor_reply"})

    ready = brief_ready and is_outreach_onboarding_ready(mode, next_state)
    status = "completed" if ready else "active"
    row_status = "active" if ready else "onboarding"
    brief = mode.build_brief(next_state) if ready else None

    async with pool.acquire() as conn:
        await outreach_project_repo.update_outreach_project(
            conn,
            outreach_project_id,
            status=row_status,
            brief_json=brief if brief else dict(row).get("brief_json"),
            onboarding_state_json=_serialize_onboarding_progress(next_state, persisted_messages, None, status),
        )


async def _get_owned_startup(conn, user_id: str, startup_project_id: str):
    project = await project_repo.find_owned_project(conn, user_id, startup_project_id)
    if not project:
        raise NotFoundError("Not found")
    if normalize_project_type(dict(project).get("project_type")) != PROJECT_TYPE_STARTUP:
        raise BadRequestError("Outreach projects can only be created inside a startup")
    return project


async def list_outreach_projects_for_startup(user_id: str, startup_project_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        await _get_owned_startup(conn, user_id, startup_project_id)
        rows = await outreach_project_repo.list_for_startup(conn, startup_project_id)
    return [_encode_row(row) for row in rows]


async def create_or_open_outreach_project(user_id: str, startup_project_id: str, body):
    data = _request_data(body)
    raw_type = data.get("type")
    if not is_valid_outreach_project_type(raw_type):
        raise BadRequestError("Invalid outreach project type")
    outreach_type = normalize_outreach_project_type(raw_type)
    if not is_creatable_outreach_project_type(outreach_type):
        label = get_outreach_project_type_config(outreach_type)["label"]
        raise BadRequestError(f"{label} is coming soon", code="outreach_type_unavailable")

    pool = get_pool()
    async with pool.acquire() as conn:
        await _get_owned_startup(conn, user_id, startup_project_id)
        existing = await outreach_project_repo.find_non_archived_by_type(conn, startup_project_id, outreach_type)
        if existing:
            return _encode_row(existing)

        config = get_outreach_project_type_config(outreach_type)
        name = (data.get("name") or config["label"]).strip()[:120]
        if not name:
            name = config["label"]
        row = await outreach_project_repo.create_outreach_project(
            conn,
            startup_project_id,
            outreach_type,
            name,
            "onboarding" if outreach_type == OUTREACH_TYPE_IDEA_VALIDATION else "draft",
        )
    return _encode_row(row)


async def get_outreach_project_for_user(user_id: str, outreach_project_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await outreach_project_repo.find_for_owned_startup(conn, user_id, outreach_project_id)
    if not row:
        raise NotFoundError("Not found")
    return _encode_row(row)


async def update_outreach_project_for_user(user_id: str, outreach_project_id: str, body):
    data = _request_data(body)
    updates: dict = {}
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            raise BadRequestError("Name cannot be empty")
        updates["name"] = name[:120]
    for key in ["status", "brief_json", "onboarding_state_json"]:
        if key in data:
            updates[key] = data[key]

    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await outreach_project_repo.find_for_owned_startup(conn, user_id, outreach_project_id)
        if not existing:
            raise NotFoundError("Not found")
        row = await outreach_project_repo.update_outreach_project(conn, outreach_project_id, **updates)
    return _encode_row(row)


async def process_idea_validation_onboarding(user_id: str, outreach_project_id: str, body):
    data = _request_data(body)
    request_type = data.get("type")
    pool = get_pool()

    async with pool.acquire() as conn:
        row = await outreach_project_repo.find_for_owned_startup(conn, user_id, outreach_project_id)
    if not row:
        raise NotFoundError("Not found")
    if normalize_outreach_project_type(dict(row).get("type")) != OUTREACH_TYPE_IDEA_VALIDATION:
        raise BadRequestError("Only Idea Validation onboarding is available in V1")

    progress = _normalize_onboarding_progress(row)
    state = progress["state"]
    messages = progress["messages"]
    last_turn = progress["lastTurn"]
    status = progress["status"] or ("completed" if dict(row).get("status") == "active" and dict(row).get("brief_json") else "active")

    if request_type == "__init__":
        if not messages:
            messages.append({"role": "assistant", "content": IDEA_VALIDATION_KICKOFF, "messageType": "question"})
        finishable = _is_idea_validation_finishable(state)
        current_turn = last_turn
        if finishable and status != "completed":
            current_turn = None
            status = "ready"
        async with pool.acquire() as conn:
            await outreach_project_repo.update_outreach_project(
                conn,
                outreach_project_id,
                onboarding_state_json=_serialize_onboarding_progress(state, messages, current_turn, status),
            )
        return _chat_response(messages, current_turn, finishable, status)

    if request_type == "kickoff":
        message = (data.get("message") or "").strip()
        if not message:
            raise BadRequestError("Message is required")
        messages.append({"role": "user", "content": message, "messageType": "custom_answer"})
        state = _merge_states(state, _extract_kickoff_idea_validation(message))
        current_turn, status, finishable = _next_turn_or_ready(state)
        if current_turn:
            messages.append({"role": "assistant", "content": current_turn["question"], "messageType": "question"})
        async with pool.acquire() as conn:
            await outreach_project_repo.update_outreach_project(
                conn,
                outreach_project_id,
                onboarding_state_json=_serialize_onboarding_progress(state, messages, current_turn, status),
                status="onboarding",
            )
        return _chat_response(messages, current_turn, finishable, status)

    if request_type == "answer":
        if not last_turn:
            raise BadRequestError("No active turn to answer")
        custom_text = (data.get("customText") or "").strip()
        selected_choices = _resolve_selected_choices(last_turn, data.get("choiceIds") or [])
        if not custom_text and not selected_choices:
            raise BadRequestError("Answer text or choices are required")

        answer_content = _format_answer_message(last_turn, selected_choices, custom_text)
        messages.append({
            "role": "user",
            "content": answer_content,
            "messageType": "custom_answer" if custom_text else "choice_answer",
        })
        selected_values = [choice["normalizedValue"] for choice in selected_choices]
        value = [*selected_values, custom_text] if custom_text and selected_values else (custom_text or selected_values)
        state = _merge_idea_validation_slot(state, last_turn["targetSlot"], value, "solid")
        current_turn, status, finishable = _next_turn_or_ready(state)
        if current_turn:
            messages.append({"role": "assistant", "content": current_turn["question"], "messageType": "question"})
        async with pool.acquire() as conn:
            await outreach_project_repo.update_outreach_project(
                conn,
                outreach_project_id,
                onboarding_state_json=_serialize_onboarding_progress(state, messages, current_turn, status),
            )
        return _chat_response(messages, current_turn, finishable, status)

    if request_type == "finish":
        if not _is_idea_validation_finishable(state):
            raise BadRequestError("Not finishable yet")
        brief = _generate_idea_validation_brief(state)
        status = "completed"
        async with pool.acquire() as conn:
            await outreach_project_repo.update_outreach_project(
                conn,
                outreach_project_id,
                status="active",
                brief_json=brief,
                onboarding_state_json=_serialize_onboarding_progress(state, messages, None, status),
            )
        return _chat_response(messages, None, True, status)

    raise BadRequestError("Invalid request type")
