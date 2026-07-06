from __future__ import annotations

import hashlib
from datetime import datetime, timezone

from ..core.auth import sign_desktop_auth_token, sign_desktop_launch_token
from ..core.config import Settings
from ..core.db import get_pool
from ..core.errors import BadRequestError
from ..schemas.desktop import DesktopEndSessionRequest, DesktopTopicInput
from .live_sessions import get_live_session


def _dev_clerk_user_id(email: str) -> str:
    digest = hashlib.sha256(email.lower().encode("utf-8")).hexdigest()[:24]
    return f"desktop-dev:{digest}"


def _parse_iso(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def _clean_transcript(value: str | None) -> str:
    return (value or "").strip()


def _notes_from_topics(topics: list[DesktopTopicInput], notes_raw: str) -> str:
    checked = [topic.label.strip() for topic in topics if topic.checked and topic.label.strip()]
    unchecked = [topic.label.strip() for topic in topics if not topic.checked and topic.label.strip()]
    parts = [
        "Checked topics:",
        "\n".join(f"- {label}" for label in checked) if checked else "- None",
        "",
        "Unchecked topics:",
        "\n".join(f"- {label}" for label in unchecked) if unchecked else "- None",
    ]
    user_notes = notes_raw.strip()
    if user_notes:
        parts.extend(["", "Notes:", user_notes])
    return "\n".join(parts)


async def _owned_person(conn, user_id: str, person_id: str):
    return await conn.fetchrow(
        """
        select
            p.*,
            projects.id as project_id,
            projects.name as project_name,
            projects.slug as project_slug
        from people p
        inner join projects on p.project_id = projects.id
        where p.id = $1
          and projects.user_id = $2
          and projects.is_archived = false
        limit 1
        """,
        person_id,
        user_id,
    )


async def create_dev_desktop_token(email: str, name: str | None, settings: Settings) -> dict:
    email = email.strip().lower()
    if not email or "@" not in email:
        raise BadRequestError("Valid email required")

    resolved_name = name.strip() if name else email
    clerk_user_id = _dev_clerk_user_id(email)
    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            """
            select id, clerk_user_id
            from users
            where email = $1
            limit 1
            """,
            email,
        )
        if existing:
            clerk_user_id = existing["clerk_user_id"] or clerk_user_id
            if not existing["clerk_user_id"]:
                await conn.execute(
                    """
                    update users
                    set clerk_user_id = $1, name = coalesce(name, $2)
                    where id = $3
                    """,
                    clerk_user_id,
                    resolved_name,
                    existing["id"],
                )
        else:
            await conn.execute(
                """
                insert into users (clerk_user_id, email, name, avatar_url)
                values ($1, $2, $3, '')
                """,
                clerk_user_id,
                email,
                resolved_name,
            )

    return sign_desktop_auth_token(clerk_user_id, settings.backend_shared_secret)


