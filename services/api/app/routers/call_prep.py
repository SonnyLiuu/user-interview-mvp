from __future__ import annotations

from fastapi import APIRouter, Depends

from ..core.auth import AuthContext, get_auth_context
from ..services.call_prep import get_call_brief, refresh_call_brief

router = APIRouter(prefix="/v1/people/{person_id}/call-brief", tags=["call-prep"])


@router.get("")
async def read_call_brief(person_id: str, auth: AuthContext = Depends(get_auth_context)):
    return await get_call_brief(auth.user_id, person_id)


@router.post("/refresh")
async def regenerate_call_brief(person_id: str, auth: AuthContext = Depends(get_auth_context)):
    return await refresh_call_brief(auth.user_id, person_id)

