from __future__ import annotations

import json

from ..ai import extract_custom_slot_answer, extract_kickoff_idea, generate_foundation, generate_next_question
from ..db import get_pool
from ..errors import BadRequestError, NotFoundError
from ..onboarding_engine import (
    choose_next_slot,
    get_fallback_choices,
    is_onboarding_finishable,
    merge_kickoff_context,
    merge_slot_patch,
    normalize_onboarding_state,
    validate_choices,
)
from ..repositories import onboarding as onboarding_repo
from ..repositories import projects as project_repo


async def _get_context(user_id: str, project_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
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
    state = normalize_onboarding_state(raw_state)

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


async def _generate_turn(state: dict, chat_history: list[dict]) -> dict:
    next_slot = choose_next_slot(state)
    if not next_slot:
        raise BadRequestError("No next slot")
    message_pairs = [{"role": msg["role"], "content": msg["content"]} for msg in chat_history]
    try:
        result = await generate_next_question(next_slot, message_pairs, state)
        valid, _reason = validate_choices(result["choices"], next_slot)
        if not valid:
            result = await generate_next_question(next_slot, message_pairs, state)
            valid, _reason = validate_choices(result["choices"], next_slot)
            if not valid:
                fallback = get_fallback_choices(next_slot)
                result = {"targetSlot": next_slot, **fallback}
    except Exception:
        fallback = get_fallback_choices(next_slot)
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


async def process_onboarding_request(user_id: str, project_id: str, body: dict):
    _project, session, state, chat_history, last_turn = await _get_context(user_id, project_id)
    request_type = body.get("type")
    pool = get_pool()

    if request_type == "__init__":
        if len(chat_history) == 0:
            kickoff_question = "What are you building? Tell me about your idea - what it does, who it's for, and what problem it solves."
            async with pool.acquire() as conn:
                await onboarding_repo.save_message(conn, session["id"], project_id, "assistant", kickoff_question, "question")
            chat_history.append({"role": "assistant", "content": kickoff_question, "messageType": "question"})

        current_turn = last_turn
        finishable = is_onboarding_finishable(state)
        if not current_turn and not finishable and len(chat_history) > 1:
            current_turn = await _generate_turn(state, chat_history)
            async with pool.acquire() as conn:
                await onboarding_repo.persist_session_turn(conn, session["id"], current_turn, "active")
        elif finishable:
            async with pool.acquire() as conn:
                await onboarding_repo.persist_session_turn(conn, session["id"], None, "ready")

        return {
            "messages": chat_history,
            "currentTurn": current_turn,
            "isFinishable": finishable,
            "sessionStatus": "ready" if finishable else (session["status"] or "active"),
        }

    if request_type == "finish":
        if not is_onboarding_finishable(state):
            raise BadRequestError("Not finishable yet")
        message_pairs = [{"role": msg["role"], "content": msg["content"]} for msg in chat_history]
        foundation_payload = await generate_foundation(message_pairs, state)
        async with pool.acquire() as conn:
            async with conn.transaction():
                await onboarding_repo.insert_foundation(conn, project_id, foundation_payload["foundation"])
                await onboarding_repo.complete_session(conn, session["id"])
                await project_repo.update_project(conn, project_id, intake_status="complete")
        return {
            "messages": chat_history,
            "currentTurn": None,
            "isFinishable": True,
            "sessionStatus": "completed",
        }

    if request_type == "kickoff":
        message = (body.get("message") or "").strip()
        if not message:
            raise BadRequestError("Message is required")
        async with pool.acquire() as conn:
            await onboarding_repo.save_message(conn, session["id"], project_id, "user", message, "custom_answer")
        chat_history.append({"role": "user", "content": message, "messageType": "custom_answer"})
        extracted = await extract_kickoff_idea(message)
        next_state = merge_kickoff_context(state, extracted)
        finishable = is_onboarding_finishable(next_state)
        current_turn = None if finishable else await _generate_turn(next_state, chat_history)
        async with pool.acquire() as conn:
            async with conn.transaction():
                await onboarding_repo.save_state(conn, project_id, next_state)
                await onboarding_repo.persist_session_turn(conn, session["id"], current_turn, "ready" if finishable else "active")
                if current_turn:
                    await onboarding_repo.save_message(conn, session["id"], project_id, "assistant", current_turn["question"], "question")
        if current_turn:
            chat_history.append({"role": "assistant", "content": current_turn["question"], "messageType": "question"})
        return {
            "messages": chat_history,
            "currentTurn": current_turn,
            "isFinishable": finishable,
            "sessionStatus": "ready" if finishable else (session["status"] or "active"),
        }

    if request_type == "answer":
        if not last_turn:
            raise BadRequestError("No active turn to answer")
        custom_text = (body.get("customText") or "").strip()
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
            )
            next_state = merge_slot_patch(state, last_turn["targetSlot"], extracted["value"], extracted["quality"])
        else:
            selected_values = [choice["normalizedValue"] for choice in selected_choices]
            next_state = merge_slot_patch(state, last_turn["targetSlot"], selected_values, "solid")

        if is_onboarding_finishable(next_state):
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await onboarding_repo.save_state(conn, project_id, next_state)
                    await onboarding_repo.persist_session_turn(conn, session["id"], None, "ready")
            return {
                "messages": chat_history,
                "currentTurn": None,
                "isFinishable": True,
                "sessionStatus": "ready",
            }

        current_turn = await _generate_turn(next_state, chat_history)
        async with pool.acquire() as conn:
            async with conn.transaction():
                await onboarding_repo.save_state(conn, project_id, next_state)
                await onboarding_repo.persist_session_turn(conn, session["id"], current_turn, "active")
                await onboarding_repo.save_message(conn, session["id"], project_id, "assistant", current_turn["question"], "question")
        chat_history.append({"role": "assistant", "content": current_turn["question"], "messageType": "question"})
        return {
            "messages": chat_history,
            "currentTurn": current_turn,
            "isFinishable": False,
            "sessionStatus": session["status"] or "active",
        }

    if request_type == "choice":
        selected = None
        if last_turn:
            for choice in last_turn["choices"]:
                if choice["id"] == body.get("choiceId"):
                    selected = choice
                    break
        if not last_turn or not selected:
            raise BadRequestError("Invalid choice for current turn")
        async with pool.acquire() as conn:
            await onboarding_repo.save_message(conn, session["id"], project_id, "user", selected["label"], "choice_answer")
        chat_history.append({"role": "user", "content": selected["label"], "messageType": "choice_answer"})
        next_state = merge_slot_patch(state, selected["slotKey"], selected["normalizedValue"], "solid")
        if is_onboarding_finishable(next_state):
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await onboarding_repo.save_state(conn, project_id, next_state)
                    await onboarding_repo.persist_session_turn(conn, session["id"], None, "ready")
            return {
                "messages": chat_history,
                "currentTurn": None,
                "isFinishable": True,
                "sessionStatus": "ready",
            }

        current_turn = await _generate_turn(next_state, chat_history)
        async with pool.acquire() as conn:
            async with conn.transaction():
                await onboarding_repo.save_state(conn, project_id, next_state)
                await onboarding_repo.persist_session_turn(conn, session["id"], current_turn, "active")
                await onboarding_repo.save_message(conn, session["id"], project_id, "assistant", current_turn["question"], "question")
        chat_history.append({"role": "assistant", "content": current_turn["question"], "messageType": "question"})
        return {
            "messages": chat_history,
            "currentTurn": current_turn,
            "isFinishable": False,
            "sessionStatus": session["status"] or "active",
        }

    if request_type == "custom":
        custom_text = (body.get("customText") or "").strip()
        if not custom_text:
            raise BadRequestError("Custom text is required")
        if not last_turn:
            raise BadRequestError("No active turn to answer")
        async with pool.acquire() as conn:
            await onboarding_repo.save_message(conn, session["id"], project_id, "user", custom_text, "custom_answer")
        chat_history.append({"role": "user", "content": custom_text, "messageType": "custom_answer"})
        recent = [{"role": msg["role"], "content": msg["content"]} for msg in chat_history[-4:]]
        extracted = await extract_custom_slot_answer(
            last_turn["targetSlot"],
            custom_text,
            recent,
            last_turn.get("choices") or [],
        )
        next_state = merge_slot_patch(state, last_turn["targetSlot"], extracted["value"], extracted["quality"])
        if is_onboarding_finishable(next_state):
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await onboarding_repo.save_state(conn, project_id, next_state)
                    await onboarding_repo.persist_session_turn(conn, session["id"], None, "ready")
            return {
                "messages": chat_history,
                "currentTurn": None,
                "isFinishable": True,
                "sessionStatus": "ready",
            }

        current_turn = await _generate_turn(next_state, chat_history)
        async with pool.acquire() as conn:
            async with conn.transaction():
                await onboarding_repo.save_state(conn, project_id, next_state)
                await onboarding_repo.persist_session_turn(conn, session["id"], current_turn, "active")
                await onboarding_repo.save_message(conn, session["id"], project_id, "assistant", current_turn["question"], "question")
        chat_history.append({"role": "assistant", "content": current_turn["question"], "messageType": "question"})
        return {
            "messages": chat_history,
            "currentTurn": current_turn,
            "isFinishable": False,
            "sessionStatus": session["status"] or "active",
        }

    raise BadRequestError("Invalid request type")
