from __future__ import annotations

from fastapi.encoders import jsonable_encoder

from ..ai import generate_outreach_message
from ..db import get_pool
from ..errors import BadRequestError, NotFoundError
from ..repositories import foundations as foundation_repo
from ..repositories import outreach as outreach_repo
from ..repositories import people as people_repo
from .project_context import foundation_to_project_context, normalize_json


def _person_payload(row) -> dict:
    analysis = normalize_json(row["analysis"]) if row["analysis"] else None
    return {
        "name": row["name"],
        "title": row["title"],
        "company": row["company"],
        "persona_type": row["persona_type"],
        "analysis": analysis if isinstance(analysis, dict) else None,
    }


def _flatten(value) -> str:
    if not isinstance(value, str):
        return ""
    return " ".join(value.strip().split())


def _strip(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def normalize_outreach_content(content: dict | None) -> dict:
    raw = content if isinstance(content, dict) else {}
    return {
        "subject": _flatten(raw.get("subject")),
        "body": _strip(raw.get("body")),
    }


async def refresh_outreach(user_id: str, person_id: str):
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
            "Project foundation is required before generating an outreach message",
            code="foundation_required",
        )

    project_context = foundation_to_project_context(foundation)
    content = normalize_outreach_content(
        await generate_outreach_message(_person_payload(person), project_context)
    )

    if not content.get("body"):
        raise BadRequestError(
            "AI did not return a usable outreach message. Try again.",
            code="generation_failed",
        )

    async with pool.acquire() as conn:
        created = await outreach_repo.replace_current_outreach(conn, person_id, content)

    return jsonable_encoder(dict(created))
