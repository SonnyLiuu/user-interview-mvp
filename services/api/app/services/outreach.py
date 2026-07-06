from __future__ import annotations

from fastapi.encoders import jsonable_encoder

from ..ai import generate_outreach_message
from ..core.db import get_pool
from ..core.errors import FOUNDATION_REQUIRED, GENERATION_FAILED
from ..core.errors import AIServiceError, BadRequestError, NotFoundError
from ..repositories import foundations as foundation_repo
from ..repositories import outreach_projects as outreach_project_repo
from ..repositories import outreach as outreach_repo
from ..repositories import people as people_repo
from ..domain.project_context import apply_idea_validation_brief, foundation_to_project_context, normalize_json


OUTREACH_BODY_MAX_CHARS = 300


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


def _clip(value: str, limit: int) -> str:
    text = _flatten(value)
    if len(text) <= limit:
        return text
    clipped = text[:limit].rsplit(" ", 1)[0].rstrip(" ,.;:-")
    return clipped or text[:limit].rstrip(" ,.;:-")


def normalize_outreach_content(content: dict | None) -> dict:
    raw = content if isinstance(content, dict) else {}
    return {
        "subject": _flatten(raw.get("subject")),
        "body": _strip(raw.get("body")),
    }


def fallback_outreach_content(person: dict, project_context: dict) -> dict:
    name = _flatten(person.get("name")) or "there"
    first_name = name.split(" ", 1)[0] if name != "there" else "there"
    first_name = _clip(first_name, 32) or "there"
    title = _clip(person.get("title"), 24)
    company = _clip(person.get("company"), 24)
    role = ", ".join(part for part in [title, company] if part)
    assumptions = project_context.get("key_assumptions") or []
    learning_topic = _clip(assumptions[0], 72) if assumptions else ""
    role_fragment = f" as {role}" if role else ""

    if project_context.get("project_type") == "networking":
        context = _clip(project_context.get("shared_context") or project_context.get("pain_point") or project_context.get("idea_summary"), 92)
        sender_context = _clip(project_context.get("sender_context"), 76)
        ask = _clip(project_context.get("desired_outcome") or project_context.get("value_prop"), 64) or "connect"
        required_mentions = project_context.get("required_mentions") or []
        include_selectivity = any(
            isinstance(item, str) and ("out of" in item.lower() or "selective" in item.lower())
            for item in required_mentions
        )
        selectivity = next(
            (
                _clip(item, 48)
                for item in required_mentions
                if isinstance(item, str) and ("out of" in item.lower() or "selective" in item.lower())
            ),
            "",
        )
        event_note = _clip(context, 64) or "we share the same event context"
        if sender_context and "oral presentation" in sender_context.lower():
            body = f"Hi {first_name}, {event_note}. I'm giving an oral presentation there"
            if include_selectivity and selectivity:
                body += f" ({selectivity})"
            body += f". Would love to {ask.lower()}."
            return {
                "subject": f"Quick hello, {first_name}",
                "body": body,
            }
        if context:
            body = (
                f"Hi {first_name}, {context}. "
                f"{sender_context + '. ' if sender_context else ''}Would love to {ask.lower()}."
            )
        else:
            body = (
                f"Hi {first_name}, {sender_context + '. ' if sender_context else ''}"
                f"Would love to {ask.lower()}."
            )
        return {
            "subject": f"Quick hello, {first_name}",
            "body": body,
        }

    if learning_topic:
        body = (
            f"Hi {first_name}, your experience{role_fragment} stood out. "
            f"I am learning how people handle {learning_topic.lower()}. "
            "Would you be open to a 20 minute call about what you have seen?"
        )
    else:
        body = (
            f"Hi {first_name}, your experience{role_fragment} stood out. "
            "I am learning from people who have seen this problem up close. "
            "Would you be open to a 20 minute call about what you have seen?"
        )

    return {
        "subject": f"Quick question, {first_name}",
        "body": body,
    }


def has_usable_outreach_body(content: dict) -> bool:
    body = content.get("body") or ""
    return bool(body) and len(body) <= OUTREACH_BODY_MAX_CHARS


async def refresh_outreach(user_id: str, person_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        person = await people_repo.get_owned_person(conn, user_id, person_id)
        if not person:
            raise NotFoundError("Not found")

        foundation_row = await foundation_repo.get_latest_foundation(conn, person["project_id"])
        raw_foundation = foundation_row["foundation_json"] if foundation_row else None
        active_outreach = None
        if person["project_type"] == "startup":
            active_outreach = await outreach_project_repo.find_active_idea_validation(conn, person["project_id"])

    foundation = normalize_json(raw_foundation)
    if not isinstance(foundation, dict):
        raise BadRequestError(
            "Project foundation is required before generating an outreach message",
            code=FOUNDATION_REQUIRED,
        )

    outreach_brief = normalize_json(active_outreach["brief_json"]) if active_outreach and active_outreach["brief_json"] else None
    project_context = foundation_to_project_context(
        apply_idea_validation_brief(foundation, outreach_brief if isinstance(outreach_brief, dict) else None),
        person["project_type"],
    )
    person_payload = _person_payload(person)
    try:
        generated = await generate_outreach_message(person_payload, project_context)
    except AIServiceError:
        generated = fallback_outreach_content(person_payload, project_context)

    content = normalize_outreach_content(generated)

    if not has_usable_outreach_body(content):
        content = normalize_outreach_content(fallback_outreach_content(person_payload, project_context))

    if not has_usable_outreach_body(content):
        raise BadRequestError("Could not create a usable outreach message. Try again.", code=GENERATION_FAILED)

    async with pool.acquire() as conn:
        created = await outreach_repo.replace_current_outreach(conn, person_id, content)

    return jsonable_encoder(dict(created))
