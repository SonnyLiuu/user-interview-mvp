from __future__ import annotations

from pydantic import BaseModel


class ProjectNavItem(BaseModel):
    id: str
    name: str
    slug: str | None = None


class ProjectRecord(ProjectNavItem):
    intake_status: str | None = None
    is_archived: bool | None = None


class LatestProjectResponse(BaseModel):
    project: ProjectNavItem | None


class ProjectLookupResponse(BaseModel):
    project: ProjectRecord
    foundationExists: bool


class WorkspaceSummaryResponse(BaseModel):
    project: ProjectRecord
    projects: list[ProjectNavItem]
