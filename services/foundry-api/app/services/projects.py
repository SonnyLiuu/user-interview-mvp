from __future__ import annotations

from fastapi.encoders import jsonable_encoder

from ..db import get_pool
from ..errors import BadRequestError, NotFoundError
from ..repositories import projects as project_repo
from ..utils import slugify


async def list_projects_for_user(user_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await project_repo.list_projects(conn, user_id)
    return [jsonable_encoder(dict(row)) for row in rows]


async def create_project_for_user(user_id: str, name: str):
    trimmed_name = (name or "").strip()
    if not trimmed_name:
        raise BadRequestError("Name is required")
    slug = slugify(trimmed_name)
    pool = get_pool()
    async with pool.acquire() as conn:
        duplicate = await project_repo.find_duplicate_slug(conn, user_id, slug)
        if duplicate:
            raise BadRequestError("You already have a project with this name")
        async with conn.transaction():
            project = await project_repo.create_project(conn, user_id, trimmed_name, slug)
            await project_repo.create_empty_intake(conn, project["id"])
    return jsonable_encoder(dict(project))


async def get_owned_project(user_id: str, project_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        project = await project_repo.find_owned_project(conn, user_id, project_id)
    if not project:
        raise NotFoundError("Not found")
    return project


async def get_project_payload(user_id: str, project_id: str):
    project = await get_owned_project(user_id, project_id)
    return jsonable_encoder(dict(project))


async def update_project_for_user(user_id: str, project_id: str, body: dict):
    project = await get_owned_project(user_id, project_id)
    updates: dict = {}
    if "slug" in body:
        raise BadRequestError("Project slugs are immutable")
    if "name" in body:
        trimmed = (body["name"] or "").strip()
        if not trimmed:
            raise BadRequestError("Name cannot be empty")
        updates["name"] = trimmed
    if "is_archived" in body:
        updates["is_archived"] = body["is_archived"]
    pool = get_pool()
    async with pool.acquire() as conn:
        updated = await project_repo.update_project(conn, project["id"], **updates)
    return jsonable_encoder(dict(updated))


async def delete_project_for_user(user_id: str, project_id: str):
    project = await get_owned_project(user_id, project_id)
    pool = get_pool()
    async with pool.acquire() as conn:
        await project_repo.delete_project(conn, project["id"])
    return {"ok": True}
