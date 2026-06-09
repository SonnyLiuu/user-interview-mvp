import AppKit
import SwiftUI
import UserInterviewNotetakerCore

@MainActor
final class OverlayWindowController: NSWindowController {
    private let viewModel: AppViewModel
    private let settingsStore: SettingsStore

    init(
        viewModel: AppViewModel,
        settingsStore: SettingsStore,
        onStart: @escaping () -> Void,
        onEnd: @escaping () -> Void,
        onSettings: @escaping () -> Void,
        onToggleTopic: @escaping (Topic) -> Void
    ) {
        self.viewModel = viewModel
        self.settingsStore = settingsStore

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 360, height: 540),
            styleMask: [.titled, .fullSizeContentView, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.title = "User Interview Notetaker"
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.hidesOnDeactivate = false
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isMovableByWindowBackground = true

        let root = OverlayView(
            viewModel: viewModel,
            onStart: onStart,
            onEnd: onEnd,
            onSettings: onSettings,
            onToggleTopic: onToggleTopic
        )
        panel.contentViewController = NSHostingController(rootView: root)

        super.init(window: panel)
        restorePosition()
    }

    required init?(coder: NSCoder) {
        nil
    }

    func show() {
        window?.orderFrontRegardless()
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

        // Default: bottom-right corner of the main screen.
        let x = screenFrame.maxX - window.frame.width - 24
        let y = screenFrame.maxY - window.frame.height - 24
        window.setFrameOrigin(NSPoint(x: x, y: y))
    }
}
