import SwiftUI

/// Shown on first launch to introduce the app before sign-in.
struct OnboardingView: View {
    @ObservedObject var viewModel: AppViewModel
    private weak var actionHandler: OverlayActionHandler?

    init(viewModel: AppViewModel, actionHandler: OverlayActionHandler?) {
        self.viewModel = viewModel
        self.actionHandler = actionHandler
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 16) {
                Image(systemName: "list.bullet.clipboard.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(.blue)

                Text("User Interview\nNotetaker")
                    .font(.system(size: 24, weight: .bold))
                    .multilineTextAlignment(.center)

                Text("A live checklist companion for user interview calls.\nStart a session to track goals, questions, and signals in real time as you talk.")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                    .lineSpacing(4)
            }
            .padding(.horizontal, 32)

            Spacer()

            VStack(spacing: 10) {
                Button {
                    dismissOnboarding()
                } label: {
                    Text("Get Started")
                        .font(.system(size: 14, weight: .semibold))
                        .frame(maxWidth: .infinity)
                        .frame(height: 36)
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)

                Text("You'll be asked to sign in with your email.")
                    .font(.system(size: 11))
                    .foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 32)
            .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func dismissOnboarding() {
        viewModel.settings.hasSeenOnboarding = true
        actionHandler?.saveSettings()
        actionHandler?.openSignIn()
    }
}
