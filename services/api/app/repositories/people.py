from __future__ import annotations


async def get_owned_person(conn, user_id: str, person_id: str):
    return await conn.fetchrow(
        """
        select
            people.*,
            projects.id as project_id,
            projects.project_type as project_type
        from people
        inner join projects on people.project_id = projects.id
        where people.id = $1
          and projects.user_id = $2
          and projects.is_archived = false
        limit 1
        """,
        person_id,
        user_id,
    )

