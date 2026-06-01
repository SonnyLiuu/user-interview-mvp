from __future__ import annotations

from pydantic import BaseModel, Field


class LiveSessionStartRequest(BaseModel):
    person_id: str = Field(alias="personId")
    capture_provider: str = Field(default="desktop_audio", alias="captureProvider")
    zoom_meeting_identifier: str | None = Field(default=None, alias="zoomMeetingIdentifier")
    meeting_url: str | None = Field(default=None, alias="meetingUrl")


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


class LiveTranscriptTurn(BaseModel):
    speaker: str
    source: str
    text: str
    external_turn_id: str | None = Field(default=None, alias="externalTurnId")
    created_at: str = Field(alias="createdAt")


class LiveTranscriptTurnRequest(BaseModel):
    source: str = "external"
    speaker: str | None = None
    text: str
    external_turn_id: str | None = Field(default=None, alias="externalTurnId")


class LiveTranscriptTurnResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    turn: LiveTranscriptTurn
    transcript_raw: str = Field(alias="transcriptRaw")


class LiveTopicOverrideRequest(BaseModel):
    checked: bool


class LiveTopicOverrideResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    topic: LiveTopic
    event: LiveSessionEvent


class LiveSessionResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    person_id: str = Field(alias="personId")
    person_name: str = Field(alias="personName")
    status: str
    capture_provider: str = Field(alias="captureProvider")
    audio_capture_enabled: bool = Field(alias="audioCaptureEnabled")
    zoom_meeting_identifier: str | None = Field(default=None, alias="zoomMeetingIdentifier")
    live_token: str = Field(alias="liveToken")
    topics: list[LiveTopic]
    started_at: str = Field(alias="startedAt")
    realtime_status: str = Field(default="pending", alias="realtimeStatus")
    realtime_error: str | None = Field(default=None, alias="realtimeError")
    transcript_turns: list[LiveTranscriptTurn] = Field(default_factory=list, alias="transcriptTurns")
    transcript_raw: str = Field(default="", alias="transcriptRaw")
    events: list[LiveSessionEvent] = Field(default_factory=list)


class LiveSessionStateResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    person_id: str = Field(alias="personId")
    person_name: str = Field(alias="personName")
    status: str
    capture_provider: str = Field(alias="captureProvider")
    audio_capture_enabled: bool = Field(alias="audioCaptureEnabled")
    zoom_meeting_identifier: str | None = Field(default=None, alias="zoomMeetingIdentifier")
    topics: list[LiveTopic]
    started_at: str = Field(alias="startedAt")
    ended_at: str | None = Field(default=None, alias="endedAt")
    realtime_status: str = Field(default="pending", alias="realtimeStatus")
    realtime_error: str | None = Field(default=None, alias="realtimeError")
    transcript_turns: list[LiveTranscriptTurn] = Field(default_factory=list, alias="transcriptTurns")
    transcript_raw: str = Field(default="", alias="transcriptRaw")
    events: list[LiveSessionEvent] = Field(default_factory=list)


class LiveSessionEndResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    status: str
    ended_at: str = Field(alias="endedAt")


class TranscriptUploadResponse(BaseModel):
    session_id: str = Field(alias="sessionId")
    turns_ingested: int = Field(alias="turnsIngested")
    turns: list[LiveTranscriptTurn] = Field(default_factory=list)
