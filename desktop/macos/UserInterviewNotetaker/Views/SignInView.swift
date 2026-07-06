import SwiftUI

/// Sign-in form for dev auth. Requires DESKTOP_DEV_AUTH_ENABLED=true on the FastAPI service.
struct SignInView: View {
    @ObservedObject var viewModel: AppViewModel
    private weak var actionHandler: OverlayActionHandler?
    @State private var devEmail = ""

    init(viewModel: AppViewModel, actionHandler: OverlayActionHandler?) {
        self.viewModel = viewModel
        self.actionHandler = actionHandler
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            BackHeader { [weak actionHandler] in actionHandler?.dismissAuxiliary() }

            Text("Sign in to User Interview")
                .font(.system(size: 17, weight: .semibold))

            VStack(alignment: .leading, spacing: 6) {
                Text("Email")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                TextField("you@example.com", text: $devEmail)
                    .textFieldStyle(.roundedBorder)
            }

            Button("Sign In") {
                actionHandler?.signInWithDevToken(email: devEmail)
            }
            .keyboardShortcut(.defaultAction)

            Text("Requires DESKTOP_DEV_AUTH_ENABLED=true on the FastAPI service.")
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
