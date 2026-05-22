from __future__ import annotations

from copy import deepcopy

from fastapi.encoders import jsonable_encoder

from ..ai import generate_call_brief
from ..db import get_pool
from ..error_codes import FOUNDATION_REQUIRED
from ..errors import BadRequestError, NotFoundError
from ..repositories import call_prep as call_prep_repo
from ..repositories import foundations as foundation_repo
from ..repositories import people as people_repo
from .project_context import foundation_to_project_context, normalize_json


FALLBACK_CALL_BRIEF = {
    "objective": "Learn whether this person experiences the problem strongly enough to change behavior.",
    "goals": [
        "Validate how often the pain happens and when it becomes urgent.",
        "Learn what workaround they use today and why it is not good enough.",
        "Clarify whether this person is the target user, decision maker, influencer, or introducer.",
    ],
    "questions": [
        "When did you last run into this problem?",
        "What do you do today when it happens?",
        "What makes the current workaround frustrating or expensive?",
        "Who else is involved when this problem needs to be solved?",
        "What would make this worth paying attention to now?",
        "Who else should I talk to who sees this problem up close?",
    ],
    "signals": [
        "They describe a recent, repeated, or expensive workaround.",
        "They can name other people who share or own the problem.",
        "They ask to see the solution or offer a relevant introduction.",
    ],
    "closing": "Ask for one specific person they recommend talking to next.",
}


def _person_payload(row) -> dict:
    analysis = normalize_json(row["analysis"]) if row["analysis"] else None
    return {
        "name": row["name"],
        "title": row["title"],
        "company": row["company"],
        "persona_type": row["persona_type"],
        "analysis": analysis if isinstance(analysis, dict) else None,
    }


async def get_call_brief(user_id: str, person_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        person = await people_repo.get_owned_person(conn, user_id, person_id)
        if not person:
            raise NotFoundError("Not found")

        existing = await call_prep_repo.get_current_call_prep(conn, person_id)

    if existing:
        row = dict(existing)
        content = normalize_call_brief_content(normalize_json(row.get("content")))
        if not _has_meaningful_content(content):
            content = fallback_call_brief_content()
        row["content"] = content
        return jsonable_encoder(row)
    return None


async def refresh_call_brief(user_id: str, person_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        person = await people_repo.get_owned_person(conn, user_id, person_id)
        if not person:
            raise NotFoundError("Not found")

        foundation_row = await foundation_repo.get_latest_foundation(conn, person["project_id"])
        raw_foundation = foundation_row["foundation_json"] if foundation_row else None

    foundation = normalize_json(raw_foundation)
    if not isinstance(foundation, dict):
        raise BadRequestError(
            "Project foundation is required before generating a call brief",
            code=FOUNDATION_REQUIRED,
        )

    project_context = foundation_to_project_context(foundation)
    content = normalize_call_brief_content(
        await generate_call_brief(_person_payload(person), project_context)
    )

    if not _has_meaningful_content(content):
        content = fallback_call_brief_content()

    async with pool.acquire() as conn:
        created = await call_prep_repo.replace_current_call_prep(conn, person_id, content)

    return jsonable_encoder(dict(created))


def _has_meaningful_content(content: dict | None) -> bool:
    if not isinstance(content, dict):
        return False
    objective = (content.get("objective") or "").strip()
    closing = (content.get("closing") or "").strip()
    has_lists = any(
        isinstance(content.get(key), list) and len(content[key]) > 0
        for key in ("goals", "questions", "signals")
    )
    return bool(objective or closing or has_lists)


def _clean_text(value) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.strip().split())


def _clean_list(value, *, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    seen: set[str] = set()
    for item in value:
        text = _clean_text(item)
        if len(text) < 8:
            continue
        key = text.lower().rstrip(".!?")
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(text)
        if len(cleaned) >= limit:
            break
    return cleaned


def normalize_call_brief_content(content: dict | None) -> dict:
    raw = content if isinstance(content, dict) else {}
    normalized = {
        "objective": _clean_text(raw.get("objective")),
        "goals": _clean_list(raw.get("goals"), limit=5),
        "questions": _clean_list(raw.get("questions"), limit=7),
        "signals": _clean_list(raw.get("signals"), limit=5),
        "closing": _clean_text(raw.get("closing")),
    }
    return normalized


def fallback_call_brief_content() -> dict:
    return deepcopy(FALLBACK_CALL_BRIEF)
