from __future__ import annotations


async def find_by_token_hash(conn, token_hash: str, *, for_update: bool = False):
    suffix = " for update" if for_update else ""
    return await conn.fetchrow(
        f"""
        select *
        from guest_onboarding_claims
        where token_hash = $1
        limit 1{suffix}
        """,
        token_hash,
    )


async def create_claim(conn, project_id: str, token_hash: str, ip_hash: str | None, expires_at):
    return await conn.fetchrow(
        """
        insert into guest_onboarding_claims
          (project_id, token_hash, ip_hash, expires_at)
        values ($1, $2, $3, $4)
        returning *
        """,
        project_id,
        token_hash,
        ip_hash,
        expires_at,
    )


async def count_recent_for_ip(conn, ip_hash: str, since):
    return await conn.fetchval(
        """
        select count(*)
        from guest_onboarding_claims
        where ip_hash = $1 and created_at >= $2
        """,
        ip_hash,
        since,
    )


async def update_profile(conn, claim_id: str, profile: dict):
    return await conn.fetchrow(
        """
        update guest_onboarding_claims
        set profile_json = $2, updated_at = now()
        where id = $1
        returning *
        """,
        claim_id,
        profile,
    )


async def increment_requests(conn, claim_id: str):
    return await conn.fetchrow(
        """
        update guest_onboarding_claims
        set request_count = request_count + 1, updated_at = now()
        where id = $1
        returning *
        """,
        claim_id,
    )


async def abandon(conn, claim_id: str):
    return await conn.fetchrow(
        """
        update guest_onboarding_claims
        set status = 'abandoned', updated_at = now()
        where id = $1
        returning *
        """,
        claim_id,
    )


async def mark_claimed(conn, claim_id: str, user_id: str):
    return await conn.fetchrow(
        """
        update guest_onboarding_claims
        set status = 'claimed',
            claimed_by_user_id = $2,
            claimed_at = now(),
            updated_at = now()
        where id = $1
        returning *
        """,
        claim_id,
        user_id,
    )
