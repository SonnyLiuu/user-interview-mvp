import Foundation

/// Normalizes a user-entered base URL: trims whitespace, falls back when
/// empty, prepends `http://` when no scheme is given, and strips trailing
/// slashes so paths can be appended directly.
public func normalizeHttpBaseUrl(_ raw: String?, fallback: String) -> String {
    let trimmed = raw?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    var value = trimmed.isEmpty ? fallback : trimmed
    if !value.lowercased().hasPrefix("http://") && !value.lowercased().hasPrefix("https://") {
        value = "http://" + value
    }
    while value.last == "/" {
        value.removeLast()
    }
    return value
}
