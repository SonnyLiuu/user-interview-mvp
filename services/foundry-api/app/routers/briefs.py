from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from ..auth import AuthContext, get_auth_context
from ..services.briefs import get_brief_state, schedule_brief_generation

router = APIRouter(prefix="/v1/projects/{project_id}/brief", tags=["briefs"])


@router.get("")
async def get_brief(project_id: str, auth: AuthContext = Depends(get_auth_context)):
    payload = await get_brief_state(auth.user_id, project_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Not found")
    return payload


@router.post("")
async def generate_brief(project_id: str, background_tasks: BackgroundTasks, auth: AuthContext = Depends(get_auth_context)):
    payload = await schedule_brief_generation(auth.user_id, project_id, background_tasks)
    if payload is None:
        raise HTTPException(status_code=404, detail="Not found")
    return payload


@router.post("/refresh")
async def refresh_brief(project_id: str, background_tasks: BackgroundTasks, auth: AuthContext = Depends(get_auth_context)):
    payload = await schedule_brief_generation(auth.user_id, project_id, background_tasks)
    if payload is None:
        raise HTTPException(status_code=404, detail="Not found")
    return payload
