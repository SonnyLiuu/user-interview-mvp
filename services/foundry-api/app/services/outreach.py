from __future__ import annotations

from fastapi.encoders import jsonable_encoder

from ..ai import generate_outreach_message
from ..db import get_pool
from ..error_codes import FOUNDATION_REQUIRED, GENERATION_FAILED
from ..errors import AIServiceError, BadRequestError, NotFoundError
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


def fallback_outreach_content(person: dict, project_context: dict) -> dict:
    analysis = person.get("analysis") or {}
    name = _flatten(person.get("name")) or "there"
    first_name = name.split(" ", 1)[0] if name != "there" else "there"
    title = _flatten(person.get("title"))
    company = _flatten(person.get("company"))
    role = ", ".join(part for part in [title, company] if part)
    why = _strip(analysis.get("why_they_matter"))
    summary = _strip(analysis.get("summary"))
    assumptions = project_context.get("key_assumptions") or []
    learning_topic = _flatten(assumptions[0]) if assumptions else ""

    context_sentence = why or summary
    if context_sentence:
        context_sentence = f"I came across your background{f' as {role}' if role else ''}, and {context_sentence[:220].rstrip('.')}."
    else:
        context_sentence = f"I came across your background{f' as {role}' if role else ''} and thought your perspective would be useful."

    topic_sentence = (
        f"I am trying to learn how people with direct experience think about {learning_topic.lower()}."
        if learning_topic
        else "I am trying to learn from people who have seen this kind of problem up close."
    )

    return {
        "subject": f"Quick question, {first_name}",
        "body": (
            f"Hi {first_name}, {context_sentence} "
            f"{topic_sentence} "
            "Would you be open to a 20 minute call so I can ask how you have handled this in practice? "
            "I am not looking to pitch anything; I am trying to learn from the right people."
        ),
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
            code=FOUNDATION_REQUIRED,
        )

    project_context = foundation_to_project_context(foundation)
    person_payload = _person_payload(person)
    try:
        generated = await generate_outreach_message(person_payload, project_context)
    except AIServiceError:
        generated = fallback_outreach_content(person_payload, project_context)

    content = normalize_outreach_content(generated)

    if not content.get("body"):
        content = normalize_outreach_content(fallback_outreach_content(person_payload, project_context))

    if not content.get("body"):
        raise BadRequestError("Could not create a usable outreach message. Try again.", code=GENERATION_FAILED)

    async with pool.acquire() as conn:
        created = await outreach_repo.replace_current_outreach(conn, person_id, content)

    return jsonable_encoder(dict(created))
