import AppKit
import WebKit
import UserInterviewNotetakerCore

@MainActor
final class AuthWindowController: NSWindowController, WKScriptMessageHandler {
    private let apiBaseUrl: String
    private let onToken: (String) -> Void
    private let onError: (String) -> Void
    private let webView: WKWebView

    init(apiBaseUrl: String, onToken: @escaping (String) -> Void, onError: @escaping (String) -> Void) {
        self.apiBaseUrl = apiBaseUrl
        self.onToken = onToken
        self.onError = onError

        let userContent = WKUserContentController()
        let config = WKWebViewConfiguration()
        config.userContentController = userContent
        webView = WKWebView(frame: .zero, configuration: config)

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 460, height: 680),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Sign in to User Interview"
        window.center()
        window.contentView = webView

        super.init(window: window)
        userContent.add(WeakScriptMessageHandler(self), name: "foundryDesktop")
    }

    required init?(coder: NSCoder) {
        nil
    }

    func load() {
        guard let url = URL(string: apiBaseUrl + "/desktop-auth") else {
            onError("Invalid API base URL.")
            return
        }
        webView.load(URLRequest(url: url))
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let type = body["type"] as? String
        else {
            return
        }

        if type == "desktopAuthToken", let token = body["token"] as? String, !token.isEmpty {
            onToken(token)
            close()
            return
        }

        if type == "desktopAuthError" {
            onError((body["error"] as? String) ?? "Could not sign in.")
        }
    }
}
