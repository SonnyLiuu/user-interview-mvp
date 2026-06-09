import AppKit
import UserInterviewNotetakerCore

@MainActor
final class SettingsWindowController: NSWindowController {
    private let viewModel: AppViewModel
    private let settingsStore: SettingsStore
    private let onSignIn: () -> Void
    private let onClearAuth: () -> Void
    private let apiField = NSTextField()
    private let statusLabel = NSTextField(labelWithString: "")

    init(
        viewModel: AppViewModel,
        settingsStore: SettingsStore,
        onSignIn: @escaping () -> Void,
        onClearAuth: @escaping () -> Void
    ) {
        self.viewModel = viewModel
        self.settingsStore = settingsStore
        self.onSignIn = onSignIn
        self.onClearAuth = onClearAuth

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 440, height: 220),
            styleMask: [.titled, .closable],
            backing: .buffered,
            defer: false
        )
        window.title = "Notetaker Settings"
        window.center()

        super.init(window: window)
        window.contentView = buildView()
    }

    required init?(coder: NSCoder) {
        nil
    }

    private func buildView() -> NSView {
        let root = NSView(frame: NSRect(x: 0, y: 0, width: 440, height: 220))

        let title = NSTextField(labelWithString: "Desktop companion")
        title.font = .systemFont(ofSize: 17, weight: .semibold)
        title.frame = NSRect(x: 24, y: 170, width: 300, height: 24)
        root.addSubview(title)

        let label = NSTextField(labelWithString: "API base URL")
        label.frame = NSRect(x: 24, y: 128, width: 120, height: 22)
        root.addSubview(label)

        apiField.stringValue = viewModel.settings.apiBaseUrl
        apiField.frame = NSRect(x: 130, y: 126, width: 270, height: 26)
        root.addSubview(apiField)

        let save = NSButton(title: "Save", target: self, action: #selector(saveSettings))
        save.frame = NSRect(x: 24, y: 82, width: 80, height: 30)
        root.addSubview(save)

        let signIn = NSButton(title: "Sign In", target: self, action: #selector(signInTapped))
        signIn.frame = NSRect(x: 114, y: 82, width: 90, height: 30)
        root.addSubview(signIn)

        let clear = NSButton(title: "Clear Auth", target: self, action: #selector(clearAuthTapped))
        clear.frame = NSRect(x: 214, y: 82, width: 100, height: 30)
        root.addSubview(clear)

        statusLabel.stringValue = viewModel.authToken == nil ? "Not signed in." : "Signed in."
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.frame = NSRect(x: 24, y: 36, width: 380, height: 24)
        root.addSubview(statusLabel)

        return root
    }

    @objc private func saveSettings() {
        viewModel.settings.apiBaseUrl = apiField.stringValue
        try? settingsStore.save(viewModel.settings)
        statusLabel.stringValue = "Settings saved."
    }

    @objc private func signInTapped() {
        onSignIn()
    }

    @objc private func clearAuthTapped() {
        onClearAuth()
        statusLabel.stringValue = "Auth cleared."
    }

    func refreshStatus() {
        statusLabel.stringValue = viewModel.authToken == nil ? "Not signed in." : "Signed in."
    }
}
