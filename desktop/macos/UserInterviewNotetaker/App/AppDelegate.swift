import AppKit
import Foundation
import UserInterviewNotetakerCore

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, OverlayActionHandler {
    private let viewModel = AppViewModel()
    private let settingsStore = SettingsStore()
    private let tokenStore = KeychainTokenStore()
    private let desktopAPI = DesktopAPIClient()

    private let sessionOrchestrator: SessionOrchestrator
    private let audioCoordinator: AudioCaptureCoordinator

    private var statusItem: NSStatusItem?
    private var overlayWindow: OverlayWindowController?
    private var pendingDeepLink: String?
    private var retryDeepLinkOnUnauthorized: String?

    override init() {
        sessionOrchestrator = SessionOrchestrator(viewModel: viewModel)
        audioCoordinator = AudioCaptureCoordinator(viewModel: viewModel)
        super.init()
        wireOrchestrators()
    }

    private func wireOrchestrators() {
        sessionOrchestrator.onAudioStart = { [weak self] foundryBaseUrl, sessionId, liveToken in
            self?.audioCoordinator.start(foundryBaseUrl: foundryBaseUrl, sessionId: sessionId, liveToken: liveToken)
        }
        sessionOrchestrator.onAudioStop = { [weak self] in
            self?.audioCoordinator.stop()
        }
        sessionOrchestrator.onUnauthorized = { [weak self] in
            guard let self else { return }
            let retryDeepLink = self.retryDeepLinkOnUnauthorized
            self.retryDeepLinkOnUnauthorized = nil
            self.clearAuth()
            if let retryDeepLink {
                self.pendingDeepLink = retryDeepLink
            }
            self.openSignIn()
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        viewModel.settings = settingsStore.load()
        viewModel.authToken = tokenStore.load()

        if viewModel.authToken == nil {
            if viewModel.settings.hasSeenOnboarding {
                viewModel.overlayMode = .signIn
                viewModel.message = "Sign in to connect the desktop app."
            } else {
                viewModel.overlayMode = .onboarding
            }
        } else {
            openPicker()
        }
        registerURLHandler()
        setupStatusItem()
        setupOverlay()
        overlayWindow?.show()
    }

    func applicationWillTerminate(_ notification: Notification) {
        overlayWindow?.persistPosition()
        sessionOrchestrator.cancelMonitoring()
        audioCoordinator.stop()
    }

    // MARK: URL Handling

    /// Registers for `foundry://` deep links while the app is already running.
    /// Uses the legacy Carbon Apple Event API (deprecated in macOS 14).
    /// Cold-launch URLs are handled by `application(_:open:)` below.
    /// TODO(v2): Drop `NSAppleEventManager` when the minimum target moves to macOS 14+.
    private func registerURLHandler() {
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handleGetURLEvent(_:withReplyEvent:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )
    }

    private func setupStatusItem() {
        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        item.button?.title = "UI"

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Show Notetaker", action: #selector(showOverlay), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Start Session", action: #selector(startSession), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Paste Transcript...", action: #selector(openTranscriptFallback), keyEquivalent: ""))
        menu.addItem(NSMenuItem(title: "Settings...", action: #selector(openSettings), keyEquivalent: ","))
        menu.addItem(NSMenuItem.separator())
        menu.addItem(NSMenuItem(title: "Quit", action: #selector(quit), keyEquivalent: "q"))
        item.menu = menu
        statusItem = item
    }

    private func setupOverlay() {
        overlayWindow = OverlayWindowController(
            viewModel: viewModel,
            settingsStore: settingsStore,
            actionHandler: self
        )
    }

    @objc private func handleGetURLEvent(_ event: NSAppleEventDescriptor, withReplyEvent replyEvent: NSAppleEventDescriptor) {
        guard let raw = event.paramDescriptor(forKeyword: keyDirectObject)?.stringValue else {
            return
        }
        handleDeepLink(raw)
    }

    @objc private func showOverlay() {
        overlayWindow?.show()
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc func startSession() {
        showOverlay()
        viewModel.overlayMode = .main
        guard viewModel.authToken != nil else {
            viewModel.message = "Sign in before starting a session."
            openSignIn()
            return
        }
        openPicker()
    }

    private func openPicker() {
        viewModel.overlayMode = .main
        viewModel.status = .pickingPerson
        viewModel.resetPicker()
        guard let authToken = viewModel.authToken else { return }
        Task {
            await viewModel.loadPeople(
                using: desktopAPI,
                apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                authToken: authToken
            )
        }
    }

    func selectPerson(_ person: DesktopPerson) {
        // A picker-started session supersedes any deep link that failed
        // earlier; a later 401 must not resurrect it.
        retryDeepLinkOnUnauthorized = nil
        sessionOrchestrator.selectPerson(person)
    }

    func returnToPeopleList() {
        sessionOrchestrator.returnToPeopleList()
    }

    func startMonitoring() {
        sessionOrchestrator.startMonitoring()
        viewModel.hasStartedSession = true
    }

    func refreshPeople() {
        sessionOrchestrator.refreshPeople()
    }

    func dismissPicker() {
        viewModel.resetPicker()
        viewModel.status = .idle
        viewModel.message = "Ready."
    }

    @objc func openSettings() {
        viewModel.overlayMode = .settings
        showOverlay()
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func openTranscriptFallback() {
        guard viewModel.isActive else {
            viewModel.message = "Start a live session before adding transcript text."
            showOverlay()
            return
        }
        viewModel.overlayMode = .transcript
        showOverlay()
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func quit() {
        NSApp.terminate(nil)
    }

    func openSignIn() {
        viewModel.overlayMode = .signIn
        showOverlay()
        NSApp.activate(ignoringOtherApps: true)
    }

    private func finishAuth(_ token: String) {
        do {
            try tokenStore.save(token)
            viewModel.authToken = token
            viewModel.message = "Signed in."
            if let pendingDeepLink {
                self.pendingDeepLink = nil
                viewModel.overlayMode = .main
                handleDeepLink(pendingDeepLink)
            } else {
                openPicker()
            }
        } catch {
            viewModel.message = "Could not save auth token."
        }
    }

    func signInWithDevToken(email: String) {
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            viewModel.message = "Email is required."
            return
        }
        viewModel.message = "Connecting to local backend..."
        Task {
            do {
                let response = try await desktopAPI.devAuthToken(
                    apiBaseUrl: viewModel.settings.normalizedApiBaseUrl,
                    email: trimmed
                )
                finishAuth(response.token)
            } catch {
                viewModel.message = error.localizedDescription
            }
        }
    }

    func clearAuth() {
        tokenStore.clear()
        viewModel.authToken = nil
        viewModel.message = "Auth cleared."
    }

    func saveSettings() {
        try? settingsStore.save(viewModel.settings)
        viewModel.message = "Settings saved."
    }

    func dismissAuxiliary() {
        viewModel.overlayMode = .main
        viewModel.savedCallSummary = nil
    }

    private func handleDeepLink(_ raw: String) {
        showOverlay()
        guard let link = DeepLinkParser.parse(raw),
              link.action == "call/start",
              let personId = link.personId,
              link.token != nil
        else {
            viewModel.message = "Ignoring malformed foundry link."
            return
        }
        viewModel.overlayMode = .main

        guard viewModel.authToken != nil else {
            pendingDeepLink = raw
            viewModel.message = "Sign in to start the call."
            openSignIn()
            return
        }

        retryDeepLinkOnUnauthorized = raw
        sessionOrchestrator.startFromDeepLink(
            personId: personId,
            zoomMeetingIdentifier: link.zoomMeetingIdentifier,
            onStarted: { [weak self] in
                self?.retryDeepLinkOnUnauthorized = nil
            }
        )
    }

    func toggleTopic(_ topic: Topic) {
        sessionOrchestrator.toggleTopic(topic)
    }

    func submitTranscript(_ text: String) {
        sessionOrchestrator.submitTranscript(text)
    }

    func reviewSession() {
        sessionOrchestrator.prepareReviewSession()
    }

    func saveReviewedSession() {
        sessionOrchestrator.saveSession(preserveCurrentTranscript: true)
    }

    /// Direct end (deep links / status bar) skips review.
    func endSession() {
        sessionOrchestrator.endSession()
    }

    // Handle URLs when app is launched cold via a foundry:// link.
    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls {
            handleDeepLink(url.absoluteString)
        }
    }
}