async def list_desktop_people(
    user_id: str,
    *,
    startup_id: str | None = None,
    project_id: str | None = None,
) -> list[dict]:
    startup_filter = startup_id.strip() if startup_id else None
    project_filter = project_id.strip() if project_id else None
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            select
                p.id,
                p.name,
                p.title,
                p.company,
                p.persona_type,
                p.analysis_status,
                p.board_status,
                p.updated_at,
                projects.id as startup_id,
                projects.name as startup_name,
                projects.slug as startup_slug,
                op.id as project_id,
                op.name as project_name,
                op.status as project_status
            from people p
            inner join projects on p.project_id = projects.id
            left join outreach_projects op on p.outreach_project_id = op.id
            where projects.user_id = $1
              and projects.is_archived = false
              and ($2::uuid is null or projects.id = $2::uuid)
              and ($3::uuid is null or op.id = $3::uuid)
            order by p.updated_at desc
            limit 100
            """,
            user_id,
            startup_filter,
            project_filter,
        )

    return [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "title": row["title"],
            "company": row["company"],
            "personaType": row["persona_type"],
            "analysisStatus": row["analysis_status"],
            "boardStatus": row["board_status"],
            "updatedAt": row["updated_at"].isoformat() if row["updated_at"] else None,
            "startupId": str(row["startup_id"]) if row["startup_id"] else None,
            "startupName": row["startup_name"],
            "startupSlug": row["startup_slug"],
            "projectId": str(row["project_id"]) if row["project_id"] else None,
            "projectName": row["project_name"],
            "projectSlug": None,
            "projectStatus": row["project_status"],
        }
        for row in rows
    ]


async def create_launch_token(
    user_id: str,
    clerk_user_id: str,
    person_id: str,
    settings: Settings,
    *,
    zoom_meeting_identifier: str | None = None,
) -> dict:
    person_id = person_id.strip()
    if not person_id:
        raise BadRequestError("personId required")
    pool = get_pool()
    async with pool.acquire() as conn:
        owned = await _owned_person(conn, user_id, person_id)
        if not owned:
            raise BadRequestError("Person not found")

    response = sign_desktop_launch_token(
        clerk_user_id,
        person_id,
        settings.backend_shared_secret,
        zoom_meeting_identifier=zoom_meeting_identifier,
    )
    response["zoomMeetingIdentifier"] = zoom_meeting_identifier
    return response


async def save_desktop_session(user_id: str, body: DesktopEndSessionRequest) -> dict:
    person_id = body.person_id.strip()
    if not person_id:
        raise BadRequestError("personId required")

    live_session_id = body.live_session_id.strip() if body.live_session_id else None
    live_token = body.live_token.strip() if body.live_token else None
    completed_at = _parse_iso(body.ended_at)
    topics = [topic for topic in body.topics if topic.label.strip()]
    notes_raw = _notes_from_topics(topics, body.notes_raw)

    has_submitted_transcript = body.transcript_raw is not None
    final_transcript_raw = _clean_transcript(body.transcript_raw)
    if live_session_id and live_token and (not has_submitted_transcript or not final_transcript_raw):
        try:
            snapshot = await get_live_session(live_session_id, live_token)
            final_transcript_raw = final_transcript_raw or _clean_transcript(snapshot.get("transcriptRaw"))
        except Exception:
            final_transcript_raw = final_transcript_raw or ""

    pool = get_pool()
    async with pool.acquire() as conn:
        owned = await _owned_person(conn, user_id, person_id)
        if not owned:
            raise BadRequestError("Person not found")

        if live_session_id:
            existing = await conn.fetchrow(
                """
                select *
                from interactions
                where live_session_id = $1
                limit 1
                """,
                live_session_id,
            )
            if existing:
                return {"ok": True, "interaction": dict(existing), "idempotent": True}

        created = await conn.fetchrow(
            """
            insert into interactions (
                person_id, outreach_project_id, live_session_id,
                type, notes_raw, transcript_raw, completed_at
            )
            values ($1, $2, $3, 'call', $4, $5, $6)
            returning *
            """,
            person_id,
            owned["outreach_project_id"],
            live_session_id,
            notes_raw,
            final_transcript_raw,
            completed_at,
        )

        await conn.execute(
            """
            update people
            set board_status = 'completed',
                outcome = 'successful_call',
                expires_at = null,
                updated_at = $2
            where id = $1
            """,
            person_id,
            completed_at,
        )

        transcript_content = final_transcript_raw or body.notes_raw.strip()
        if transcript_content:
            await conn.execute(
                """
                insert into transcripts (person_id, outreach_project_id, content, type)
                values ($1, $2, $3, 'call')
                """,
                person_id,
                owned["outreach_project_id"],
                transcript_content,
            )

        checked_topics = [topic for topic in topics if topic.checked]
        auto_checked_topics = [topic for topic in checked_topics if topic.checked_by == "gpt_realtime"]
        await conn.execute(
            """
            insert into person_events (person_id, type, metadata)
            values ($1, 'desktop_call_session_saved', $2::jsonb)
            """,
            person_id,
            {
                "interaction_id": str(created["id"]),
                "live_session_id": live_session_id,
                "started_at": body.started_at,
                "ended_at": completed_at.isoformat(),
                "topic_count": len(topics),
                "checked_count": len(checked_topics),
                "checked_labels": [topic.label for topic in checked_topics],
                "auto_checked_count": len(auto_checked_topics),
                "auto_checked_topics": [
                    {
                        "id": topic.id,
                        "label": topic.label,
                        "checked_at": topic.checked_at,
                        "evidence": topic.evidence,
                    }
                    for topic in auto_checked_topics
                ],
                "manual_override_count": len([topic for topic in topics if topic.manual_override]),
            },
        )

    return {"ok": True, "interaction": dict(created)}
