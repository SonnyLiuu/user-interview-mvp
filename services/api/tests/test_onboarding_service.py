from __future__ import annotations

import unittest
from unittest.mock import ANY, AsyncMock, patch

from app.domain.onboarding_engine import empty_onboarding_state
from app.services import onboarding as onboarding_service


class _AsyncContext:
    def __init__(self, value):
        self.value = value

    async def __aenter__(self):
        return self.value

    async def __aexit__(self, exc_type, exc, tb):
        return False


class _FakeConn:
    def transaction(self):
        return _AsyncContext(self)


class _FakePool:
    def acquire(self):
        return _AsyncContext(_FakeConn())


def _turn(slot_key: str) -> dict:
    return {
        "targetSlot": slot_key,
        "question": f"Question for {slot_key}?",
        "choices": [
            {"id": "a", "label": "Choice A", "normalizedValue": "Value A", "slotKey": slot_key},
            {"id": "b", "label": "Choice B", "normalizedValue": "Value B", "slotKey": slot_key},
            {"id": "c", "label": "Choice C", "normalizedValue": "Value C", "slotKey": slot_key},
        ],
        "customPlaceholder": "Add detail...",
    }


class OnboardingServiceTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.project = {"id": "project-1", "project_type": "startup", "slug": "acme"}
        self.session = {"id": "session-1", "status": "active", "progress_json": None}

    def _patch_common(self, state, chat_history, last_turn=None):
        return [
            patch.object(onboarding_service, "_get_context", new=AsyncMock(return_value=(self.project, self.session, state, chat_history, last_turn))),
            patch.object(onboarding_service, "get_pool", return_value=_FakePool()),
            patch.object(onboarding_service.onboarding_repo, "save_message", new=AsyncMock()),
            patch.object(onboarding_service.onboarding_repo, "save_state", new=AsyncMock()),
            patch.object(onboarding_service.onboarding_repo, "persist_session_turn", new=AsyncMock()),
        ]

    async def test_kickoff_saves_state_and_returns_ready_when_finishable(self):
        state = empty_onboarding_state("startup")
        extracted = {
            "startupName": {"value": "Acme", "quality": "solid"},
            "ideaSummary": {"value": "A scheduling tool", "quality": "solid"},
            "targetUser": {"value": "Clinic managers", "quality": "solid"},
            "painPoint": {"value": "Manual scheduling", "quality": "solid"},
            "valueProp": {"value": "Saves admin time", "quality": "weak"},
            "idealPeopleTypes": {"values": ["Clinic managers"], "quality": "weak"},
            "biggestBottleneck": {"value": "Need to validate urgency", "quality": "weak"},
        }
        patches = self._patch_common(state, [{"role": "assistant", "content": "Kickoff", "messageType": "question"}])
        patches.append(patch.object(onboarding_service, "extract_kickoff_idea", new=AsyncMock(return_value=extracted)))

        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            response = await onboarding_service.process_onboarding_request("user-1", "project-1", {"type": "kickoff", "message": "Here is the idea"})

            self.assertEqual(response["sessionStatus"], "ready")
            self.assertIsNone(response["currentTurn"])
            onboarding_service.onboarding_repo.save_state.assert_awaited()

    async def test_answer_with_choices_advances_to_next_turn(self):
        state = empty_onboarding_state("startup")
        state["startupName"] = "Acme"
        state["completeness"]["startupName"] = "solid"
        last_turn = _turn("ideaSummary")
        patches = self._patch_common(state, [{"role": "assistant", "content": "Question", "messageType": "question"}], last_turn)
        patches.append(patch.object(onboarding_service, "generate_next_question", new=AsyncMock(return_value=_turn("targetUser"))))

        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
            response = await onboarding_service.process_onboarding_request("user-1", "project-1", {"type": "answer", "choiceIds": ["a"]})

            self.assertEqual(response["sessionStatus"], "active")
            self.assertEqual(response["currentTurn"]["targetSlot"], "targetUser")
            user_message_calls = [
                call.args[1:]
                for call in onboarding_service.onboarding_repo.save_message.await_args_list
                if len(call.args) >= 6 and call.args[3] == "user"
            ]
            self.assertIn(("session-1", "project-1", "user", "Selected suggestions: 1. Choice A", "choice_answer"), user_message_calls)

    async def test_answer_with_custom_text_and_selected_choices_uses_extractor_context(self):
        state = empty_onboarding_state("startup")
        state["startupName"] = "Acme"
        state["completeness"]["startupName"] = "solid"
        state["ideaSummary"] = "A scheduling tool"
        state["completeness"]["ideaSummary"] = "solid"
        last_turn = _turn("targetUser")
        extracted = {"value": "Solo clinic managers", "quality": "solid"}
        patches = self._patch_common(state, [{"role": "assistant", "content": "Question", "messageType": "question"}], last_turn)
        patches.extend(
            [
                patch.object(onboarding_service, "extract_custom_slot_answer", new=AsyncMock(return_value=extracted)),
                patch.object(onboarding_service, "generate_next_question", new=AsyncMock(return_value=_turn("painPoint"))),
            ]
        )

        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6]:
            response = await onboarding_service.process_onboarding_request(
                "user-1",
                "project-1",
                {"type": "answer", "choiceIds": ["b"], "customText": "Mostly solo clinic managers"},
            )

            self.assertEqual(response["currentTurn"]["targetSlot"], "painPoint")
            onboarding_service.extract_custom_slot_answer.assert_awaited()
            args = onboarding_service.extract_custom_slot_answer.await_args.args
            self.assertEqual(args[0], "targetUser")
            self.assertEqual(args[4][0]["id"], "b")

    async def test_generate_turn_uses_fallback_after_invalid_generated_choices(self):
        state = empty_onboarding_state("startup")
        with patch.object(onboarding_service, "generate_next_question", new=AsyncMock(return_value={**_turn("ideaSummary"), "choices": []})):
            turn = await onboarding_service._generate_turn(state, [], "startup")

        self.assertEqual(turn["targetSlot"], "startupName")
        self.assertEqual(turn["question"], "What should we call this startup or product for now?")

    async def test_finish_generates_foundation_and_completes_session(self):
        state = empty_onboarding_state("startup")
        for key in ["startupName", "ideaSummary", "targetUser", "painPoint", "valueProp", "biggestBottleneck"]:
            state[key] = key
            state["completeness"][key] = "solid"
        state["biggestBottleneck"] = "Need to validate urgency"
        state["idealPeopleTypes"] = ["Operators"]
        state["completeness"]["idealPeopleTypes"] = "solid"
        patches = self._patch_common(state, [{"role": "assistant", "content": "Question", "messageType": "question"}])
        patches.extend(
            [
                patch.object(onboarding_service, "generate_foundation", new=AsyncMock(return_value={"foundation": {"summary": "A tool"}})),
                patch.object(onboarding_service.onboarding_repo, "insert_foundation", new=AsyncMock()),
                patch.object(onboarding_service.onboarding_repo, "complete_session", new=AsyncMock()),
                patch.object(onboarding_service.project_repo, "update_project", new=AsyncMock()),
            ]
        )

        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8]:
            response = await onboarding_service.process_onboarding_request("user-1", "project-1", {"type": "finish"})

            self.assertEqual(response["sessionStatus"], "completed")
            onboarding_service.onboarding_repo.insert_foundation.assert_awaited()
            inserted_foundation = onboarding_service.onboarding_repo.insert_foundation.await_args.args[2]
            self.assertEqual(inserted_foundation["recommendedOutreachProject"]["type"], "idea_validation")
            self.assertNotIn("biggestBottleneck", inserted_foundation)
            self.assertIn("Need to validate urgency", inserted_foundation["recommendedOutreachProject"]["reason"])
            onboarding_service.onboarding_repo.complete_session.assert_awaited()

    async def test_finish_auto_names_draft_startup_from_foundation(self):
        self.project = {"id": "project-1", "project_type": "startup", "slug": None}
        state = empty_onboarding_state("startup")
        for key in ["startupName", "ideaSummary", "targetUser", "painPoint", "valueProp", "biggestBottleneck"]:
            state[key] = "Acme AI" if key == "startupName" else key
            state["completeness"][key] = "solid"
        state["idealPeopleTypes"] = ["Operators"]
        state["completeness"]["idealPeopleTypes"] = "solid"
        patches = self._patch_common(state, [{"role": "assistant", "content": "Question", "messageType": "question"}])
        patches.extend(
            [
                patch.object(onboarding_service, "generate_foundation", new=AsyncMock(return_value={"foundation": {"startupName": "Acme AI", "summary": "A tool"}})),
                patch.object(onboarding_service.onboarding_repo, "insert_foundation", new=AsyncMock()),
                patch.object(onboarding_service.onboarding_repo, "complete_session", new=AsyncMock()),
                patch.object(onboarding_service.project_repo, "find_duplicate_slug", new=AsyncMock(return_value=None)),
                patch.object(onboarding_service.project_repo, "update_project", new=AsyncMock()),
            ]
        )

        with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5], patches[6], patches[7], patches[8], patches[9]:
            response = await onboarding_service.process_onboarding_request("user-1", "project-1", {"type": "finish"})

            self.assertEqual(response["sessionStatus"], "completed")
            onboarding_service.project_repo.update_project.assert_any_await(ANY, "project-1", name="Acme AI", slug="acme-ai")


if __name__ == "__main__":
    unittest.main()
