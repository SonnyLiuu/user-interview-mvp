from __future__ import annotations

import json

from fastapi.encoders import jsonable_encoder

from ..db import get_pool
from ..errors import NotFoundError
from ..repositories import briefs as brief_repo
from ..repositories import foundations as foundation_repo
from ..repositories import intake as intake_repo
from ..repositories import projects as project_repo


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
        await foundation_repo.update_foundation(conn, project_id, foundation_json)
    return {"ok": True}


async def get_foundation_view(user_id: str, project_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
        if not project:
            raise NotFoundError("Not found")
        foundation = await foundation_repo.get_latest_foundation(conn, project_id)
        brief = await brief_repo.get_current_brief(conn, project_id)
        intake = await intake_repo.get_intake(conn, project_id)

    raw_conversation = intake["conversation"] if intake and intake["conversation"] else []
    conversation = json.loads(raw_conversation) if isinstance(raw_conversation, str) else raw_conversation

    raw_foundation = foundation["foundation_json"] if foundation and foundation["foundation_json"] else None
    if isinstance(raw_foundation, str):
        raw_foundation = json.loads(raw_foundation)

    return {
        "project": jsonable_encoder(dict(project)),
        "foundation": jsonable_encoder(raw_foundation) if raw_foundation else None,
        "brief": jsonable_encoder(dict(brief)) if brief else None,
        "intakeStatus": project["intake_status"] or "not_started",
        "conversation": jsonable_encoder(conversation),
    }
