from __future__ import annotations

from fastapi.encoders import jsonable_encoder

from ..db import get_pool
from ..errors import BadRequestError, NotFoundError
from ..project_modes import is_creatable_project_type, is_valid_project_type, normalize_project_type
from ..repositories import projects as project_repo
from ..utils import slugify


async def list_projects_for_user(user_id: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await project_repo.list_projects(conn, user_id)
    return [jsonable_encoder(dict(row)) for row in rows]


async def create_project_for_user(user_id: str, name: str, project_type: str | None = None, draft: bool = False):
    trimmed_name = (name or "").strip()
    if not trimmed_name and not draft:
        raise BadRequestError("Name is required")
    if not is_valid_project_type(project_type):
        raise BadRequestError("Invalid project type")
    normalized_type = normalize_project_type(project_type)
    if not is_creatable_project_type(normalized_type):
        raise BadRequestError("This project type is not available yet")
    project_name = trimmed_name or "Untitled startup"
    slug = None if draft and not trimmed_name else slugify(project_name)
    pool = get_pool()
    async with pool.acquire() as conn:
        duplicate = await project_repo.find_duplicate_slug(conn, user_id, slug) if slug else None
        if duplicate:
            raise BadRequestError("You already have a project with this name")
        async with conn.transaction():
            project = await project_repo.create_project(conn, user_id, project_name, slug, normalized_type)
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
        if project["slug"] is None:
            next_slug = slugify(trimmed)
            pool = get_pool()
            async with pool.acquire() as conn:
                duplicate = await project_repo.find_duplicate_slug(conn, user_id, next_slug)
            if duplicate and str(duplicate["id"]) != str(project["id"]):
                raise BadRequestError("You already have a project with this name")
            updates["slug"] = next_slug
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
