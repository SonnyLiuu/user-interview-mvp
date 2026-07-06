from __future__ import annotations

import json

from fastapi.encoders import jsonable_encoder

from ..core.db import get_pool
from ..core.errors import NotFoundError
from ..repositories import foundations as foundation_repo
from ..repositories import intake as intake_repo
from ..repositories import projects as project_repo


EPHEMERAL_STARTUP_FOUNDATION_KEYS = {"biggestBottleneck"}


def _clean_list(value):
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _sanitize_foundation_for_project(project_type: str | None, foundation_json):
    if not isinstance(foundation_json, dict):
        return foundation_json
    if project_type != "startup":
        return foundation_json
    return {
        key: value
        for key, value in foundation_json.items()
        if key not in EPHEMERAL_STARTUP_FOUNDATION_KEYS
    }


def _networking_match_profile(foundation_json: dict) -> dict:
    priority_types = _clean_list(foundation_json.get("priorityRecipientTypes"))
    low_fit = _clean_list(foundation_json.get("lowFitSignals") or foundation_json.get("messageBoundaries"))
    rubric = foundation_json.get("matchRubric")
    if not isinstance(rubric, str) or not rubric.strip():
        parts = [
            foundation_json.get("outreachGoal"),
            f"Prioritize recipients like: {foundation_json.get('recipients')}" if foundation_json.get("recipients") else None,
            f"Shared context/topic: {foundation_json.get('sharedContext')}" if foundation_json.get("sharedContext") else None,
            (
                f"Useful if they can respond with: {foundation_json.get('desiredOutcome')}"
                if foundation_json.get("desiredOutcome")
                else None
            ),
        ]
        rubric = "\n".join(part for part in parts if isinstance(part, str) and part.strip())
    return {
        "matchRubric": rubric or "",
        "priorityRecipientTypes": priority_types,
        "lowFitSignals": low_fit,
        "positivePatterns": [],
        "negativePatterns": [],
        "calibrationNotes": ["Profile refreshed from the project Foundation."],
    }


async def _refresh_networking_match_profile(conn, project_id: str, foundation_json: dict):
    latest = await conn.fetchrow(
        """
        select version
        from project_match_profiles
        where project_id = $1
        order by version desc
        limit 1
        """,
        project_id,
    )
    signal_count = await conn.fetchval(
        """
        select count(*)
        from person_events pe
        join people p on p.id = pe.person_id
        where p.project_id = $1
        and pe.metadata ? 'signalWeight'
        """,
        project_id,
    )
    next_version = (latest["version"] if latest else 0) + 1
    await conn.execute(
        """
        insert into project_match_profiles
            (project_id, version, profile_json, signal_count_at_generation)
        values ($1, $2, $3, $4)
        """,
        project_id,
        next_version,
        json.dumps(_networking_match_profile(foundation_json)),
        int(signal_count or 0),
    )
    await conn.execute(
        """
        update people
        set match_status = 'stale', updated_at = now()
        where project_id = $1
        and analysis_status = 'complete'
        and match_status = 'current'
        """,
        project_id,
    )


async def get_project_lookup(user_id: str, slug_or_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project_by_slug_or_id(conn, user_id, slug_or_id)
        if not project:
            raise NotFoundError("Not found")
        foundation = await foundation_repo.get_latest_foundation(conn, project["id"])

    return {
        "project": jsonable_encoder(dict(project)),
        "foundationExists": foundation is not None,
    }


async def get_workspace_summary(user_id: str, project_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
        if not project:
            raise NotFoundError("Not found")
        projects = await project_repo.list_projects(conn, user_id)

    return {
        "project": jsonable_encoder(dict(project)),
        "projects": [jsonable_encoder(dict(row)) for row in projects],
    }


async def update_project_foundation(user_id: str, project_id: str, foundation_json: dict):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
        if not project:
            raise NotFoundError("Not found")
        foundation_json = _sanitize_foundation_for_project(project["project_type"], foundation_json)
        changed = await foundation_repo.update_foundation(conn, project_id, foundation_json)
        if changed and project["project_type"] == "networking":
            await _refresh_networking_match_profile(conn, project_id, foundation_json)
    return {"ok": True}


async def get_foundation_view(user_id: str, project_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
        if not project:
            raise NotFoundError("Not found")
        foundation = await foundation_repo.get_latest_foundation(conn, project_id)
        intake = await intake_repo.get_intake(conn, project_id)

    raw_conversation = intake["conversation"] if intake and intake["conversation"] else []
    conversation = json.loads(raw_conversation) if isinstance(raw_conversation, str) else raw_conversation

    raw_foundation = foundation["foundation_json"] if foundation and foundation["foundation_json"] else None
    if isinstance(raw_foundation, str):
        raw_foundation = json.loads(raw_foundation)
    raw_foundation = _sanitize_foundation_for_project(project["project_type"], raw_foundation)

    return {
        "project": jsonable_encoder(dict(project)),
        "foundation": jsonable_encoder(raw_foundation) if raw_foundation else None,
        "intakeStatus": project["intake_status"] or "not_started",
        "conversation": jsonable_encoder(conversation),
    }
