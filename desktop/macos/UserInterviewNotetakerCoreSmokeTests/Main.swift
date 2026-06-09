import Foundation
import UserInterviewNotetakerCore

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() {
        fputs("FAIL: \(message)\n", stderr)
        Foundation.exit(1)
    }
}

let link = DeepLinkParser.parse(
    "foundry://call/start?personId=person_123&token=launch_456&zoomMeetingIdentifier=987654321"
)
expect(link?.action == "call/start", "deep-link action")
expect(link?.personId == "person_123", "deep-link person id")
expect(link?.token == "launch_456", "deep-link token")
expect(link?.zoomMeetingIdentifier == "987654321", "deep-link zoom id")

let event = SSEParser().parse(
    """
    id: evt_1
    event: topic_checked
    data: {"topic":{"id":"1","label":"Ask about workflow","category":"question","checked":true,"manualOverride":false}}
    """
)
expect(event?.id == "evt_1", "SSE id")
expect(event?.type == "topic_checked", "SSE event type")
expect(event?.data.isEmpty == false, "SSE data")

expect(
    normalizeHttpBaseUrl("localhost:3000/", fallback: "http://fallback") == "http://localhost:3000",
    "localhost URL normalization"
)
expect(
    normalizeHttpBaseUrl(" https://api.example.com/ ", fallback: "http://fallback") == "https://api.example.com",
    "HTTPS URL normalization"
)

print("UserInterviewNotetakerCoreSmokeTests passed")
