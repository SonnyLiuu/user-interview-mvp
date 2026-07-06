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
            ScrollView {
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
                        .frame(height: 360)
                        .overlay(
                            RoundedRectangle(cornerRadius: 6)
                                .stroke(Color(nsColor: .separatorColor), lineWidth: 1)
                        )

                    let questions = viewModel.topics.filter { $0.category == .question }
                    if !questions.isEmpty {
                        Text("Questions asked")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 4) {
                            ForEach(questions) { topic in
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
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            HStack {
                Text(viewModel.message)
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                Spacer()
                Button("Back") {
                    actionHandler?.dismissAuxiliary()
                }
                .keyboardShortcut(.cancelAction)
                Button("Save") {
                    viewModel.liveTranscriptRaw = editedTranscript
                    actionHandler?.saveReviewedSession()
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.defaultAction)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
