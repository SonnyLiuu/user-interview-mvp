import Foundation
import UserInterviewNotetakerCore

// ---- Helpers ----

func mergeTopics(existing: [Topic], incoming: [Topic]) -> [Topic] {
    incoming.map { next in
        guard let current = existing.first(where: { $0.id == next.id }) else {
            return next
        }
        if current.manualOverride && next.checkedBy == "gpt_realtime" {
            return current
        }
        return next
    }
}

func expect(_ condition: @autoclosure () -> Bool, _ message: String, file: StaticString = #file, line: UInt = #line) {
    if !condition() {
        fputs("FAIL [\(file):\(line)]: \(message)\n", stderr)
        Foundation.exit(1)
    }
}

// ---- Tests ----

// Topic merging — manual overrides survive gpt_realtime changes.
do {
    let manual = Topic(
        id: "1", label: "Ask about pricing", category: .question,
        checked: true, checkedBy: "manual", checkedAt: "2025-01-01T00:00:00Z",
        evidence: nil, manualOverride: true
    )
    let gpt = Topic(
        id: "1", label: "Ask about pricing", category: .question,
        checked: false, checkedBy: "gpt_realtime", checkedAt: "2025-01-01T00:00:01Z",
        evidence: "didn't ask", manualOverride: false
    )
    let merged = mergeTopics(existing: [manual], incoming: [gpt])
    expect(merged.first?.checked == true, "manual override should survive gpt_realtime")
    expect(merged.first?.checkedBy == "manual", "checkedBy should stay manual")
}

// Topic merging — server update applies when no manual override.
do {
    let existing = Topic(id: "2", label: "Demo", category: .goal, checked: false, manualOverride: false)
    let incoming = Topic(id: "2", label: "Demo", category: .goal, checked: true, checkedBy: "gpt_realtime", manualOverride: false)
    let merged = mergeTopics(existing: [existing], incoming: [incoming])
    expect(merged.first?.checked == true, "server update should apply without manual override")
}

// Topic merging — new topics are added.
do {
    let merged = mergeTopics(existing: [], incoming: [Topic(id: "3", label: "New", category: .signal, checked: false)])
    expect(merged.count == 1, "new topics should be added")
}

// DesktopPerson subtitle.
do {
    let p = DesktopPerson(id: "1", name: "Alice", title: "PM", company: "Acme", projectName: "Widget")
    expect(p.subtitle == "PM - Acme - Widget", "full subtitle")
    expect(DesktopPerson(id: "2", name: "Bob").subtitle.isEmpty, "empty subtitle")
}

// Normalize HTTP base URL.
do {
    expect(normalizeHttpBaseUrl("localhost:3000", fallback: "http://f") == "http://localhost:3000", "add http scheme")
    expect(normalizeHttpBaseUrl("https://api.example.com/", fallback: "http://f") == "https://api.example.com", "keep https, strip trailing slash")
    expect(normalizeHttpBaseUrl(nil, fallback: "http://f") == "http://f", "use fallback")
}

// EndSessionTopic init from Topic.
do {
    let t = Topic(id: "x", label: "Q", category: .question, checked: true, checkedBy: "manual", checkedAt: "now", evidence: "e", manualOverride: true)
    let e = EndSessionTopic(topic: t)
    expect(e.id == "x", "end topic id")
    expect(e.checked == true, "end topic checked")
}

// DeepLinkParser.
do {
    let link = DeepLinkParser.parse("foundry://call/start?personId=p1&token=t1&zoomMeetingIdentifier=123")
    expect(link?.action == "call/start", "action")
    expect(link?.personId == "p1", "personId")
    expect(link?.token == "t1", "token")
    expect(link?.zoomMeetingIdentifier == "123", "zoomMeetingIdentifier")
    expect(DeepLinkParser.parse("http://x") == nil, "invalid scheme")
    expect(DeepLinkParser.parse("foundry://") == nil, "empty action")
}

// SSEParser.
do {
    let parser = SSEParser()
    let event = parser.parse("id: evt_1\nevent: topic_checked\ndata: {\"checked\":true}\n")
    expect(event?.id == "evt_1", "SSE id")
    expect(event?.type == "topic_checked", "SSE type")
    let body = String(data: event!.data, encoding: .utf8) ?? ""
    expect(body == #"{"checked":true}"#, "SSE data body")

    expect(parser.parse("") == nil, "empty block returns nil")
    expect(parser.parse("id: x\nevent: y\n") == nil, "no data returns nil")

    let multi = parser.parse("data: a\ndata: b\n")
    let multiBody = String(data: multi!.data, encoding: .utf8) ?? ""
    expect(multiBody == "a\nb", "multiline data joined with newline")
}

// LiveSessionEvent construction.
do {
    let data = "hello".data(using: .utf8)!
    let event = LiveSessionEvent(id: "1", type: "test", data: data)
    expect(event.id == "1", "event id")
    expect(event.type == "test", "event type")
    expect(event.data == data, "event data")
}

print("All unit tests passed.")
