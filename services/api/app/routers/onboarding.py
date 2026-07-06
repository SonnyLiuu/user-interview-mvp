from __future__ import annotations

from fastapi import APIRouter, Depends

from ..core.auth import AuthContext, get_auth_context
from ..schemas import OnboardingChatRequest, OnboardingChatResponse
from ..services.onboarding import process_onboarding_request, save_startup_profile

router = APIRouter(prefix="/v1/projects/{project_id}/onboarding", tags=["onboarding"])


@router.post("/chat", response_model=OnboardingChatResponse)
async def onboarding_chat(project_id: str, body: OnboardingChatRequest, auth: AuthContext = Depends(get_auth_context)):
    return await process_onboarding_request(auth.user_id, project_id, body)


@router.post("/profile")
async def save_profile(project_id: str, body: dict, auth: AuthContext = Depends(get_auth_context)):
    return await save_startup_profile(
        auth.user_id,
        project_id,
        body.get("startupStage", ""),
        body.get("entryGoal", ""),
    )
