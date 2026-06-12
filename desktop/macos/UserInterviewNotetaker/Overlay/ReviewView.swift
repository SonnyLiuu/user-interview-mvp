import SwiftUI

/// Shown after clicking "End Session" — lets the user review and edit
/// the transcript before final save.
struct ReviewView: View {
    @ObservedObject var viewModel: AppViewModel
    private weak var actionHandler: OverlayActionHandler?
    @State private var editedTranscript: String = ""

    init(viewModel: AppViewModel, actionHandler: OverlayActionHandler?) {
        self.viewModel = viewModel
        self.actionHandler = actionHandler
        _editedTranscript = State(initialValue: viewModel.liveTranscriptRaw)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("Review & Save")
                    .font(.system(size: 17, weight: .semibold))
                Spacer()
            }

            Text("Edit the transcript below, then click Save.")
                .font(.system(size: 12))
                .foregroundStyle(.secondary)

            TextEditor(text: $editedTranscript)
                .font(.system(size: 13, design: .monospaced))
                .frame(minHeight: 280)
                .overlay(
                    RoundedRectangle(cornerRadius: 6)
                        .stroke(Color(nsColor: .separatorColor), lineWidth: 1)
                )

            if !viewModel.topics.isEmpty {
                Text("Topic summary")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(.secondary)
                ScrollView {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(viewModel.topics.filter { $0.category != .signal }) { topic in
                            HStack(spacing: 6) {
                                Image(systemName: topic.checked ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(topic.checked ? Color.green : Color.secondary)
                                    .font(.system(size: 12))
                                Text(topic.label)
                                    .font(.system(size: 12))
                                    .strikethrough(topic.checked)
                                    .foregroundStyle(topic.checked ? .secondary : .primary)
                            }
                        }
                    }
                }
                .frame(maxHeight: 160)
            }

            HStack {
                Text(viewModel.message)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                Spacer()
                Button("Save") {
                    viewModel.liveTranscriptRaw = editedTranscript
                    actionHandler?.saveReviewedSession()
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
