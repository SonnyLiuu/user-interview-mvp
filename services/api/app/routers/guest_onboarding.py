from __future__ import annotations

from fastapi import APIRouter, Depends

from ..auth import AuthContext, GuestAuthContext, get_auth_context, get_guest_auth_context
from ..schemas import OnboardingChatRequest, OnboardingChatResponse
from ..services import guest_onboarding as guest_service
from ..services.onboarding import process_guest_onboarding_request

router = APIRouter(prefix="/v1/guest-onboarding", tags=["guest-onboarding"])


@router.post("/session")
async def create_session(guest: GuestAuthContext = Depends(get_guest_auth_context)):
    return await guest_service.create_or_resume_session(guest.token, guest.ip_address)


@router.get("/status")
async def session_status(guest: GuestAuthContext = Depends(get_guest_auth_context)):
    return await guest_service.get_session_status(guest.token)


@router.post("/profile")
async def save_profile(body: dict, guest: GuestAuthContext = Depends(get_guest_auth_context)):
    return await guest_service.save_profile(
        guest.token,
        body.get("startupStage", ""),
        body.get("entryGoal", ""),
    )


@router.post("/chat", response_model=OnboardingChatResponse)
async def onboarding_chat(
    body: OnboardingChatRequest,
    guest: GuestAuthContext = Depends(get_guest_auth_context),
):
    _claim, project = await guest_service.get_project_for_token(guest.token)
    return await process_guest_onboarding_request(str(project["id"]), body)


@router.get("/preview")
async def foundation_preview(guest: GuestAuthContext = Depends(get_guest_auth_context)):
    return await guest_service.get_foundation_preview(guest.token)


@router.delete("/session")
async def abandon_session(guest: GuestAuthContext = Depends(get_guest_auth_context)):
    return await guest_service.abandon_session(guest.token)


@router.post("/claim")
async def claim_session(body: dict, auth: AuthContext = Depends(get_auth_context)):
    return await guest_service.claim_session(auth.user_id, body.get("guestToken", ""))
