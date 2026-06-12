from __future__ import annotations

from typing import Annotated, Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field


SlotKey = Literal[
    "startupName",
    "ideaSummary",
    "targetUser",
    "painPoint",
    "valueProp",
    "idealPeopleTypes",
    "biggestBottleneck",
    "startupStage",
    "traction",
    "differentiation",
    "outreachGoal",
    "recipients",
    "senderContext",
    "sharedContext",
    "desiredOutcome",
    "learningGoals",
    "targetPeople",
    "assumptionsToTest",
    "conversationBoundaries",
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


class OnboardingInitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["__init__"]


class OnboardingKickoffRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["kickoff"]
    message: str


class OnboardingAnswerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["answer"]
    choiceIds: list[str] = Field(default_factory=list)
    customText: str | None = None


class OnboardingFinishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["finish"]


OnboardingChatRequest: TypeAlias = Annotated[
    OnboardingInitRequest | OnboardingKickoffRequest | OnboardingAnswerRequest | OnboardingFinishRequest,
    Field(discriminator="type"),
]
