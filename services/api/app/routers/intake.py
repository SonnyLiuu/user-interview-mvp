from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from ..auth import AuthContext, get_auth_context
from ..services.intake import get_intake_payload, reset_conversation, stream_chat

router = APIRouter(prefix="/v1/projects/{project_id}/intake", tags=["intake"])


@router.get("")
async def get_intake(project_id: str, auth: AuthContext = Depends(get_auth_context)):
    return await get_intake_payload(auth.user_id, project_id)


@router.post("/chat")
async def intake_chat(project_id: str, body: dict, auth: AuthContext = Depends(get_auth_context)):
    message = body.get("message", "")
    recent_messages = body.get("recentMessages") or []
    conversation = body.get("conversation") or []
    stream = stream_chat(auth.user_id, project_id, message, recent_messages, conversation)
    return StreamingResponse(stream, media_type="text/plain; charset=utf-8")


@router.delete("/chat")
async def reset_intake_chat(project_id: str, auth: AuthContext = Depends(get_auth_context)):
    await reset_conversation(auth.user_id, project_id)
    return {"ok": True}
