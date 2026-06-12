from __future__ import annotations

import hashlib
import hmac
import json
import time
import unittest

from app.services.zoom_rtms import (
    extract_zoom_rtms_keys,
    verify_zoom_webhook_signature,
    zoom_url_validation_response,
)


class ZoomRtmsTests(unittest.TestCase):
    def test_url_validation_response(self) -> None:
        response = zoom_url_validation_response("plain", "secret")
        self.assertEqual(response["plainToken"], "plain")
        self.assertEqual(
            response["encryptedToken"],
            hmac.new(b"secret", b"plain", hashlib.sha256).hexdigest(),
        )

    def test_signature_verification_accepts_valid_signature(self) -> None:
        body = json.dumps({"event": "meeting.rtms_started"}).encode()
        timestamp = str(int(time.time()))
        signature = "v0=" + hmac.new(
            b"secret",
            b"v0:" + timestamp.encode() + b":" + body,
            hashlib.sha256,
        ).hexdigest()

        self.assertTrue(
            verify_zoom_webhook_signature(
                body,
                timestamp=timestamp,
                signature=signature,
                secret_token="secret",
            )
        )

    def test_signature_verification_rejects_tampering(self) -> None:
        self.assertFalse(
            verify_zoom_webhook_signature(
                b'{"event":"meeting.rtms_started"}',
                timestamp=str(int(time.time())),
                signature="v0=bad",
                secret_token="secret",
            )
        )

    def test_extract_zoom_rtms_keys_normalizes_meeting_id(self) -> None:
        keys = extract_zoom_rtms_keys(
            {
                "meeting_id": "123 456 7890",
                "meeting_uuid": "uuid",
                "rtms_stream_id": "stream",
            }
        )
        self.assertEqual(keys["meeting_id"], "1234567890")
        self.assertEqual(keys["meeting_uuid"], "uuid")
        self.assertEqual(keys["rtms_stream_id"], "stream")


if __name__ == "__main__":
    unittest.main()
