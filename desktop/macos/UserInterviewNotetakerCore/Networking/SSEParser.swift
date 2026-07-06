import Foundation

/// Parses one server-sent-event block (the lines between blank-line
/// separators) into a `LiveSessionEvent`.
public struct SSEParser: Sendable {
    public init() {}

    public func parse(_ block: String) -> LiveSessionEvent? {
        var id: String?
        var type = "message"
        var dataLines: [String] = []

        for line in block.split(separator: "\n", omittingEmptySubsequences: false) {
            if line.hasPrefix(":") { continue }
            if line.hasPrefix("id:") {
                id = fieldValue(line.dropFirst(3))
            } else if line.hasPrefix("event:") {
                type = fieldValue(line.dropFirst(6))
            } else if line.hasPrefix("data:") {
                dataLines.append(fieldValue(line.dropFirst(5)))
            }
        }

        guard !dataLines.isEmpty else { return nil }
        return LiveSessionEvent(
            id: id,
            type: type,
            data: Data(dataLines.joined(separator: "\n").utf8)
        )
    }

    /// Per the SSE spec, exactly one space after the colon is stripped;
    /// everything else in the value is preserved.
    private func fieldValue(_ value: Substring) -> String {
        value.hasPrefix(" ") ? String(value.dropFirst()) : String(value)
    }
}

/// Incrementally assembles SSE events from a raw byte stream.
///
/// Do NOT parse SSE with `AsyncLineSequence` (`bytes.lines`): it silently
/// skips empty lines, and a blank line is exactly how SSE delimits events —
/// the delimiter never surfaces and no event ever completes. Feed raw bytes
/// here instead; a completed event is returned as the blank line arrives.
public struct SSEStreamAssembler: Sendable {
    private let parser = SSEParser()
    private var lineBuffer = [UInt8]()
    private var block = ""

    public init() {}

    /// Feeds one byte of the stream. Returns a parsed event when the byte
    /// completes an event block, nil otherwise.
    public mutating func feed(_ byte: UInt8) -> LiveSessionEvent? {
        guard byte == UInt8(ascii: "\n") else {
            lineBuffer.append(byte)
            return nil
        }
        var line = String(decoding: lineBuffer, as: UTF8.self)
        lineBuffer.removeAll(keepingCapacity: true)
        if line.hasSuffix("\r") {
            line.removeLast()
        }
        if line.isEmpty {
            defer { block = "" }
            return block.isEmpty ? nil : parser.parse(block)
        }
        block += line + "\n"
        return nil
    }
}
