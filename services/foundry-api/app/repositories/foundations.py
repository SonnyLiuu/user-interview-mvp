from __future__ import annotations

import json


async def get_latest_foundation(conn, project_id: str):
    return await conn.fetchrow(
        """
        select *
        from project_foundations
        where project_id = $1
        order by generated_at desc
        limit 1
        """,
        project_id,
    )


async def update_foundation(conn, project_id: str, foundation_json: dict):
    await conn.execute(
        """
        update project_foundations
        set foundation_json = $2, updated_at = now()
        where id = (
            select id from project_foundations
            where project_id = $1
            order by generated_at desc
            limit 1
        )
        """,
        project_id,
        json.dumps(foundation_json),
    )
