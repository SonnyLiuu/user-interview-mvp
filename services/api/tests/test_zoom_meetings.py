from __future__ import annotations

import unittest

from app.services.zoom_meetings import normalize_zoom_meeting_identifier


class ZoomMeetingTests(unittest.TestCase):
    def test_normalizes_zoom_meeting_identifiers(self):
        self.assertEqual(normalize_zoom_meeting_identifier("123 456 7890"), "1234567890")
        self.assertEqual(normalize_zoom_meeting_identifier("123-456-7890"), "1234567890")
        self.assertEqual(
            normalize_zoom_meeting_identifier("https://zoom.us/j/12345678901?pwd=secret"),
            "12345678901",
        )
        self.assertEqual(
            normalize_zoom_meeting_identifier("https://example.zoom.us/wc/join/987654321"),
            "987654321",
        )
        self.assertIsNone(normalize_zoom_meeting_identifier(""))


if __name__ == "__main__":
    unittest.main()
