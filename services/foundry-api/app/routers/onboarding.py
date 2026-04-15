from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import AuthContext, get_auth_context
from ..services.onboarding import process_onboarding_request

router = APIRouter(prefix="/v1/projects/{project_id}/onboarding", tags=["onboarding"])


@router.post("/chat")
async def onboarding_chat(project_id: str, body: dict, auth: AuthContext = Depends(get_auth_context)):
    return await process_onboarding_request(auth.user_id, project_id, body)
