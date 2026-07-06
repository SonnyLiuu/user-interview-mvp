from __future__ import annotations

import json

from ..ai import extract_custom_slot_answer, extract_kickoff_idea, generate_foundation, generate_next_question
from ..core.db import get_pool
from ..core.errors import BadRequestError, NotFoundError
from ..domain.onboarding_engine import (
    choose_next_slot,
    is_onboarding_finishable,
    merge_kickoff_context,
    merge_slot_patch,
    normalize_onboarding_state,
    validate_choices,
)
from ..domain.project_modes import get_fallback_turn, get_kickoff_question, normalize_project_type
from ..repositories import onboarding as onboarding_repo
from ..repositories import projects as project_repo
from ..core.utils import slugify
from .guest_onboarding import ENTRY_GOALS, GOAL_BOTTLENECKS


async def _get_context(user_id: str | None, project_id: str, *, guest: bool = False):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = (
            await project_repo.find_unowned_project(conn, project_id)
            if guest
            else await project_repo.find_owned_project(conn, user_id, project_id)
        )
        if not project:
            raise NotFoundError("Not found")
        session = await onboarding_repo.get_session(conn, project_id)
        if not session:
            session = await onboarding_repo.create_session(conn, project_id)
        state_row = await onboarding_repo.get_state_row(conn, project_id)
        raw_state = state_row["state_json"] if state_row and state_row["state_json"] else None
        messages = await onboarding_repo.list_messages(conn, session["id"])

    if isinstance(raw_state, str):
        raw_state = json.loads(raw_state)
    project_type = normalize_project_type(dict(project).get("project_type"))
    state = normalize_onboarding_state(raw_state, project_type)

    chat_history = [
        {
            "role": row["role"],
            "content": row["content"],
            "messageType": row["message_type"],
        }
        for row in messages
    ]

    raw_progress = session["progress_json"]
    if isinstance(raw_progress, str):
        raw_progress = json.loads(raw_progress)
    progress = raw_progress or {}
    last_turn = progress.get("lastTurn") if isinstance(progress, dict) else None
    return project, session, state, chat_history, last_turn


async def _generate_turn(state: dict, chat_history: list[dict], project_type: str) -> dict:
    next_slot = choose_next_slot(state, project_type)
    if not next_slot:
        raise BadRequestError("No next slot")
    message_pairs = [{"role": msg["role"], "content": msg["content"]} for msg in chat_history]
    try:
        result = await generate_next_question(next_slot, message_pairs, state, project_type)
        valid, _reason = validate_choices(result["choices"], next_slot)
        if not valid:
            result = await generate_next_question(next_slot, message_pairs, state, project_type)
            valid, _reason = validate_choices(result["choices"], next_slot)
            if not valid:
                fallback = get_fallback_turn(project_type, next_slot)
                result = {"targetSlot": next_slot, **fallback}
    except Exception:
        fallback = get_fallback_turn(project_type, next_slot)
        result = {"targetSlot": next_slot, **fallback}
    return result


def _resolve_selected_choices(last_turn: dict, choice_ids: list[str]) -> list[dict]:
    if not isinstance(choice_ids, list):
        raise BadRequestError("choiceIds must be a list")
    if any(not isinstance(choice_id, str) for choice_id in choice_ids):
        raise BadRequestError("Invalid choice for current turn")
    requested_ids = set(choice_ids)
    if len(requested_ids) != len(choice_ids):
        raise BadRequestError("Invalid choice for current turn")
    selected = [
        choice
        for choice in last_turn.get("choices") or []
        if choice.get("id") in requested_ids
    ]
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
    if custom_text:
        return f"{custom_text}\n{selected_summary}"
    return selected_summary


def _request_data(body) -> dict:
    return body.model_dump(exclude_none=True) if hasattr(body, "model_dump") else body


def _chat_response(chat_history: list[dict], current_turn: dict | None, is_finishable: bool, status: str) -> dict:
    return {
        "messages": chat_history,
        "currentTurn": current_turn,
        "isFinishable": is_finishable,
        "sessionStatus": status,
    }


async def _unique_slug(conn, user_id: str, base_name: str) -> str:
    base_slug = slugify(base_name) or "startup"
    candidate = base_slug
    suffix = 2
    while await project_repo.find_duplicate_slug(conn, user_id, candidate):
        candidate = f"{base_slug}-{suffix}"
        suffix += 1
    return candidate


