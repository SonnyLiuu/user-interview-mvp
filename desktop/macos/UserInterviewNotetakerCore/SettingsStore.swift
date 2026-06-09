import Foundation

public final class SettingsStore: Sendable {
    private let fileURL: URL
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(fileManager: FileManager = .default) {
        let support = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? URL(fileURLWithPath: NSTemporaryDirectory())
        let directory = support.appendingPathComponent("User Interview Notetaker", isDirectory: true)
        try? fileManager.createDirectory(at: directory, withIntermediateDirectories: true)
        fileURL = directory.appendingPathComponent("desktop-settings.json")
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    }

    public init(fileURL: URL) {
        self.fileURL = fileURL
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
    }

    public func load() -> DesktopSettings {
        guard let data = try? Data(contentsOf: fileURL) else {
            return DesktopSettings()
        }
        return (try? decoder.decode(DesktopSettings.self, from: data)) ?? DesktopSettings()
    }

    public func save(_ settings: DesktopSettings) throws {
        let data = try encoder.encode(settings)
        try data.write(to: fileURL, options: [.atomic])
    }
}
