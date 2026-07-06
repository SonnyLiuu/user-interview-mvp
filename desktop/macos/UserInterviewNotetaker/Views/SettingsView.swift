import SwiftUI

/// Settings form for the backend API URL and auth state.
struct SettingsView: View {
    @ObservedObject var viewModel: AppViewModel
    private weak var actionHandler: OverlayActionHandler?

    init(viewModel: AppViewModel, actionHandler: OverlayActionHandler?) {
        self.viewModel = viewModel
        self.actionHandler = actionHandler
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            BackHeader { [weak actionHandler] in actionHandler?.dismissAuxiliary() }

            Text("Settings")
                .font(.system(size: 17, weight: .semibold))

            VStack(alignment: .leading, spacing: 6) {
                Text("Backend API URL")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                TextField("http://127.0.0.1:8001", text: $viewModel.settings.apiBaseUrl)
                    .textFieldStyle(.roundedBorder)
            }

            HStack(spacing: 8) {
                Button("Save") { actionHandler?.saveSettings() }
                    .keyboardShortcut(.defaultAction)

                if viewModel.authToken == nil {
                    Button("Sign In") { actionHandler?.openSignIn() }
                } else {
                    Button("Clear Auth") { actionHandler?.clearAuth() }
                }
            }

            Text(viewModel.authToken == nil ? "Not signed in." : "Signed in.")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)

            Text(viewModel.message)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
