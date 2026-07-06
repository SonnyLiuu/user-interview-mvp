import Foundation
import UserInterviewNotetakerCore

// Plain executable test runner (`swift run UserInterviewNotetakerTests`) —
// the Command Line Tools toolchain has no XCTest, so SwiftPM test targets
// cannot build outside Xcode.

var passCount = 0

func expect(_ condition: @autoclosure () -> Bool, _ message: String, file: StaticString = #file, line: UInt = #line) {
    if condition() {
        passCount += 1
    } else {
        fputs("FAIL [\(file):\(line)]: \(message)\n", stderr)
        Foundation.exit(1)
    }
}

// MARK: - Topic merging (manual overrides survive gpt_realtime updates)

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

do {
    let existing = Topic(id: "2", label: "Demo", category: .goal, checked: false, manualOverride: false)
    let incoming = Topic(id: "2", label: "Demo", category: .goal, checked: true, checkedBy: "gpt_realtime", manualOverride: false)
    let merged = mergeTopics(existing: [existing], incoming: [incoming])
    expect(merged.first?.checked == true, "server update should apply without manual override")
}

do {
    let merged = mergeTopics(existing: [], incoming: [Topic(id: "3", label: "New", category: .signal)])
    expect(merged.count == 1, "new topics should be added")
}

// MARK: - Topic decoding tolerates unknown categories

