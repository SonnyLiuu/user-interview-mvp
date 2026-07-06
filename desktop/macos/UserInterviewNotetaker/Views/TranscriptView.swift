import SwiftUI

/// Transcript paste fallback for sessions where local audio capture is unavailable.
struct TranscriptView: View {
    @ObservedObject var viewModel: AppViewModel
    private weak var actionHandler: OverlayActionHandler?
    @State private var transcriptText = ""

    init(viewModel: AppViewModel, actionHandler: OverlayActionHandler?) {
        self.viewModel = viewModel
        self.actionHandler = actionHandler
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            BackHeader { [weak actionHandler] in actionHandler?.dismissAuxiliary() }

            Text("Add Transcript Text")
                .font(.system(size: 17, weight: .semibold))

            TextEditor(text: $transcriptText)
                .font(.system(size: 13))
                .frame(minHeight: 120, maxHeight: .infinity)
                .layoutPriority(1)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(nsColor: .separatorColor), lineWidth: 1)
                )

            HStack {
                Button("Send to Checklist") {
                    let trimmed = transcriptText.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmed.isEmpty else {
                        viewModel.message = "Transcript text is required."
                        return
                    }
                    actionHandler?.submitTranscript(trimmed)
                    transcriptText = ""
                }
                .keyboardShortcut(.defaultAction)

                Text(viewModel.message)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)

                Spacer()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
