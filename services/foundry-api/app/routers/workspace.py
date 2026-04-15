from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import AuthContext, get_auth_context
from ..schemas import FoundationViewResponse, ProjectLookupResponse, WorkspaceSummaryResponse
from ..services.workspace import get_foundation_view, get_project_lookup, get_workspace_summary, update_project_foundation

router = APIRouter(tags=["workspace"])


@router.get("/v1/projects/by-slug/{slug_or_id}", response_model=ProjectLookupResponse)
async def project_by_slug(slug_or_id: str, auth: AuthContext = Depends(get_auth_context)):
    return await get_project_lookup(auth.user_id, slug_or_id)


@router.get("/v1/projects/{project_id}/workspace-summary", response_model=WorkspaceSummaryResponse)
async def workspace_summary(project_id: str, auth: AuthContext = Depends(get_auth_context)):
    return await get_workspace_summary(auth.user_id, project_id)


@router.get("/v1/projects/{project_id}/foundation-view", response_model=FoundationViewResponse)
async def foundation_view(project_id: str, auth: AuthContext = Depends(get_auth_context)):
    return await get_foundation_view(auth.user_id, project_id)


@router.patch("/v1/projects/{project_id}/foundation")
async def patch_foundation(project_id: str, body: dict, auth: AuthContext = Depends(get_auth_context)):
    return await update_project_foundation(auth.user_id, project_id, body)
