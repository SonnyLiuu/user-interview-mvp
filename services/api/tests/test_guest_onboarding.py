from __future__ import annotations

import unittest

from app.services.guest_onboarding import ENTRY_GOALS, _destination, _goal_brief


class GuestOnboardingGoalTests(unittest.TestCase):
    def setUp(self):
        self.foundation = {
            "summary": "A workflow tool for founders",
            "targetUser": "early-stage founders",
            "idealPeopleTypes": ["founders with an active workaround"],
            "keyAssumptions": ["The current workflow is painful enough to change"],
        }

    def test_every_entry_goal_builds_a_complete_idea_validation_brief(self):
        for goal in ENTRY_GOALS:
            with self.subTest(goal=goal):
                brief = _goal_brief(self.foundation, goal)
                self.assertEqual(brief["type"], "idea_validation")
                self.assertTrue(brief["desiredOutcome"])
                self.assertTrue(brief["learningGoals"])
                self.assertTrue(brief["targetPeople"])
                self.assertTrue(brief["assumptionsToTest"])
                self.assertTrue(brief["outreachGuidance"])
                self.assertTrue(brief["starterAsk"])

    def test_destinations_match_the_selected_goal(self):
        self.assertIn("/foundation", _destination("demo", "outreach", "pressure_test_idea"))
        self.assertIn("/foundation", _destination("demo", "outreach", "exploring"))
        self.assertIn("/insights", _destination("demo", "outreach", "analyze_notes"))
        self.assertIn("/people", _destination("demo", "outreach", "write_outreach"))
        self.assertIn("outreachProjectId=outreach", _destination("demo", "outreach", "find_interviewees"))


if __name__ == "__main__":
    unittest.main()