do {
    // The backend stores categories as free-form strings; an unknown value
    // must not fail the whole payload.
    let json = Data(#"{"id":"1","label":"L","category":"someday-new","checked":false,"manualOverride":false}"#.utf8)
    let topic = try? JSONDecoder().decode(Topic.self, from: json)
    expect(topic?.category == .goal, "unknown category should decode as goal")

    let known = Data(#"{"id":"1","label":"L","category":"question","checked":true,"manualOverride":false}"#.utf8)
    expect((try? JSONDecoder().decode(Topic.self, from: known))?.category == .question, "known category should decode")
}

// MARK: - EndSessionTopic

do {
    let t = Topic(id: "x", label: "Q", category: .question, checked: true, checkedBy: "manual", checkedAt: "now", evidence: "e", manualOverride: true)
    let e = EndSessionTopic(topic: t)
    expect(e.id == "x", "end topic id")
    expect(e.checked == true, "end topic checked")
    expect(e.manualOverride == true, "end topic manualOverride")
}

// MARK: - DesktopPerson subtitle

do {
    let p = DesktopPerson(id: "1", name: "Alice", title: "PM", company: "Acme", projectName: "Widget")
    expect(p.subtitle == "PM - Acme - Widget", "full subtitle")
    expect(DesktopPerson(id: "2", name: "Bob").subtitle.isEmpty, "empty subtitle")
}

// MARK: - URL normalization

do {
    expect(normalizeHttpBaseUrl("localhost:3000", fallback: "http://f") == "http://localhost:3000", "add http scheme")
    expect(normalizeHttpBaseUrl(" https://api.example.com/ ", fallback: "http://f") == "https://api.example.com", "keep https, strip trailing slash")
    expect(normalizeHttpBaseUrl(nil, fallback: "http://f") == "http://f", "use fallback for nil")
    expect(normalizeHttpBaseUrl("   ", fallback: "http://f") == "http://f", "use fallback for blank")
}

// MARK: - Next.js base URL derivation

do {
    expect(
        DesktopSettings(apiBaseUrl: "http://127.0.0.1:8001").normalizedNextBaseUrl == "http://127.0.0.1:3000",
        "dev port 8001 maps to 3000"
    )
    // A production API URL must not fall back to localhost.
    expect(
        DesktopSettings(apiBaseUrl: "https://api.example.com").normalizedNextBaseUrl == "https://api.example.com",
        "non-dev URL keeps same origin"
    )
}

// MARK: - API contracts

do {
    expect(StartLiveSessionRequest(personId: "p1").captureProvider == "desktop_audio", "default capture provider should be desktop_audio")
}

do {
    let json = Data("""
    {
      "sessionId": "s1",
      "turn": {
        "speaker": "Speaker",
        "source": "manual_upload",
        "text": "hello",
        "externalTurnId": null,
        "createdAt": "2026-01-01T00:00:00Z"
      },
      "transcriptRaw": "Speaker: hello"
    }
    """.utf8)
    let response = try? JSONDecoder().decode(LiveTranscriptTurnResponse.self, from: json)
    expect(response?.transcriptRaw == "Speaker: hello", "transcript turn response transcriptRaw")
    expect(response?.turn.text == "hello", "transcript turn text")
}

// MARK: - DeepLinkParser

do {
    let link = DeepLinkParser.parse("foundry://call/start?personId=p1&token=t1&zoomMeetingIdentifier=123")
    expect(link?.action == "call/start", "action")
    expect(link?.personId == "p1", "personId")
    expect(link?.token == "t1", "token")
    expect(link?.zoomMeetingIdentifier == "123", "zoomMeetingIdentifier")
    expect(DeepLinkParser.parse("http://x") == nil, "invalid scheme")
    expect(DeepLinkParser.parse("foundry://") == nil, "empty action")

    // Deep links are external input; duplicated keys must parse, not crash.
    let duplicated = DeepLinkParser.parse("foundry://call/start?personId=a&personId=b&token=t")
    expect(duplicated?.personId == "a", "duplicate query keys keep first value")
    expect(duplicated?.token == "t", "duplicate query keys do not drop others")
}

// MARK: - SSEParser

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

    // Per the SSE spec only the first space after the colon is stripped.
    let padded = parser.parse("data:  padded\n")
    expect(String(data: padded!.data, encoding: .utf8) == " padded", "only one leading space stripped")

    let comment = parser.parse(": keepalive\ndata: x\n")
    expect(String(data: comment!.data, encoding: .utf8) == "x", "comment lines ignored")

    expect(parser.parse("data: x\n")?.type == "message", "type defaults to message")
}

// MARK: - SSEStreamAssembler

do {
    // The exact wire format the FastAPI events endpoint produces:
    // "id: ...\nevent: ...\ndata: {...}\n\n" per event.
    let stream = "id: 1\nevent: topic_checked\ndata: {\"a\":1}\n\nid: 2\nevent: heartbeat\ndata: {}\n\n"
    var assembler = SSEStreamAssembler()
    var events: [LiveSessionEvent] = []
    for byte in Array(stream.utf8) {
        if let event = assembler.feed(byte) {
            events.append(event)
        }
    }
    expect(events.count == 2, "assembler yields one event per blank-line-delimited block")
    expect(events.first?.type == "topic_checked", "assembler first event type")
    expect(events.first?.id == "1", "assembler first event id")
    expect(String(data: events.first!.data, encoding: .utf8) == #"{"a":1}"#, "assembler first event data")
    expect(events.last?.type == "heartbeat", "assembler second event type")
}

do {
    // CRLF line endings and comment keepalives must also parse.
    let stream = ": ping\r\n\r\nid: 9\r\nevent: transcript_turn\r\ndata: {\"x\":2}\r\n\r\n"
    var assembler = SSEStreamAssembler()
    var events: [LiveSessionEvent] = []
    for byte in Array(stream.utf8) {
        if let event = assembler.feed(byte) {
            events.append(event)
        }
    }
    expect(events.count == 1, "comment-only blocks are skipped; CRLF event parses")
    expect(events.first?.type == "transcript_turn", "CRLF event type")
    expect(String(data: events.first!.data, encoding: .utf8) == #"{"x":2}"#, "CRLF event data")
}

do {
    // Repeated blank lines between events must not produce phantom events.
    let stream = "\n\n\ndata: a\n\n\n"
    var assembler = SSEStreamAssembler()
    var events: [LiveSessionEvent] = []
    for byte in Array(stream.utf8) {
        if let event = assembler.feed(byte) {
            events.append(event)
        }
    }
    expect(events.count == 1, "blank-line runs yield no phantom events")
}

// MARK: - LiveSessionEvent

do {
    let data = Data("hello".utf8)
    let event = LiveSessionEvent(id: "1", type: "test", data: data)
    expect(event.id == "1", "event id")
    expect(event.type == "test", "event type")
    expect(event.data == data, "event data")
}

print("All \(passCount) assertions passed.")
