from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

from fastapi import Depends, Header

from .config import Settings, get_settings
from .db import get_pool
from .errors import UnauthorizedError


@dataclass
class AuthContext:
    user_id: str
    clerk_user_id: str
    email: str
    name: str
    avatar_url: str


def _b64url_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + padding)


def verify_internal_token(token: str, secret: str) -> dict:
    try:
        payload_part, signature_part = token.split(".", 1)
    except ValueError as exc:
        raise UnauthorizedError("Invalid token") from exc

    expected = hmac.new(secret.encode("utf-8"), payload_part.encode("utf-8"), hashlib.sha256).digest()
    actual = _b64url_decode(signature_part)
    if not hmac.compare_digest(expected, actual):
        raise UnauthorizedError("Invalid token signature")

    payload = json.loads(_b64url_decode(payload_part).decode("utf-8"))
    if payload.get("exp", 0) < int(time.time()):
        raise UnauthorizedError("Token expired")
    return payload


async def resolve_user(payload: dict) -> AuthContext:
    clerk_user_id = payload.get("sub") or ""
    email = payload.get("email") or ""
    name = payload.get("name") or email
    avatar_url = payload.get("avatar_url") or ""

    if not clerk_user_id or not email:
        raise UnauthorizedError("Missing user payload")

    pool = get_pool()
    async with pool.acquire() as conn:
        existing = await conn.fetchrow(
            "select id from users where clerk_user_id = $1 limit 1",
            clerk_user_id,
        )
        if existing:
            return AuthContext(
                user_id=str(existing["id"]),
                clerk_user_id=clerk_user_id,
                email=email,
                name=name,
                avatar_url=avatar_url,
            )

        by_email = await conn.fetchrow("select id from users where email = $1 limit 1", email)
        if by_email:
            await conn.execute(
                "update users set clerk_user_id = $1 where id = $2",
                clerk_user_id,
                by_email["id"],
            )
            return AuthContext(
                user_id=str(by_email["id"]),
                clerk_user_id=clerk_user_id,
                email=email,
                name=name,
                avatar_url=avatar_url,
            )

        created = await conn.fetchrow(
            """
            insert into users (clerk_user_id, email, name, avatar_url)
            values ($1, $2, $3, $4)
            returning id
            """,
            clerk_user_id,
            email,
            name,
            avatar_url,
        )
        return AuthContext(
            user_id=str(created["id"]),
            clerk_user_id=clerk_user_id,
            email=email,
            name=name,
            avatar_url=avatar_url,
        )


async def get_auth_context(
    authorization: str | None = Header(default=None, alias="Authorization"),
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing bearer token")
    payload = verify_internal_token(authorization.removeprefix("Bearer ").strip(), settings.backend_shared_secret)
    return await resolve_user(payload)
