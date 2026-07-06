from __future__ import annotations

from pydantic import BaseModel, Field


class DevAuthRequest(BaseModel):
    email: str
    name: str | None = None


class LaunchTokenRequest(BaseModel):
    person_id: str = Field(alias="personId")
    zoom_meeting_identifier: str | None = Field(default=None, alias="zoomMeetingIdentifier")


class DesktopTopicInput(BaseModel):
    id: str | None = None
    label: str
    checked: bool = False
    checked_by: str | None = Field(default=None, alias="checkedBy")
    checked_at: str | None = Field(default=None, alias="checkedAt")
    evidence: str | None = None
    manual_override: bool = Field(default=False, alias="manualOverride")


class DesktopEndSessionRequest(BaseModel):
    person_id: str = Field(alias="personId")
    started_at: str | None = Field(default=None, alias="startedAt")
    ended_at: str | None = Field(default=None, alias="endedAt")
    live_session_id: str | None = Field(default=None, alias="liveSessionId")
    live_token: str | None = Field(default=None, alias="liveToken")
    topics: list[DesktopTopicInput] = Field(default_factory=list)
    notes_raw: str = Field(default="", alias="notesRaw")
    transcript_raw: str | None = Field(default=None, alias="transcriptRaw")
