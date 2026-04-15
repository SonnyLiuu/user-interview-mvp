from __future__ import annotations


async def get_current_brief(conn, project_id: str):
    return await conn.fetchrow(
        """
        select *
        from project_briefs
        where project_id = $1 and is_current = true
        limit 1
        """,
        project_id,
    )


async def create_brief(conn, project_id: str, brief: dict):
    created = await conn.fetchrow(
        """
        insert into project_briefs (
            project_id,
            idea_summary,
            strengths,
            weaknesses,
            most_promising_avenues,
            assumptions,
            recommended_conversations,
            is_current
        ) values ($1, $2, $3, $4, $5, $6, $7, true)
        returning id
        """,
        project_id,
        brief.get("idea_summary"),
        brief.get("strengths") or [],
        brief.get("weaknesses") or [],
        brief.get("most_promising_avenues") or [],
        brief.get("assumptions") or [],
        brief.get("recommended_conversations") or [],
    )
    await conn.execute(
        "update project_briefs set is_current = false where project_id = $1 and id != $2",
        project_id,
        created["id"],
    )
