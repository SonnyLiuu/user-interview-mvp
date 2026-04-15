from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import AuthContext, get_auth_context
from ..services import projects as project_service

router = APIRouter(prefix="/v1/projects", tags=["projects"])


@router.get("")
async def list_projects(auth: AuthContext = Depends(get_auth_context)):
    return await project_service.list_projects_for_user(auth.user_id)


@router.post("")
async def create_project(body: dict, auth: AuthContext = Depends(get_auth_context)):
    return await project_service.create_project_for_user(auth.user_id, body.get("name", ""))


@router.get("/{project_id}")
async def get_project(project_id: str, auth: AuthContext = Depends(get_auth_context)):
    return await project_service.get_project_payload(auth.user_id, project_id)


@router.put("/{project_id}")
@router.patch("/{project_id}")
async def update_project(project_id: str, body: dict, auth: AuthContext = Depends(get_auth_context)):
    return await project_service.update_project_for_user(auth.user_id, project_id, body)


@router.delete("/{project_id}")
async def delete_project(project_id: str, auth: AuthContext = Depends(get_auth_context)):
    return await project_service.delete_project_for_user(auth.user_id, project_id)
