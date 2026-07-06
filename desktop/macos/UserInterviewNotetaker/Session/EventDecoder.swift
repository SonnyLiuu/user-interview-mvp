import Foundation
import os
import UserInterviewNotetakerCore

struct EventEnvelope: Decodable {
    var sessionId: String?
    var topic: Topic?
    var topics: [Topic]?
    var realtimeStatus: String?
    var realtimeError: String?
    var transcriptRaw: String?
    var status: String?
    var message: String?
}

enum EventDecoder {
    private static let log = Logger(subsystem: "com.userinterview.notetaker", category: "SSE")

    static func decode(_ event: LiveSessionEvent) -> EventEnvelope? {
        do {
            return try JSONDecoder().decode(EventEnvelope.self, from: event.data)
        } catch {
            let raw = String(data: event.data, encoding: .utf8) ?? "<non-utf8>"
            log.warning("Failed to decode SSE event type=\(event.type, privacy: .public) raw=\(raw, privacy: .private)")
            return nil
        }
    }
}
