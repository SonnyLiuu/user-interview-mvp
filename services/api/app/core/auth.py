from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from dataclasses import dataclass

import asyncpg
from fastapi import Depends, Header

from .config import Settings, get_settings
from .db import get_pool
from .errors import DatabaseUnavailableError, UnauthorizedError


@dataclass
class AuthContext:
    user_id: str
    clerk_user_id: str
    email: str
    name: str
    avatar_url: str


@dataclass
class GuestAuthContext:
    token: str
    ip_address: str


DESKTOP_AUTH_TOKEN_TYPE = "desktop_app_auth"
DESKTOP_LAUNCH_TOKEN_TYPE = "desktop_call_launch"
GUEST_ONBOARDING_TOKEN_TYPE = "guest_onboarding"
DESKTOP_AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30
DESKTOP_LAUNCH_TOKEN_TTL_SECONDS = 60 * 2


def _b64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("utf-8").rstrip("=")


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


def sign_desktop_auth_token(clerk_user_id: str, secret: str, *, now: int | None = None) -> dict:
    issued_at = now or int(time.time())
    exp = issued_at + DESKTOP_AUTH_TOKEN_TTL_SECONDS
    payload = {
        "typ": DESKTOP_AUTH_TOKEN_TYPE,
        "sub": clerk_user_id,
        "exp": exp,
    }
    payload_part = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(secret.encode("utf-8"), payload_part.encode("utf-8"), hashlib.sha256).digest()
    return {
        "token": f"{payload_part}.{_b64url_encode(signature)}",
        "expiresAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(exp)),
    }


def sign_desktop_launch_token(
    clerk_user_id: str,
    person_id: str,
    secret: str,
    *,
    zoom_meeting_identifier: str | None = None,
    now: int | None = None,
) -> dict:
    issued_at = now or int(time.time())
    exp = issued_at + DESKTOP_LAUNCH_TOKEN_TTL_SECONDS
    payload = {
        "typ": DESKTOP_LAUNCH_TOKEN_TYPE,
        "sub": clerk_user_id,
        "personId": person_id,
        "exp": exp,
    }
    if zoom_meeting_identifier:
        payload["zoomMeetingIdentifier"] = zoom_meeting_identifier.strip()
    payload_part = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(secret.encode("utf-8"), payload_part.encode("utf-8"), hashlib.sha256).digest()
    return {
        "token": f"{payload_part}.{_b64url_encode(signature)}",
        "expiresAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(exp)),
    }


async def resolve_user(payload: dict) -> AuthContext:
    clerk_user_id = payload.get("sub") or ""
    email = payload.get("email") or ""
    name = payload.get("name") or email
    avatar_url = payload.get("avatar_url") or ""

    if not clerk_user_id or not email:
        raise UnauthorizedError("Missing user payload")

    try:
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
    except (TimeoutError, OSError, asyncpg.PostgresConnectionError) as exc:
        raise DatabaseUnavailableError("Database connection unavailable") from exc


async def resolve_desktop_user(clerk_user_id: str) -> AuthContext:
    if not clerk_user_id:
        raise UnauthorizedError("Missing desktop user payload")
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                select id, clerk_user_id, email, name, avatar_url
                from users
                where clerk_user_id = $1
                limit 1
                """,
                clerk_user_id,
            )
            if not row:
                raise UnauthorizedError("Desktop user not found")
            return AuthContext(
                user_id=str(row["id"]),
                clerk_user_id=row["clerk_user_id"] or clerk_user_id,
                email=row["email"] or "",
                name=row["name"] or row["email"] or "",
                avatar_url=row["avatar_url"] or "",
            )
    except UnauthorizedError:
        raise
    except (TimeoutError, OSError, asyncpg.PostgresConnectionError) as exc:
        raise DatabaseUnavailableError("Database connection unavailable") from exc


async def get_auth_context(
    authorization: str | None = Header(default=None, alias="Authorization"),
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing bearer token")
    payload = verify_internal_token(authorization.removeprefix("Bearer ").strip(), settings.backend_shared_secret)
    if payload.get("typ") == DESKTOP_AUTH_TOKEN_TYPE:
        return await resolve_desktop_user(payload.get("sub") or "")
    return await resolve_user(payload)


async def get_guest_auth_context(
    authorization: str | None = Header(default=None, alias="Authorization"),
    settings: Settings = Depends(get_settings),
) -> GuestAuthContext:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing bearer token")
    payload = verify_internal_token(authorization.removeprefix("Bearer ").strip(), settings.backend_shared_secret)
    if payload.get("typ") != GUEST_ONBOARDING_TOKEN_TYPE:
        raise UnauthorizedError("Invalid guest token")
    token = payload.get("guest_token") or ""
    if not token:
        raise UnauthorizedError("Missing guest token")
    return GuestAuthContext(token=token, ip_address=payload.get("ip_address") or "")
