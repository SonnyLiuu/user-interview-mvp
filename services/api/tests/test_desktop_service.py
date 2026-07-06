from __future__ import annotations

import unittest

from app.schemas.desktop import DesktopTopicInput
from app.services.desktop import _notes_from_topics


class DesktopServiceTests(unittest.TestCase):
    def test_notes_from_topics_excludes_checklist_topics(self):
        topics = [
            DesktopTopicInput(label="Ask about current workaround", checked=True),
            DesktopTopicInput(label="Ask for a referral", checked=False),
        ]

        self.assertEqual(_notes_from_topics(topics, "  Follow up next week.  "), "Follow up next week.")
        self.assertEqual(_notes_from_topics(topics, "   "), "")


if __name__ == "__main__":
    unittest.main()