async def _auto_name_draft_startup(conn, project, user_id: str, state: dict, foundation: dict):
    if project["slug"] is not None:
        return
    startup_name = foundation.get("startupName") if isinstance(foundation, dict) else None
    if not isinstance(startup_name, str) or not startup_name.strip():
        startup_name = state.get("startupName")
    if not isinstance(startup_name, str) or not startup_name.strip():
        return
    clean_name = startup_name.strip()[:120]
    slug = await _unique_slug(conn, user_id, clean_name)
    await project_repo.update_project(conn, project["id"], name=clean_name, slug=slug)


def _ensure_startup_foundation_defaults(state: dict, foundation: dict, project_type: str) -> dict:
    if project_type != "startup" or not isinstance(foundation, dict):
        return foundation
    next_foundation = {**foundation}
    for key in ["startupName", "startupStage", "traction"]:
        if next_foundation.get(key):
            continue
        value = state.get(key)
        if value:
            next_foundation[key] = value

    if not next_foundation.get("keyAssumptions"):
        assumptions = []
        if next_foundation.get("targetUser") and next_foundation.get("painPoint"):
            assumptions.append(
                f"{next_foundation['targetUser']} experiences {next_foundation['painPoint']}"
            )
        if next_foundation.get("valueProp"):
            assumptions.append(
                f"The proposed value is meaningful enough to motivate a change: {next_foundation['valueProp']}"
            )
        next_foundation["keyAssumptions"] = assumptions

    recommendation = next_foundation.get("recommendedOutreachProject")
    if not isinstance(recommendation, dict) or recommendation.get("type") != "idea_validation":
        bottleneck = state.get("biggestBottleneck") or "your current startup uncertainty"
        next_foundation["recommendedOutreachProject"] = {
            "type": "idea_validation",
            "label": "Idea Validation",
            "reason": (
                "Idea Validation is the right first outreach project because it can turn "
                f"{bottleneck} into concrete conversations, sharper interview targets, and clearer learning goals."
            ),
        }
    next_foundation.pop("biggestBottleneck", None)
    return next_foundation


async def _persist_state_and_next_turn(
    session,
    project_id: str,
    state: dict,
    chat_history: list[dict],
    project_type: str,
) -> dict:
    finishable = is_onboarding_finishable(state, project_type)
    current_turn = None if finishable else await _generate_turn(state, chat_history, project_type)
    next_status = "ready" if finishable else "active"

    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            await onboarding_repo.save_state(conn, project_id, state)
            await onboarding_repo.persist_session_turn(conn, session["id"], current_turn, next_status)
            if current_turn:
                await onboarding_repo.save_message(conn, session["id"], project_id, "assistant", current_turn["question"], "question")

    if current_turn:
        chat_history.append({"role": "assistant", "content": current_turn["question"], "messageType": "question"})
    return _chat_response(chat_history, current_turn, finishable, next_status)


