from __future__ import annotations


async def replace_current_outreach(conn, person_id: str, content: dict):
    async with conn.transaction():
        await conn.execute("select pg_advisory_xact_lock(hashtext($1))", person_id)
        await conn.execute(
            """
            update outreach
            set is_current = false
            where person_id = $1 and is_current = true
            """,
            person_id,
        )
        return await conn.fetchrow(
            """
            insert into outreach (person_id, content, is_current)
            values ($1, $2, true)
            returning
                id,
                person_id,
                content,
                generated_at,
                is_current
            """,
            person_id,
            content,
        )
