from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


SlotKey = Literal[
    "ideaSummary",
    "targetUser",
    "painPoint",
    "valueProp",
    "idealPeopleTypes",
    "differentiation",
    "outreachGoal",
    "recipients",
    "senderContext",
    "sharedContext",
    "desiredOutcome",
    "requiredMentions",
    "optionalMentions",
    "personalizationStrategy",
    "tone",
    "messageBoundaries",
    "channelFormat",
]


class OnboardingMessage(BaseModel):
    role: Literal["assistant", "user"]
    content: str
    messageType: str | None = None


class OnboardingChoice(BaseModel):
    id: str
    label: str
    normalizedValue: str
    slotKey: SlotKey


class OnboardingTurn(BaseModel):
    targetSlot: SlotKey
    question: str
    choices: list[OnboardingChoice]
    customPlaceholder: str


class OnboardingChatResponse(BaseModel):
    messages: list[OnboardingMessage]
    currentTurn: OnboardingTurn | None
    isFinishable: bool
    sessionStatus: Literal["active", "ready", "completed"]
