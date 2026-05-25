from __future__ import annotations

PROJECT_TYPE_STARTUP = "startup"
PROJECT_TYPE_NETWORKING = "networking"
PROJECT_TYPES = {PROJECT_TYPE_STARTUP, PROJECT_TYPE_NETWORKING}


def normalize_project_type(value: str | None) -> str:
    project_type = (value or PROJECT_TYPE_STARTUP).strip().lower()
    return project_type if project_type in PROJECT_TYPES else PROJECT_TYPE_STARTUP


def is_valid_project_type(value: str | None) -> bool:
    return (value or PROJECT_TYPE_STARTUP).strip().lower() in PROJECT_TYPES


def project_actor(project_type: str) -> str:
    return "user" if normalize_project_type(project_type) == PROJECT_TYPE_NETWORKING else "founder"


def project_kind_label(project_type: str) -> str:
    return "networking outreach project" if normalize_project_type(project_type) == PROJECT_TYPE_NETWORKING else "startup idea"


def get_kickoff_question(project_type: str) -> str:
    if normalize_project_type(project_type) == PROJECT_TYPE_NETWORKING:
        return (
            "What is this outreach project about? Tell me who you want to contact, "
            "what context every message should include, and what you hope happens next."
        )
    return "What are you building? Tell me about your idea - what it does, who it's for, and what problem it solves."


def get_slot_context(project_type: str) -> dict[str, str]:
    if normalize_project_type(project_type) == PROJECT_TYPE_NETWORKING:
        return {
            "ideaSummary": "the outreach campaign context and goal",
            "targetUser": "who the intended recipients are",
            "painPoint": "the timely reason or shared context for reaching out",
            "valueProp": "the core message, ask, or outcome the sender wants",
            "idealPeopleTypes": "the types of people who should be contacted first",
            "differentiation": "the sender's credibility hook or personal connection",
            "disqualifiers": "people who should be excluded from this outreach project",
        }
    return {
        "ideaSummary": "what the founder is building and for whom",
        "targetUser": "who the primary user is - the person who experiences the problem",
        "painPoint": "the core pain or problem the product addresses",
        "valueProp": "what specific value the product delivers to users",
        "idealPeopleTypes": "the types of people who would be ideal early users or customers",
        "differentiation": "what makes this different from existing solutions",
        "disqualifiers": "who would NOT be a good fit for this product",
    }
