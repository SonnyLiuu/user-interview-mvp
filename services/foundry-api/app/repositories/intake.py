from __future__ import annotations


async def get_intake(conn, project_id: str):
    return await conn.fetchrow("select * from project_intake where project_id = $1 limit 1", project_id)


async def upsert_empty_intake(conn, project_id: str):
    existing = await get_intake(conn, project_id)
    if existing:
        return existing
    return await conn.fetchrow(
        "insert into project_intake (project_id) values ($1) returning *",
        project_id,
    )


async def save_conversation(conn, project_id: str, conversation: list[dict]):
    existing = await get_intake(conn, project_id)
    if existing:
        await conn.execute(
            "update project_intake set conversation = $2, updated_at = now() where project_id = $1",
            project_id,
            conversation,
        )
    else:
        await conn.execute(
            "insert into project_intake (project_id, conversation) values ($1, $2)",
            project_id,
            conversation,
        )


async def update_intake_fields(conn, project_id: str, fields: dict):
    keys = list(fields.keys())
    if not keys:
        return
    assignments = ", ".join([f"{key} = ${idx + 2}" for idx, key in enumerate(keys)])
    await conn.execute(
        f"update project_intake set {assignments}, updated_at = now() where project_id = $1",
        project_id,
        *fields.values(),
    )
