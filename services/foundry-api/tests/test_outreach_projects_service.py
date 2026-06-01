from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, patch

from app.errors import BadRequestError, NotFoundError
from app.services import outreach_projects as outreach_project_service


class _AsyncContext:
    def __init__(self, value):
        self.value = value

    async def __aenter__(self):
        return self.value

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakePool:
    def __init__(self, conn):
        self.conn = conn

    def acquire(self):
        return _AsyncContext(self.conn)


class OutreachProjectsServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.conn = object()
        self.startup = {"id": "startup-1", "user_id": "user-1", "project_type": "startup", "is_archived": False}
        self.row = {
            "id": "outreach-1",
            "startup_project_id": "startup-1",
            "type": "information_discovery",
            "name": "Information Discovery",
            "status": "onboarding",
            "brief_json": None,
            "onboarding_state_json": None,
            "created_at": None,
            "updated_at": None,
        }

    def _patch_pool(self):
        return patch.object(outreach_project_service, "get_pool", return_value=_FakePool(self.conn))

    async def test_create_information_discovery_project(self):
        with (
            self._patch_pool(),
            patch.object(outreach_project_service.project_repo, "find_owned_project", new=AsyncMock(return_value=self.startup)),
            patch.object(outreach_project_service.outreach_project_repo, "find_non_archived_by_type", new=AsyncMock(return_value=None)),
            patch.object(outreach_project_service.outreach_project_repo, "create_outreach_project", new=AsyncMock(return_value=self.row)),
        ):
            result = await outreach_project_service.create_or_open_outreach_project(
                "user-1",
                "startup-1",
                {"type": "information_discovery"},
            )

            self.assertEqual(result["id"], "outreach-1")
            outreach_project_service.outreach_project_repo.create_outreach_project.assert_awaited_with(
                self.conn,
                "startup-1",
                "information_discovery",
                "Information Discovery",
                "onboarding",
            )

    async def test_create_returns_existing_non_archived_information_discovery_project(self):
        with (
            self._patch_pool(),
            patch.object(outreach_project_service.project_repo, "find_owned_project", new=AsyncMock(return_value=self.startup)),
            patch.object(outreach_project_service.outreach_project_repo, "find_non_archived_by_type", new=AsyncMock(return_value=self.row)),
            patch.object(outreach_project_service.outreach_project_repo, "create_outreach_project", new=AsyncMock()),
        ):
            result = await outreach_project_service.create_or_open_outreach_project(
                "user-1",
                "startup-1",
                {"type": "information_discovery"},
            )

            self.assertEqual(result["id"], "outreach-1")
            outreach_project_service.outreach_project_repo.create_outreach_project.assert_not_awaited()

    async def test_create_rejects_coming_soon_type(self):
        with self.assertRaises(BadRequestError) as ctx:
            await outreach_project_service.create_or_open_outreach_project(
                "user-1",
                "startup-1",
                {"type": "investor"},
            )

        self.assertEqual(ctx.exception.code, "outreach_type_unavailable")

    async def test_list_requires_owned_startup(self):
        with (
            self._patch_pool(),
            patch.object(outreach_project_service.project_repo, "find_owned_project", new=AsyncMock(return_value=None)),
            patch.object(outreach_project_service.outreach_project_repo, "list_for_startup", new=AsyncMock()),
        ):
            with self.assertRaises(NotFoundError):
                await outreach_project_service.list_outreach_projects_for_startup("user-1", "startup-1")

            outreach_project_service.outreach_project_repo.list_for_startup.assert_not_awaited()

    async def test_patch_updates_owned_outreach_project(self):
        updated = {**self.row, "status": "active"}
        with (
            self._patch_pool(),
            patch.object(outreach_project_service.outreach_project_repo, "find_for_owned_startup", new=AsyncMock(return_value=self.row)),
            patch.object(outreach_project_service.outreach_project_repo, "update_outreach_project", new=AsyncMock(return_value=updated)),
        ):
            result = await outreach_project_service.update_outreach_project_for_user(
                "user-1",
                "outreach-1",
                {"status": "active"},
            )

            self.assertEqual(result["status"], "active")
            outreach_project_service.outreach_project_repo.update_outreach_project.assert_awaited_with(
                self.conn,
                "outreach-1",
                status="active",
            )

    async def test_information_discovery_onboarding_init_starts_with_outcome_question(self):
        with (
            self._patch_pool(),
            patch.object(outreach_project_service.outreach_project_repo, "find_for_owned_startup", new=AsyncMock(return_value=self.row)),
            patch.object(outreach_project_service.outreach_project_repo, "update_outreach_project", new=AsyncMock(return_value=self.row)),
        ):
            result = await outreach_project_service.process_information_discovery_onboarding(
                "user-1",
                "outreach-1",
                {"type": "__init__"},
            )

            self.assertEqual(result["messages"][0]["content"], "What outcome do you want from this outreach?")
            self.assertFalse(result["isFinishable"])
            outreach_project_service.outreach_project_repo.update_outreach_project.assert_awaited()

    async def test_information_discovery_onboarding_kickoff_extracts_desired_outcome(self):
        with (
            self._patch_pool(),
            patch.object(outreach_project_service.outreach_project_repo, "find_for_owned_startup", new=AsyncMock(return_value=self.row)),
            patch.object(outreach_project_service.outreach_project_repo, "update_outreach_project", new=AsyncMock(return_value=self.row)),
        ):
            result = await outreach_project_service.process_information_discovery_onboarding(
                "user-1",
                "outreach-1",
                {"type": "kickoff", "message": "Validate whether the problem is painful and learn current workarounds."},
            )

            self.assertEqual(result["currentTurn"]["targetSlot"], "targetPeople")
            saved = outreach_project_service.outreach_project_repo.update_outreach_project.await_args.kwargs["onboarding_state_json"]
            self.assertEqual(saved["state"]["desiredOutcome"], "Validate whether the problem is painful and learn current workarounds.")
            self.assertIn("Understand current workarounds and alternatives", saved["state"]["learningGoals"])

    async def test_information_discovery_finish_generates_learning_brief(self):
        ready_state = {
            "state": {
                "desiredOutcome": "Validate problem urgency",
                "targetPeople": ["Operators who feel the pain"],
                "assumptionsToTest": ["Current workaround is painful"],
                "learningGoals": ["Understand current workarounds"],
                "conversationBoundaries": ["Do not pitch"],
                "completeness": {
                    "desiredOutcome": "solid",
                    "targetPeople": "solid",
                    "assumptionsToTest": "solid",
                    "learningGoals": "solid",
                    "conversationBoundaries": "solid",
                },
                "followUpCounts": {
                    "desiredOutcome": 0,
                    "targetPeople": 0,
                    "assumptionsToTest": 0,
                    "learningGoals": 0,
                    "conversationBoundaries": 0,
                },
            },
            "messages": [{"role": "assistant", "content": "Ready?", "messageType": "question"}],
            "lastTurn": None,
            "status": "ready",
        }
        row = {**self.row, "onboarding_state_json": ready_state}
        with (
            self._patch_pool(),
            patch.object(outreach_project_service.outreach_project_repo, "find_for_owned_startup", new=AsyncMock(return_value=row)),
            patch.object(outreach_project_service.outreach_project_repo, "update_outreach_project", new=AsyncMock(return_value=row)),
        ):
            result = await outreach_project_service.process_information_discovery_onboarding(
                "user-1",
                "outreach-1",
                {"type": "finish"},
            )

            self.assertEqual(result["sessionStatus"], "completed")
            updates = outreach_project_service.outreach_project_repo.update_outreach_project.await_args.kwargs
            self.assertEqual(updates["status"], "active")
            self.assertEqual(updates["brief_json"]["type"], "information_discovery")
            self.assertEqual(updates["brief_json"]["desiredOutcome"], "Validate problem urgency")

    async def test_office_hours_stream_persists_completed_information_discovery_brief(self):
        foundation_row = {
            "foundation_json": {
                "startupName": "Acme",
                "summary": "Workflow software for operations teams",
                "targetUser": "Operations leads",
                "painPoint": "Manual follow-up work",
            },
        }

        async def fake_stream(_system_prompt, _messages):
            yield "I'd start with operations leads who own the manual follow-up workflow.\n"
            yield (
                '{"outreach_onboarding_update":{"desiredOutcome":"Validate whether the manual follow-up workflow is urgent enough",'
                '"targetPeople":["Operations leads who own follow-up workflows"],'
                '"assumptionsToTest":["Manual follow-up work is painful enough to change tools"]},'
                '"brief_ready":true}'
            )

        with (
            self._patch_pool(),
            patch.object(outreach_project_service.outreach_project_repo, "find_for_owned_startup", new=AsyncMock(return_value=self.row)),
            patch.object(outreach_project_service.foundation_repo, "get_latest_foundation", new=AsyncMock(return_value=foundation_row)),
            patch.object(outreach_project_service, "stream_intake_reply", new=fake_stream),
            patch.object(outreach_project_service.outreach_project_repo, "update_outreach_project", new=AsyncMock(return_value=self.row)),
        ):
            chunks = [
                chunk
                async for chunk in outreach_project_service.stream_outreach_project_office_hours(
                    "user-1",
                    "outreach-1",
                    "tell me what it should be",
                )
            ]

            self.assertIn("operations leads", "".join(chunks))
            updates = outreach_project_service.outreach_project_repo.update_outreach_project.await_args.kwargs
            self.assertEqual(updates["status"], "active")
            self.assertEqual(updates["brief_json"]["type"], "information_discovery")
            self.assertEqual(
                updates["brief_json"]["targetPeople"],
                ["Operations leads who own follow-up workflows"],
            )
            self.assertEqual(updates["onboarding_state_json"]["status"], "completed")


if __name__ == "__main__":
    unittest.main()
