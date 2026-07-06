from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone

from fastapi.encoders import jsonable_encoder

from ..core.db import get_pool
from ..core.errors import BadRequestError, NotFoundError
from ..domain.onboarding_engine import merge_slot_patch, normalize_onboarding_state
from ..domain.project_modes import OUTREACH_TYPE_IDEA_VALIDATION
from ..repositories import guest_onboarding as guest_repo
from ..repositories import onboarding as onboarding_repo
from ..repositories import outreach_projects as outreach_repo
from ..repositories import projects as project_repo
from ..core.utils import slugify

SESSION_TTL = timedelta(days=7)
IP_WINDOW = timedelta(days=1)
MAX_SESSIONS_PER_IP = 5
MAX_REQUESTS_PER_SESSION = 80

ENTRY_GOALS = {
    "pressure_test_idea",
    "find_interviewees",
    "write_outreach",
    "prepare_conversation",
    "analyze_notes",
    "find_early_users",
    "exploring",
}

GOAL_BOTTLENECKS = {
    "pressure_test_idea": "Needs to pressure-test the idea and identify the riskiest assumptions",
    "find_interviewees": "Needs to identify the right people to interview first",
    "write_outreach": "Needs to write relevant outreach that earns responses",
    "prepare_conversation": "Needs to prepare for useful customer-discovery conversations",
    "analyze_notes": "Needs to turn interview notes into evidence and decisions",
    "find_early_users": "Needs to find early users or design partners",
    "exploring": "Needs to clarify the most useful first learning step",
}


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _profile(raw) -> dict:
    return raw if isinstance(raw, dict) else {}


def _foundation(raw) -> dict:
    return raw if isinstance(raw, dict) else {}


async def _active_claim(conn, token: str, *, for_update: bool = False, count_request: bool = True):
    claim = await guest_repo.find_by_token_hash(conn, _hash(token), for_update=for_update)
    if not claim:
        raise NotFoundError("Guest session not found")
    if claim["status"] != "active":
        raise BadRequestError("This guest session is no longer active", code="guest_session_inactive")
    if claim["expires_at"] <= datetime.now(timezone.utc):
        raise BadRequestError("This guest session has expired", code="guest_session_expired")
    if claim["request_count"] >= MAX_REQUESTS_PER_SESSION:
        raise BadRequestError("This guest session has reached its request limit", code="guest_session_limited")
    if count_request:
        claim = await guest_repo.increment_requests(conn, claim["id"])
    project = await project_repo.find_unowned_project(conn, claim["project_id"])
    if not project:
        raise NotFoundError("Guest project not found")
    return claim, project


async def create_or_resume_session(token: str, ip_address: str):
    token_hash = _hash(token)
    ip_hash = _hash(ip_address) if ip_address else None
    now = datetime.now(timezone.utc)
    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await guest_repo.find_by_token_hash(conn, token_hash)
        if existing:
            claim, project = await _active_claim(conn, token)
            return await _status_payload(conn, claim, project)

        if ip_hash:
            recent = await guest_repo.count_recent_for_ip(conn, ip_hash, now - IP_WINDOW)
            if recent >= MAX_SESSIONS_PER_IP:
                raise BadRequestError("Too many guest sessions were created recently", code="guest_ip_limited")

        async with conn.transaction():
            project = await project_repo.create_project(conn, None, "Untitled startup", None, "startup")
            await project_repo.create_empty_intake(conn, project["id"])
            claim = await guest_repo.create_claim(
                conn,
                project["id"],
                token_hash,
                ip_hash,
                now + SESSION_TTL,
            )
    return {
        "projectId": str(project["id"]),
        "profile": {},
        "sessionStatus": "new",
        "hasFoundation": False,
        "expiresAt": claim["expires_at"].isoformat(),
    }


