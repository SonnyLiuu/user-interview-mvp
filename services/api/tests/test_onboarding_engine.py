from __future__ import annotations

import unittest

from pydantic import TypeAdapter, ValidationError

from app.domain.onboarding_engine import (
    choose_next_slot,
    empty_onboarding_state,
    is_onboarding_finishable,
    merge_kickoff_context,
    merge_slot_patch,
    validate_choices,
)
from app.domain.project_modes import (
    get_outreach_project_type_config,
    get_outreach_project_type_configs,
    get_fallback_turn,
    normalize_outreach_project_type,
    get_slot_keys,
    is_creatable_outreach_project_type,
    is_creatable_project_type,
    is_valid_outreach_project_type,
    is_valid_project_type,
    is_visible_outreach_project_type,
    should_extract_slot_from_kickoff,
)
from app.schemas.onboarding import OnboardingChatRequest


class OnboardingEngineTests(unittest.TestCase):
    def test_empty_state_uses_mode_specific_slots(self):
        startup = empty_onboarding_state("startup")
        networking = empty_onboarding_state("networking")

        self.assertIn("startupName", startup)
        self.assertIn("ideaSummary", startup)
        self.assertNotIn("outreachGoal", startup)
        self.assertIn("outreachGoal", networking)
        self.assertNotIn("ideaSummary", networking)
        self.assertEqual(set(networking["completeness"]), set(get_slot_keys("networking")))

    def test_weak_required_slot_gets_one_follow_up_before_missing_slot(self):
        state = empty_onboarding_state("startup")
        state["completeness"]["startupName"] = "solid"
        state["startupName"] = "Acme"
        state["completeness"]["ideaSummary"] = "weak"

        self.assertEqual(choose_next_slot(state, "startup"), "ideaSummary")

        state["followUpCounts"]["ideaSummary"] = 1
        self.assertEqual(choose_next_slot(state, "startup"), "targetUser")

    def test_finishability_allows_three_solid_required_slots(self):
        state = empty_onboarding_state("startup")
        for key in ["startupName", "ideaSummary", "targetUser"]:
            state["completeness"][key] = "solid"
            state[key] = key
        for key in ["painPoint", "valueProp", "idealPeopleTypes", "biggestBottleneck"]:
            state["completeness"][key] = "weak"
            state[key] = [key] if key == "idealPeopleTypes" else key

        self.assertTrue(is_onboarding_finishable(state, "startup"))

    def test_merge_slot_patch_respects_array_slots(self):
        state = empty_onboarding_state("startup")
        next_state = merge_slot_patch(state, "idealPeopleTypes", "Domain experts", "solid", "startup")

        self.assertEqual(next_state["idealPeopleTypes"], ["Domain experts"])
        self.assertEqual(next_state["completeness"]["idealPeopleTypes"], "solid")

    def test_merge_kickoff_context_uses_slot_metadata_for_skips(self):
        state = empty_onboarding_state("networking")
        extracted = {
            "tone": {"value": "Warm and concise", "quality": "solid"},
            "outreachGoal": {"value": "Meet workshop speakers", "quality": "solid"},
        }

        next_state = merge_kickoff_context(state, extracted, "networking")

        self.assertIsNone(next_state["tone"])
        self.assertEqual(next_state["outreachGoal"], "Meet workshop speakers")
        self.assertFalse(should_extract_slot_from_kickoff("networking", "tone"))

    def test_choice_validation_rejects_duplicates_and_long_labels(self):
        valid_choices = [
            {"id": "a", "label": "One", "normalizedValue": "One", "slotKey": "ideaSummary"},
            {"id": "b", "label": "Two", "normalizedValue": "Two", "slotKey": "ideaSummary"},
            {"id": "c", "label": "Three", "normalizedValue": "Three", "slotKey": "ideaSummary"},
        ]
        self.assertEqual(validate_choices(valid_choices, "ideaSummary"), (True, None))

        duplicate_choices = [*valid_choices[:2], {"id": "c", "label": "Two", "normalizedValue": "Three", "slotKey": "ideaSummary"}]
        self.assertEqual(validate_choices(duplicate_choices, "ideaSummary")[1], "Duplicate choice labels")

        long_choices = [*valid_choices[:2], {"id": "c", "label": "x" * 121, "normalizedValue": "Three", "slotKey": "ideaSummary"}]
        self.assertEqual(validate_choices(long_choices, "ideaSummary")[1], "Choice label too long")


class ProjectModeConfigTests(unittest.TestCase):
    def test_fallback_turns_come_from_project_modes(self):
        startup = get_fallback_turn("startup", "startupName")
        networking = get_fallback_turn("networking", "outreachGoal")

        self.assertEqual(startup["question"], "What should we call this startup or product for now?")
        self.assertEqual(startup["choices"][0]["slotKey"], "startupName")
        self.assertEqual(networking["question"], "What are you trying to accomplish with this outreach?")
        self.assertEqual(networking["choices"][0]["slotKey"], "outreachGoal")

    def test_known_modes_and_creatable_modes_are_separate(self):
        self.assertTrue(is_valid_project_type("networking"))
        self.assertFalse(is_creatable_project_type("networking"))
        self.assertTrue(is_creatable_project_type("startup"))

    def test_outreach_type_registry_tracks_v1_availability(self):
        self.assertTrue(is_valid_outreach_project_type("idea_validation"))
        self.assertTrue(is_creatable_outreach_project_type("idea_validation"))
        self.assertTrue(is_visible_outreach_project_type("idea_validation"))
        self.assertEqual(normalize_outreach_project_type("information" + "_discovery"), "idea_validation")
        self.assertTrue(is_valid_outreach_project_type("information" + "_discovery"))

        self.assertTrue(is_valid_outreach_project_type("customer_acquisition"))
        self.assertFalse(is_creatable_outreach_project_type("customer_acquisition"))
        self.assertTrue(is_visible_outreach_project_type("customer_acquisition"))

        config = get_outreach_project_type_config("idea_validation")
        self.assertEqual(config["label"], "Idea Validation")
        self.assertEqual(config["availability"], "active")

        visible_types = {config["type"] for config in get_outreach_project_type_configs()}
        self.assertIn("idea_validation", visible_types)
        self.assertIn("press_creator", visible_types)


class OnboardingRequestSchemaTests(unittest.TestCase):
    def setUp(self):
        self.adapter = TypeAdapter(OnboardingChatRequest)

    def test_current_request_types_validate(self):
        self.assertEqual(self.adapter.validate_python({"type": "__init__"}).type, "__init__")
        self.assertEqual(self.adapter.validate_python({"type": "finish"}).type, "finish")
        self.assertEqual(self.adapter.validate_python({"type": "kickoff", "message": "Build a tool"}).message, "Build a tool")
        answer = self.adapter.validate_python({"type": "answer", "choiceIds": ["a"], "customText": "More detail"})
        self.assertEqual(answer.choiceIds, ["a"])

    def test_legacy_request_types_are_rejected(self):
        with self.assertRaises(ValidationError):
            self.adapter.validate_python({"type": "choice", "choiceId": "a"})
        with self.assertRaises(ValidationError):
            self.adapter.validate_python({"type": "custom", "customText": "Other text"})


if __name__ == "__main__":
    unittest.main()
