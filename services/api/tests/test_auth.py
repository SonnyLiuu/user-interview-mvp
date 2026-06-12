from __future__ import annotations

import unittest
from unittest.mock import patch

from app import auth as auth_service
from app.errors import DatabaseUnavailableError


class _TimeoutAcquire:
    async def __aenter__(self):
        raise TimeoutError()

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _TimeoutPool:
    def acquire(self):
        return _TimeoutAcquire()


class AuthTests(unittest.IsolatedAsyncioTestCase):
    async def test_resolve_user_reports_database_unavailable_on_pool_timeout(self):
        payload = {
            "sub": "clerk-user-1",
            "email": "founder@example.com",
            "name": "Founder",
        }

        with patch.object(auth_service, "get_pool", return_value=_TimeoutPool()):
            with self.assertRaises(DatabaseUnavailableError):
                await auth_service.resolve_user(payload)