async def _status_payload(conn, claim, project):
    session = await onboarding_repo.get_session(conn, project["id"])
    foundation_row = await onboarding_repo.get_latest_foundation(conn, project["id"])
    return {
        "projectId": str(project["id"]),
        "profile": _profile(claim["profile_json"]),
        "sessionStatus": session["status"] if session else "new",
        "hasFoundation": foundation_row is not None,
        "expiresAt": claim["expires_at"].isoformat(),
    }


async def get_session_status(token: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        claim, project = await _active_claim(conn, token)
        return await _status_payload(conn, claim, project)


async def save_profile(token: str, startup_stage: str, entry_goal: str):
    stage = (startup_stage or "").strip()[:80]
    if not stage:
        raise BadRequestError("Startup stage is required")
    if entry_goal not in ENTRY_GOALS:
        raise BadRequestError("Invalid entry goal")

    pool = get_pool()
    async with pool.acquire() as conn:
        claim, project = await _active_claim(conn, token)
        state_row = await onboarding_repo.get_state_row(conn, project["id"])
        state = normalize_onboarding_state(
            state_row["state_json"] if state_row and state_row["state_json"] else None,
            "startup",
        )
        state = merge_slot_patch(state, "startupStage", stage, "solid", "startup")
        state = merge_slot_patch(state, "biggestBottleneck", GOAL_BOTTLENECKS[entry_goal], "solid", "startup")
        profile = {"startupStage": stage, "entryGoal": entry_goal}
        async with conn.transaction():
            await onboarding_repo.save_state(conn, project["id"], state)
            await guest_repo.update_profile(conn, claim["id"], profile)
    return {"profile": profile}


async def get_project_for_token(token: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        claim, project = await _active_claim(conn, token)
    return claim, project


async def get_foundation_preview(token: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        _claim, project = await _active_claim(conn, token)
        row = await onboarding_repo.get_latest_foundation(conn, project["id"])
        if not row:
            raise BadRequestError("Foundation is not ready", code="foundation_not_ready")
    return {"foundation": jsonable_encoder(_foundation(row["foundation_json"]))}


async def abandon_session(token: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        claim, project = await _active_claim(conn, token, for_update=True, count_request=False)
        async with conn.transaction():
            await guest_repo.abandon(conn, claim["id"])
            await project_repo.update_project(conn, project["id"], is_archived=True)
    return {"ok": True}


async def _unique_slug(conn, user_id: str, name: str) -> str:
    base = slugify(name) or "startup"
    candidate = base
    suffix = 2
    while await project_repo.find_duplicate_slug(conn, user_id, candidate):
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def _goal_brief(foundation: dict, goal: str) -> dict:
    target_people = foundation.get("idealPeopleTypes") or []
    assumptions = foundation.get("keyAssumptions") or []
    summary = foundation.get("summary") or foundation.get("painPoint") or "the startup idea"
    target_user = foundation.get("targetUser") or "potential users"
    goal_copy = {
        "pressure_test_idea": (
            "Pressure-test the riskiest parts of the idea",
            ["Understand whether the problem is urgent", "Test the assumptions most likely to break the idea"],
            "Ask for concrete past behavior and current workarounds before describing the solution.",
        ),
        "find_interviewees": (
            "Find and interview the people who can teach you the most",
            ["Identify high-learning interview profiles", "Learn which segment feels the problem most strongly"],
            "Prioritize people with direct, recent experience of the problem.",
        ),
        "write_outreach": (
            "Earn replies from relevant potential interviewees",
            ["Understand what makes the request relevant", "Create a credible, low-friction interview ask"],
            "Lead with why their perspective matters and make a small learning-oriented ask.",
        ),
        "prepare_conversation": (
            "Prepare customer-discovery conversations that produce evidence",
            ["Ask about real behavior instead of opinions", "Recognize strong and weak problem signals"],
            "Use open prompts, follow the story, and avoid pitching during discovery.",
        ),
        "analyze_notes": (
            "Turn interview notes into evidence for the next decision",
            ["Separate observations from interpretations", "Track which assumptions are strengthening or weakening"],
            "Capture concrete examples, contradictions, and unresolved questions after every conversation.",
        ),
        "find_early_users": (
            "Find early users or design partners with strong problem urgency",
            ["Identify people motivated to try a new approach", "Learn what an early commitment would require"],
            "Look for active workarounds, urgency, and willingness to invest time—not compliments.",
        ),
        "exploring": (
            "Clarify the most useful first learning step",
            ["Understand the problem and who experiences it", "Choose the next assumption worth testing"],
            "Start with a small number of curious, learning-oriented conversations.",
        ),
    }
    desired, learning_goals, guidance = goal_copy[goal]
    return {
        "type": "idea_validation",
        "label": "Idea Validation",
        "desiredOutcome": desired,
        "learningGoals": learning_goals,
        "targetPeople": target_people or [target_user],
        "assumptionsToTest": assumptions or [
            f"{target_user} experiences the problem described in {summary}",
            "The current workaround creates enough friction to motivate change",
        ],
        "conversationBoundaries": ["Learn before pitching", "Ask about specific past behavior"],
        "outreachGuidance": guidance,
        "starterAsk": "Would you be open to a short conversation about how you handle this today?",
    }


def _destination(slug: str, outreach_id: str, goal: str) -> str:
    if goal in {"pressure_test_idea", "exploring"}:
        return f"/dashboard/{slug}/foundation?welcome=1"
    if goal == "analyze_notes":
        return f"/dashboard/{slug}/insights?welcome=1"
    return f"/dashboard/{slug}/people?outreachProjectId={outreach_id}&welcome=1"


async def claim_session(user_id: str, token: str):
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            claim = await guest_repo.find_by_token_hash(conn, _hash(token), for_update=True)
            if not claim:
                raise NotFoundError("Guest session not found")
            if claim["status"] == "claimed":
                if str(claim["claimed_by_user_id"]) != str(user_id):
                    raise BadRequestError("This work was already claimed by another account", code="already_claimed")
                project = await conn.fetchrow("select * from projects where id = $1", claim["project_id"])
                outreach = await outreach_repo.find_non_archived_by_type(
                    conn, project["id"], OUTREACH_TYPE_IDEA_VALIDATION
                )
                return {
                    "projectId": str(project["id"]),
                    "destination": _destination(project["slug"], str(outreach["id"]), project["entry_goal"]),
                }
            if claim["status"] != "active" or claim["expires_at"] <= datetime.now(timezone.utc):
                raise BadRequestError("This guest session is no longer available", code="guest_session_expired")

            project = await project_repo.find_unowned_project(conn, claim["project_id"])
            foundation_row = await onboarding_repo.get_latest_foundation(conn, project["id"]) if project else None
            if not project or not foundation_row:
                raise BadRequestError("Complete the startup foundation before signing in", code="foundation_not_ready")

            profile = _profile(claim["profile_json"])
            goal = profile.get("entryGoal") if profile.get("entryGoal") in ENTRY_GOALS else "exploring"
            foundation = _foundation(foundation_row["foundation_json"])
            raw_name = foundation.get("startupName")
            name = raw_name.strip()[:120] if isinstance(raw_name, str) and raw_name.strip() else "Untitled startup"
            slug = await _unique_slug(conn, user_id, name)
            await project_repo.update_project(
                conn,
                project["id"],
                user_id=user_id,
                name=name,
                slug=slug,
                entry_goal=goal,
                intake_status="complete",
            )
            outreach = await outreach_repo.create_outreach_project(
                conn,
                project["id"],
                OUTREACH_TYPE_IDEA_VALIDATION,
                "Idea Validation",
                "active",
            )
            await outreach_repo.update_outreach_project(
                conn,
                outreach["id"],
                brief_json=_goal_brief(foundation, goal),
                onboarding_state_json={"status": "completed", "source": "guest_onboarding"},
            )
            await guest_repo.mark_claimed(conn, claim["id"], user_id)

    return {
        "projectId": str(project["id"]),
        "destination": _destination(slug, str(outreach["id"]), goal),
    }
