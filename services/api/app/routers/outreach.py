from __future__ import annotations

from fastapi import APIRouter, Depends

from ..core.auth import AuthContext, get_auth_context
from ..services.outreach import refresh_outreach

router = APIRouter(prefix="/v1/people/{person_id}/outreach", tags=["outreach"])


@router.post("/refresh")
async def regenerate_outreach(person_id: str, auth: AuthContext = Depends(get_auth_context)):
    return await refresh_outreach(auth.user_id, person_id)
