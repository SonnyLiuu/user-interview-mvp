from __future__ import annotations

from pydantic import BaseModel, Field


class LiveSessionStartRequest(BaseModel):
    person_id: str = Field(alias="personId")


class LiveTopic(BaseModel):
    id: str
    label: str
    category: str
    checked: bool = False
    checked_by: str | None = Field(default=None, alias="checkedBy")
    checked_at: str | None = Field(default=None, alias="checkedAt")
    evidence: str | None = None
    manual_override: bool = Field(default=False, alias="manualOverride")


class LiveSessionEvent(BaseModel):
    id: str
    type: str
    created_at: str = Field(alias="createdAt")
    data: dict


class LiveSessionResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    person_id: str = Field(alias="personId")
    person_name: str = Field(alias="personName")
    status: str
    live_token: str = Field(alias="liveToken")
    topics: list[LiveTopic]
    started_at: str = Field(alias="startedAt")
    realtime_status: str = Field(default="pending", alias="realtimeStatus")
    realtime_error: str | None = Field(default=None, alias="realtimeError")
    events: list[LiveSessionEvent] = Field(default_factory=list)


class LiveSessionStateResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    person_id: str = Field(alias="personId")
    person_name: str = Field(alias="personName")
    status: str
    topics: list[LiveTopic]
    started_at: str = Field(alias="startedAt")
    ended_at: str | None = Field(default=None, alias="endedAt")
    realtime_status: str = Field(default="pending", alias="realtimeStatus")
    realtime_error: str | None = Field(default=None, alias="realtimeError")
    events: list[LiveSessionEvent] = Field(default_factory=list)


class LiveSessionEndResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    status: str
    ended_at: str = Field(alias="endedAt")
