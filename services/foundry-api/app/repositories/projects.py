from __future__ import annotations


async def list_projects(conn, user_id: str):
    return await conn.fetch(
        """
        select *
        from projects
        where user_id = $1 and is_archived = false
        order by created_at desc
        """,
        user_id,
    )


async def find_owned_project(conn, user_id: str, project_id: str):
    return await conn.fetchrow(
        """
        select *
        from projects
        where id = $1 and user_id = $2 and is_archived = false
        limit 1
        """,
        project_id,
        user_id,
    )


async def find_owned_project_by_slug_or_id(conn, user_id: str, slug_or_id: str):
    by_slug = await conn.fetchrow(
        """
        select *
        from projects
        where user_id = $1 and slug = $2 and is_archived = false
        limit 1
        """,
        user_id,
        slug_or_id,
    )
    if by_slug:
        return by_slug

    return await conn.fetchrow(
        """
        select *
        from projects
        where user_id = $1 and id = $2 and is_archived = false
        limit 1
        """,
        user_id,
        slug_or_id,
    )


async def find_latest_project(conn, user_id: str):
    return await conn.fetchrow(
        """
        select id, name, slug
        from projects
        where user_id = $1 and is_archived = false
        order by created_at desc
        limit 1
        """,
        user_id,
    )


async def create_project(conn, user_id: str, name: str, slug: str):
    return await conn.fetchrow(
        """
        insert into projects (user_id, name, slug)
        values ($1, $2, $3)
        returning *
        """,
        user_id,
        name,
        slug,
    )


async def create_empty_intake(conn, project_id: str):
    await conn.execute("insert into project_intake (project_id) values ($1) on conflict (project_id) do nothing", project_id)


async def find_duplicate_slug(conn, user_id: str, slug: str):
    return await conn.fetchrow(
        "select id from projects where user_id = $1 and slug = $2 and is_archived = false limit 1",
        user_id,
        slug,
    )


async def delete_project(conn, project_id: str):
    await conn.execute("delete from projects where id = $1", project_id)


async def update_project(conn, project_id: str, **fields):
    if not fields:
        return await conn.fetchrow("select * from projects where id = $1", project_id)
    keys = list(fields.keys())
    assignments = ", ".join([f"{key} = ${idx + 2}" for idx, key in enumerate(keys)])
    values = [project_id, *fields.values()]
    return await conn.fetchrow(
        f"update projects set {assignments}, updated_at = now() where id = $1 returning *",
        *values,
    )
