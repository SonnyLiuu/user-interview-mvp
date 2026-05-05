from __future__ import annotations

from pydantic import BaseModel

from .projects import ProjectRecord


class ChatMessage(BaseModel):
    role: str
    content: str
    messageType: str | None = None


class FoundationViewResponse(BaseModel):
    project: ProjectRecord
    foundation: dict | None = None
    intakeStatus: str
    conversation: list[ChatMessage]
