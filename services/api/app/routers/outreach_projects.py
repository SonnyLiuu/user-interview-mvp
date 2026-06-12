from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from ..auth import AuthContext, get_auth_context
from ..schemas.outreach_projects import (
    CreateOutreachProjectRequest,
    OutreachProjectRecord,
    UpdateOutreachProjectRequest,
)
from ..schemas.onboarding import OnboardingChatRequest, OnboardingChatResponse
from ..services.outreach_projects import (
    create_or_open_outreach_project,
    get_outreach_project_for_user,
    list_outreach_projects_for_startup,
    process_idea_validation_onboarding,
    stream_outreach_project_office_hours,
    update_outreach_project_for_user,
)

router = APIRouter(tags=["outreach-projects"])


@router.get("/v1/projects/{startup_project_id}/outreach-projects", response_model=list[OutreachProjectRecord])
async def list_outreach_projects(startup_project_id: str, auth: AuthContext = Depends(get_auth_context)):
    return await list_outreach_projects_for_startup(auth.user_id, startup_project_id)


@router.post("/v1/projects/{startup_project_id}/outreach-projects", response_model=OutreachProjectRecord)
async def create_outreach_project(
    startup_project_id: str,
    body: CreateOutreachProjectRequest,
    auth: AuthContext = Depends(get_auth_context),
):
    return await create_or_open_outreach_project(auth.user_id, startup_project_id, body)


@router.get("/v1/outreach-projects/{outreach_project_id}", response_model=OutreachProjectRecord)
async def get_outreach_project(outreach_project_id: str, auth: AuthContext = Depends(get_auth_context)):
    return await get_outreach_project_for_user(auth.user_id, outreach_project_id)


@router.patch("/v1/outreach-projects/{outreach_project_id}", response_model=OutreachProjectRecord)
async def update_outreach_project(
    outreach_project_id: str,
    body: UpdateOutreachProjectRequest,
    auth: AuthContext = Depends(get_auth_context),
):
    return await update_outreach_project_for_user(auth.user_id, outreach_project_id, body)


@router.post("/v1/outreach-projects/{outreach_project_id}/onboarding/chat", response_model=OnboardingChatResponse)
async def outreach_project_onboarding_chat(
    outreach_project_id: str,
    body: OnboardingChatRequest,
    auth: AuthContext = Depends(get_auth_context),
):
    return await process_idea_validation_onboarding(auth.user_id, outreach_project_id, body)


@router.post("/v1/outreach-projects/{outreach_project_id}/office-hours/chat")
async def outreach_project_office_hours_chat(
    outreach_project_id: str,
    body: dict,
    auth: AuthContext = Depends(get_auth_context),
):
    message = body.get("message", "")
    recent_messages = body.get("recentMessages") or []
    stream = stream_outreach_project_office_hours(auth.user_id, outreach_project_id, message, recent_messages)
    return StreamingResponse(stream, media_type="text/plain; charset=utf-8")
