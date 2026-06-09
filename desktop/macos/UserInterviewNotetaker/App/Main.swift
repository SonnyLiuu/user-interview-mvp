import AppKit

@main
struct UserInterviewNotetakerMain {
    @MainActor
    static func main() {
        let app = NSApplication.shared
        let delegate = AppDelegate()
        app.delegate = delegate
        // NSApplication.delegate is a strong reference — delegate outlives this scope.
        app.setActivationPolicy(.accessory)
        app.run()
    }
}
