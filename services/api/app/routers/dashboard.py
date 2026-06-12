from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import AuthContext, get_auth_context
from ..schemas import LatestProjectResponse
from ..services.dashboard import get_latest_project_for_user

router = APIRouter(prefix="/v1/dashboard", tags=["dashboard"])


@router.get("/latest-project", response_model=LatestProjectResponse)
async def latest_project(auth: AuthContext = Depends(get_auth_context)):
    return await get_latest_project_for_user(auth.user_id)
