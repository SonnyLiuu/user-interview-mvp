import Foundation

public struct SSEParser: Sendable {
    public init() {}

    public func parse(_ block: String) -> LiveSessionEvent? {
        var id: String?
        var type = "message"
        var dataLines: [String] = []

        for line in block.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.hasPrefix(":") { continue }
            if line.hasPrefix("id:") {
                id = String(line.dropFirst(3)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("event:") {
                type = String(line.dropFirst(6)).trimmingCharacters(in: .whitespaces)
            } else if line.hasPrefix("data:") {
                dataLines.append(String(line.dropFirst(5)).trimmingCharacters(in: .whitespaces))
            }
        }

        guard !dataLines.isEmpty else { return nil }
        return LiveSessionEvent(
            id: id,
            type: type,
            data: dataLines.joined(separator: "\n").data(using: .utf8) ?? Data()
        )
    }
}
