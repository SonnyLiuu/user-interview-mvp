import SwiftUI

/// Shown after a call is saved: a brief confirmation with the person and
/// topic coverage, auto-returning to the main screen after a moment.
struct SaveConfirmationView: View {
    @ObservedObject var viewModel: AppViewModel
    private weak var actionHandler: OverlayActionHandler?

    init(viewModel: AppViewModel, actionHandler: OverlayActionHandler?) {
        self.viewModel = viewModel
        self.actionHandler = actionHandler
    }

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 14) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 52))
                    .foregroundStyle(.green)

                Text("Call saved")
                    .font(.system(size: 20, weight: .bold))

                if let summary = viewModel.savedCallSummary {
                    VStack(spacing: 4) {
                        if !summary.personName.isEmpty {
                            Text(summary.personName)
                                .font(.system(size: 13, weight: .medium))
                        }
                        if summary.totalTopics > 0 {
                            Text("\(summary.coveredTopics) of \(summary.totalTopics) topics covered")
                                .font(.system(size: 12))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }

            Spacer()

            Button("Done") {
                actionHandler?.dismissAuxiliary()
            }
            .keyboardShortcut(.defaultAction)
            .padding(.bottom, 24)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .task {
            // Auto-return to the main screen; cancelled automatically if the
            // user dismisses first.
            try? await Task.sleep(nanoseconds: 2_500_000_000)
            actionHandler?.dismissAuxiliary()
        }
    }
}
