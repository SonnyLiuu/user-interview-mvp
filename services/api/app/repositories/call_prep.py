from __future__ import annotations


async def get_current_call_prep(conn, person_id: str):
    return await conn.fetchrow(
        """
        select
            id,
            person_id,
            content,
            is_reviewed,
            generated_at,
            reviewed_at,
            is_current
        from call_prep
        where person_id = $1 and is_current = true
        order by generated_at desc
        limit 1
        """,
        person_id,
    )


async def replace_current_call_prep(conn, person_id: str, content: dict):
    async with conn.transaction():
        await conn.execute("select pg_advisory_xact_lock(hashtext($1))", person_id)
        await conn.execute(
            """
            update call_prep
            set is_current = false
            where person_id = $1 and is_current = true
            """,
            person_id,
        )
        return await conn.fetchrow(
            """
            insert into call_prep (person_id, content, is_current)
            values ($1, $2, true)
            returning
                id,
                person_id,
                content,
                is_reviewed,
                generated_at,
                reviewed_at,
                is_current
            """,
            person_id,
            content,
        )
