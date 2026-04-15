from __future__ import annotations

from fastapi import BackgroundTasks
from fastapi.encoders import jsonable_encoder

from ..ai import generate_brief
from ..db import get_pool
from ..repositories import briefs as brief_repo
from ..repositories import intake as intake_repo
from ..repositories import projects as project_repo


async def get_brief_state(user_id: str, project_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
        if not project:
            return None
        brief = await brief_repo.get_current_brief(conn, project_id)
    return {
        "brief": jsonable_encoder(dict(brief)) if brief else None,
        "status": project["intake_status"] or "not_started",
    }


async def schedule_brief_generation(user_id: str, project_id: str, background_tasks: BackgroundTasks):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
        if not project:
            return None
        await project_repo.update_project(conn, project_id, intake_status="generating")
    background_tasks.add_task(generate_brief_for_project, project_id)
    return {"ok": True, "status": "generating"}


async def generate_brief_for_project(project_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        intake = await intake_repo.get_intake(conn, project_id)
        if not intake:
            await project_repo.update_project(conn, project_id, intake_status="generation_failed")
            return
        intake_payload = dict(intake)

    try:
        brief = await generate_brief(intake_payload)
        async with pool.acquire() as conn:
            async with conn.transaction():
                await brief_repo.create_brief(conn, project_id, brief)
                await project_repo.update_project(conn, project_id, intake_status="complete")
    except Exception:
        async with pool.acquire() as conn:
            await project_repo.update_project(conn, project_id, intake_status="generation_failed")
