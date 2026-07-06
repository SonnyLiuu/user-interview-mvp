from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ..core.auth import AuthContext, get_auth_context
from ..core.config import Settings, get_settings
from ..core.errors import UnauthorizedError
from ..schemas.desktop import DesktopEndSessionRequest, DevAuthRequest, LaunchTokenRequest
from ..services import desktop as desktop_service

router = APIRouter(prefix="/v1/desktop", tags=["desktop"])


@router.post("/auth/dev-token")
async def create_dev_desktop_token(
    body: DevAuthRequest,
    settings: Settings = Depends(get_settings),
):
    if not settings.desktop_dev_auth_enabled:
        raise UnauthorizedError("Desktop dev auth is disabled")
    return await desktop_service.create_dev_desktop_token(body.email, body.name, settings)


@router.get("/people")
async def list_desktop_people(
    startup_id: str | None = Query(default=None, alias="startupId"),
    project_id: str | None = Query(default=None, alias="projectId"),
    auth: AuthContext = Depends(get_auth_context),
):
    return await desktop_service.list_desktop_people(
        auth.user_id,
        startup_id=startup_id,
        project_id=project_id,
    )


@router.post("/launch-token")
async def create_launch_token(
    body: LaunchTokenRequest,
    auth: AuthContext = Depends(get_auth_context),
    settings: Settings = Depends(get_settings),
):
    return await desktop_service.create_launch_token(
        auth.user_id,
        auth.clerk_user_id,
        body.person_id,
        settings,
        zoom_meeting_identifier=body.zoom_meeting_identifier,
    )


@router.post("/sessions/end")
async def save_desktop_session(
    body: DesktopEndSessionRequest,
    auth: AuthContext = Depends(get_auth_context),
):
    return await desktop_service.save_desktop_session(auth.user_id, body)
