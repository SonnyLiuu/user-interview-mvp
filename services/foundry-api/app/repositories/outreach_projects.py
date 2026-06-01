from __future__ import annotations


async def list_for_startup(conn, startup_project_id: str):
    return await conn.fetch(
        """
        select *
        from outreach_projects
        where startup_project_id = $1
        order by created_at desc
        """,
        startup_project_id,
    )


async def list_for_owned_startup(conn, user_id: str, startup_project_id: str):
    return await conn.fetch(
        """
        select op.*
        from outreach_projects op
        join projects p on p.id = op.startup_project_id
        where op.startup_project_id = $1
          and p.user_id = $2
          and p.is_archived = false
        order by op.created_at desc
        """,
        startup_project_id,
        user_id,
    )


async def find_for_owned_startup(conn, user_id: str, outreach_project_id: str):
    return await conn.fetchrow(
        """
        select op.*
        from outreach_projects op
        join projects p on p.id = op.startup_project_id
        where op.id = $1
          and p.user_id = $2
          and p.is_archived = false
        limit 1
        """,
        outreach_project_id,
        user_id,
    )


async def find_non_archived_by_type(conn, startup_project_id: str, outreach_type: str):
    return await conn.fetchrow(
        """
        select *
        from outreach_projects
        where startup_project_id = $1
          and type = $2
          and status <> 'archived'
        order by created_at desc
        limit 1
        """,
        startup_project_id,
        outreach_type,
    )


async def find_active_information_discovery(conn, startup_project_id: str):
    return await conn.fetchrow(
        """
        select *
        from outreach_projects
        where startup_project_id = $1
          and type = 'information_discovery'
          and status = 'active'
        order by updated_at desc
        limit 1
        """,
        startup_project_id,
    )


async def create_outreach_project(conn, startup_project_id: str, outreach_type: str, name: str, status: str = "draft"):
    return await conn.fetchrow(
        """
        insert into outreach_projects (startup_project_id, type, name, status)
        values ($1, $2, $3, $4)
        returning *
        """,
        startup_project_id,
        outreach_type,
        name,
        status,
    )


async def update_outreach_project(conn, outreach_project_id: str, **fields):
    allowed = {"name", "status", "brief_json", "onboarding_state_json"}
    updates = {key: value for key, value in fields.items() if key in allowed}
    if not updates:
        return await conn.fetchrow("select * from outreach_projects where id = $1", outreach_project_id)
    keys = list(updates.keys())
    assignments = ", ".join([f"{key} = ${idx + 2}" for idx, key in enumerate(keys)])
    values = [outreach_project_id, *updates.values()]
    return await conn.fetchrow(
        f"""
        update outreach_projects
        set {assignments}, updated_at = now()
        where id = $1
        returning *
        """,
        *values,
    )
