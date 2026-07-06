import AppKit
import SwiftUI
import UserInterviewNotetakerCore

@MainActor
final class OverlayWindowController: NSWindowController, NSWindowDelegate {
    private let viewModel: AppViewModel
    private let settingsStore: SettingsStore
    private weak var actionHandler: OverlayActionHandler?

    init(
        viewModel: AppViewModel,
        settingsStore: SettingsStore,
        actionHandler: OverlayActionHandler?
    ) {
        self.viewModel = viewModel
        self.settingsStore = settingsStore
        self.actionHandler = actionHandler

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 460, height: 620),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "User Interview Notetaker"
        window.level = .floating
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        window.isReleasedWhenClosed = false
        window.isMovableByWindowBackground = true
        window.minSize = NSSize(width: 460, height: 360)
        window.maxSize = NSSize(width: 460, height: 620)
        window.standardWindowButton(.zoomButton)?.isHidden = true

        let root = OverlayView(
            viewModel: viewModel,
            actionHandler: actionHandler
        )
        window.contentViewController = NSHostingController(rootView: root)

        super.init(window: window)
        window.delegate = self
        restorePosition()
    }

    required init?(coder: NSCoder) {
        nil
    }

    func show() {
        window?.makeKeyAndOrderFront(nil)
    }

    func persistPosition() {
        guard let window else { return }
        viewModel.settings.hasOverlayPosition = true
        viewModel.settings.overlayX = window.frame.origin.x
        viewModel.settings.overlayY = window.frame.origin.y
        try? settingsStore.save(viewModel.settings)
    }

    private func restorePosition() {
        guard let window else { return }
        let screenFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)

        if viewModel.settings.hasOverlayPosition {
            let saved = NSPoint(x: viewModel.settings.overlayX, y: viewModel.settings.overlayY)
            // Validate the saved origin is still on a visible screen.
            let screens = NSScreen.screens
            let onScreen = screens.contains { screen in
                let vis = screen.visibleFrame
                return saved.x >= vis.minX && saved.y >= vis.minY
                    && (saved.x + window.frame.width) <= vis.maxX
                    && (saved.y + 20) <= vis.maxY // allow at least 20pt of the window to show
            }
            if onScreen {
                window.setFrameOrigin(saved)
                return
            }
        }

        // Default: top-right corner of the main screen (AppKit origins are
        // bottom-left, so maxY - height puts the window's top near the top).
        let x = screenFrame.maxX - window.frame.width - 24
        let y = screenFrame.maxY - window.frame.height - 24
        window.setFrameOrigin(NSPoint(x: x, y: y))
    }

    func windowWillClose(_ notification: Notification) {
        persistPosition()
    }
}
