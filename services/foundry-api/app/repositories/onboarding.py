from __future__ import annotations


async def get_session(conn, project_id: str):
    return await conn.fetchrow(
        "select * from onboarding_sessions where project_id = $1 limit 1",
        project_id,
    )


async def create_session(conn, project_id: str):
    return await conn.fetchrow(
        "insert into onboarding_sessions (project_id, status) values ($1, 'active') returning *",
        project_id,
    )


async def get_state_row(conn, project_id: str):
    return await conn.fetchrow("select * from onboarding_state where project_id = $1 limit 1", project_id)


async def save_state(conn, project_id: str, state: dict):
    existing = await get_state_row(conn, project_id)
    if existing:
        await conn.execute(
            "update onboarding_state set state_json = $2, updated_at = now() where project_id = $1",
            project_id,
            state,
        )
    else:
        await conn.execute(
            "insert into onboarding_state (project_id, state_json) values ($1, $2)",
            project_id,
            state,
        )


async def list_messages(conn, session_id: str):
    return await conn.fetch(
        """
        select *
        from onboarding_messages
        where session_id = $1
        order by created_at asc
        """,
        session_id,
    )


async def save_message(conn, session_id: str, project_id: str, role: str, content: str, message_type: str):
    await conn.execute(
        """
        insert into onboarding_messages (session_id, project_id, role, content, message_type)
        values ($1, $2, $3, $4, $5)
        """,
        session_id,
        project_id,
        role,
        content,
        message_type,
    )


async def persist_session_turn(conn, session_id: str, turn: dict | None, status: str):
    await conn.execute(
        """
        update onboarding_sessions
        set status = $2, current_slot = $3, progress_json = $4
        where id = $1
        """,
        session_id,
        status,
        turn["targetSlot"] if turn else None,
        {"lastTurn": turn} if turn else None,
    )


async def complete_session(conn, session_id: str):
    await conn.execute(
        """
        update onboarding_sessions
        set status = 'completed', current_slot = null, progress_json = null, completed_at = now()
        where id = $1
        """,
        session_id,
    )


async def insert_foundation(conn, project_id: str, foundation: dict):
    await conn.execute(
        "insert into project_foundations (project_id, foundation_json) values ($1, $2)",
        project_id,
        foundation,
    )
