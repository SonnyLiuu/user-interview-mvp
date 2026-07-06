from __future__ import annotations

import unittest

from app.domain.project_context import apply_idea_validation_brief, foundation_to_project_context


class ProjectContextTests(unittest.TestCase):
    def test_idea_validation_brief_enriches_startup_context(self):
        foundation = {
            "summary": "AI workflow tool",
            "targetUser": "Operations leaders",
            "painPoint": "Manual reporting",
            "valueProp": "Automates weekly reporting",
            "idealPeopleTypes": ["Ops managers"],
        }
        brief = {
            "desiredOutcome": "Learn whether reporting pain is urgent",
            "targetPeople": ["RevOps leaders", "Finance operators"],
            "learningGoals": ["Understand current workaround"],
            "assumptionsToTest": ["Manual reporting is painful enough to change tools"],
            "conversationBoundaries": ["Do not pitch a demo"],
            "starterAsk": "Would you share how reporting works today?",
        }

        enriched = apply_idea_validation_brief(foundation, brief)
        context = foundation_to_project_context(enriched, "startup")

        self.assertEqual(context["ideal_people_types"], ["RevOps leaders", "Finance operators"])
        self.assertIn("Learn whether reporting pain is urgent", context["idea_summary"])
        self.assertIn("Manual reporting is painful enough to change tools", context["key_assumptions"])
        self.assertEqual(context["desired_outcome"], "Learn whether reporting pain is urgent")
        self.assertEqual(context["message_boundaries"], ["Do not pitch a demo"])


if __name__ == "__main__":
    unittest.main()