async def process_onboarding_request(
    user_id: str | None,
    project_id: str,
    body,
    *,
    guest: bool = False,
):
    project, session, state, chat_history, last_turn = await _get_context(user_id, project_id, guest=guest)
    project_type = normalize_project_type(dict(project).get("project_type"))
    body = _request_data(body)
    request_type = body.get("type")
    pool = get_pool()

    if request_type == "__init__":
        if len(chat_history) == 0:
            kickoff_question = get_kickoff_question(project_type)
            async with pool.acquire() as conn:
                await onboarding_repo.save_message(conn, session["id"], project_id, "assistant", kickoff_question, "question")
            chat_history.append({"role": "assistant", "content": kickoff_question, "messageType": "question"})

        current_turn = last_turn
        finishable = is_onboarding_finishable(state, project_type)
        if not current_turn and not finishable and len(chat_history) > 1:
            current_turn = await _generate_turn(state, chat_history, project_type)
            async with pool.acquire() as conn:
                await onboarding_repo.persist_session_turn(conn, session["id"], current_turn, "active")
        elif finishable:
            async with pool.acquire() as conn:
                await onboarding_repo.persist_session_turn(conn, session["id"], None, "ready")

        status = "ready" if finishable else (session["status"] or "active")
        return _chat_response(chat_history, current_turn, finishable, status)

    if request_type == "finish":
        if not is_onboarding_finishable(state, project_type):
            raise BadRequestError("Not finishable yet")
        message_pairs = [{"role": msg["role"], "content": msg["content"]} for msg in chat_history]
        foundation_payload = await generate_foundation(message_pairs, state, project_type)
        foundation = _ensure_startup_foundation_defaults(state, foundation_payload["foundation"], project_type)
        async with pool.acquire() as conn:
            async with conn.transaction():
                await onboarding_repo.insert_foundation(conn, project_id, foundation)
                await onboarding_repo.complete_session(conn, session["id"])
                if not guest and user_id:
                    await _auto_name_draft_startup(conn, project, user_id, state, foundation)
                await project_repo.update_project(conn, project_id, intake_status="complete")
        return _chat_response(chat_history, None, True, "completed")

    if request_type == "kickoff":
        message = (body.get("message") or "").strip()
        if not message:
            raise BadRequestError("Message is required")
        if len(message) > 4000:
            raise BadRequestError("Message is too long")
        async with pool.acquire() as conn:
            await onboarding_repo.save_message(conn, session["id"], project_id, "user", message, "custom_answer")
        chat_history.append({"role": "user", "content": message, "messageType": "custom_answer"})

        extracted = await extract_kickoff_idea(message, project_type)
        next_state = merge_kickoff_context(state, extracted, project_type)
        return await _persist_state_and_next_turn(session, project_id, next_state, chat_history, project_type)

    if request_type == "answer":
        if not last_turn:
            raise BadRequestError("No active turn to answer")
        custom_text = (body.get("customText") or "").strip()
        if len(custom_text) > 2000:
            raise BadRequestError("Answer is too long")
        selected_choices = _resolve_selected_choices(last_turn, body.get("choiceIds") or [])
        if not custom_text and not selected_choices:
            raise BadRequestError("Answer text or choices are required")

        answer_content = _format_answer_message(last_turn, selected_choices, custom_text)
        message_type = "custom_answer" if custom_text else "choice_answer"
        async with pool.acquire() as conn:
            await onboarding_repo.save_message(conn, session["id"], project_id, "user", answer_content, message_type)
        chat_history.append({"role": "user", "content": answer_content, "messageType": message_type})

        if custom_text:
            recent = [{"role": msg["role"], "content": msg["content"]} for msg in chat_history[-4:]]
            extracted = await extract_custom_slot_answer(
                last_turn["targetSlot"],
                custom_text,
                recent,
                last_turn.get("choices") or [],
                selected_choices,
                project_type,
            )
            next_state = merge_slot_patch(state, last_turn["targetSlot"], extracted["value"], extracted["quality"], project_type)
        else:
            selected_values = [choice["normalizedValue"] for choice in selected_choices]
            next_state = merge_slot_patch(state, last_turn["targetSlot"], selected_values, "solid", project_type)

        return await _persist_state_and_next_turn(session, project_id, next_state, chat_history, project_type)

    raise BadRequestError("Invalid request type")


async def process_guest_onboarding_request(project_id: str, body):
    return await process_onboarding_request(None, project_id, body, guest=True)


async def save_startup_profile(user_id: str, project_id: str, startup_stage: str, entry_goal: str):
    stage = (startup_stage or "").strip()[:80]
    if not stage:
        raise BadRequestError("Startup stage is required")
    if entry_goal not in ENTRY_GOALS:
        raise BadRequestError("Invalid entry goal")

    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
        if not project:
            raise NotFoundError("Not found")
        project_type = normalize_project_type(dict(project).get("project_type"))
        state_row = await onboarding_repo.get_state_row(conn, project_id)
        state = normalize_onboarding_state(
            state_row["state_json"] if state_row and state_row["state_json"] else None,
            project_type,
        )
        state = merge_slot_patch(state, "startupStage", stage, "solid", project_type)
        state = merge_slot_patch(state, "biggestBottleneck", GOAL_BOTTLENECKS[entry_goal], "solid", project_type)
        async with conn.transaction():
            await onboarding_repo.save_state(conn, project_id, state)
            await project_repo.update_project(conn, project_id, entry_goal=entry_goal)
    return {"profile": {"startupStage": stage, "entryGoal": entry_goal}}
