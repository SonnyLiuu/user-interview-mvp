from __future__ import annotations

from pydantic import BaseModel

from .projects import ProjectRecord


class ChatMessage(BaseModel):
    role: str
    content: str
    messageType: str | None = None


class ProjectBrief(BaseModel):
    id: str
    project_id: str
    idea_summary: str | None = None
    strengths: list[str] | None = None
    weaknesses: list[str] | None = None
    most_promising_avenues: list[str] | None = None
    recommended_conversations: list[dict] | None = None
    assumptions: list[dict] | None = None
    is_current: bool | None = None


class FoundationViewResponse(BaseModel):
    project: ProjectRecord
    foundation: dict | None = None
    brief: ProjectBrief | None = None
    intakeStatus: str
    conversation: list[ChatMessage]
