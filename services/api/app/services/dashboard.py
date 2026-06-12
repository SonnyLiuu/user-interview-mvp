from __future__ import annotations

from fastapi.encoders import jsonable_encoder

from ..db import get_pool
from ..repositories import projects as project_repo


async def get_latest_project_for_user(user_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_latest_project(conn, user_id)

    return {
        "project": jsonable_encoder(dict(project)) if project else None,
    }
