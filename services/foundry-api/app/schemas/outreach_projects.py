from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


OutreachProjectType = Literal[
    "information_discovery",
    "customer_acquisition",
    "beta_users",
    "investor",
    "partnership",
    "recruiting",
    "advisor",
    "press_creator",
]

OutreachProjectStatus = Literal[
    "draft",
    "onboarding",
    "active",
    "paused",
    "completed",
    "archived",
]


class OutreachProjectRecord(BaseModel):
    id: str
    startup_project_id: str
    type: OutreachProjectType
    name: str
    status: OutreachProjectStatus
    brief_json: dict[str, Any] | None = None
    onboarding_state_json: dict[str, Any] | None = None
    created_at: Any | None = None
    updated_at: Any | None = None


class CreateOutreachProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: OutreachProjectType = "information_discovery"
    name: str | None = Field(default=None, max_length=120)


class UpdateOutreachProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=120)
    status: OutreachProjectStatus | None = None
    brief_json: dict[str, Any] | None = None
    onboarding_state_json: dict[str, Any] | None = None
