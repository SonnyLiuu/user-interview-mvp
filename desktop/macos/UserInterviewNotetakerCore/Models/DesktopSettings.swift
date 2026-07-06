import Foundation

public struct DesktopSettings: Codable, Equatable, Sendable {
    public var apiBaseUrl: String
    public var hasOverlayPosition: Bool
    public var overlayX: Double
    public var overlayY: Double
    public var hasSeenOnboarding: Bool

    public init(
        apiBaseUrl: String = "http://127.0.0.1:8001",
        hasOverlayPosition: Bool = false,
        overlayX: Double = 0,
        overlayY: Double = 0,
        hasSeenOnboarding: Bool = false
    ) {
        self.apiBaseUrl = apiBaseUrl
        self.hasOverlayPosition = hasOverlayPosition
        self.overlayX = overlayX
        self.overlayY = overlayY
        self.hasSeenOnboarding = hasSeenOnboarding
    }

    public var normalizedApiBaseUrl: String {
        normalizeHttpBaseUrl(apiBaseUrl, fallback: "http://127.0.0.1:8001")
    }

    /// Next.js base URL derived from apiBaseUrl. In local dev FastAPI runs on
    /// 8001 and Next.js on 3000; for any other base URL assume both are served
    /// from the same origin rather than guessing a localhost port.
    public var normalizedNextBaseUrl: String {
        let fastApi = normalizedApiBaseUrl
        if let range = fastApi.range(of: ":8001") {
            var next = fastApi
            next.replaceSubrange(range, with: ":3000")
            return next
        }
        return fastApi
    }
}
