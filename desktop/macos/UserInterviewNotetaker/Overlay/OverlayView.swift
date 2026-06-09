import SwiftUI
import UserInterviewNotetakerCore

struct OverlayView: View {
    @ObservedObject var viewModel: AppViewModel
    var onStart: () -> Void
    var onEnd: () -> Void
    var onSettings: () -> Void
    var onToggleTopic: (Topic) -> Void
    var onSelectPerson: (DesktopPerson) -> Void
    var onRefreshPeople: () -> Void
    var onBackFromPicker: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if viewModel.status != .pickingPerson {
                header
            }
            if viewModel.isActive {
                topicList
                footer
            } else if viewModel.status == .pickingPerson {
                PersonPickerView(
                    viewModel: viewModel,
                    onSelectPerson: onSelectPerson,
                    onRefresh: onRefreshPeople,
                    onBack: onBackFromPicker
                )
            } else {
                idle
            }
        }
        .padding(14)
        .frame(width: 360)
        .frame(minHeight: 220)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var header: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text(viewModel.selectedPersonName.isEmpty ? "User Interview Notetaker" : viewModel.selectedPersonName)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(1)
                HStack(spacing: 4) {
                    if viewModel.isCapturingAudio {
                        Circle()
                            .fill(Color.red)
                            .frame(width: 6, height: 6)
                        Text("Recording")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(Color.red)
                    }
                    Text(viewModel.audioCaptureError ?? viewModel.realtimeError ?? viewModel.message)
                        .font(.system(size: 12))
                        .foregroundStyle((viewModel.realtimeError ?? viewModel.audioCaptureError) == nil ? Color.secondary : Color.red)
                        .lineLimit(2)
                }
            }
            Spacer()
            Button(action: onSettings) {
                Image(systemName: "gearshape")
            }
            .buttonStyle(.borderless)
            .help("Settings")
        }
    }

    private var idle: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Pick a person to start a live call checklist, or open a scheduled person in the web app.")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button("Start Session", action: onStart)
                .keyboardShortcut(.defaultAction)
        }
    }

    private var topicList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                section(title: "Goals", topics: viewModel.topics.filter { $0.category == .goal })
                section(title: "Questions", topics: viewModel.topics.filter { $0.category == .question })
                section(title: "Signals", topics: viewModel.topics.filter { $0.category == .signal })
            }
        }
        .frame(maxHeight: 430)
    }

    private func section(title: String, topics: [Topic]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if !topics.isEmpty {
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.secondary)
                ForEach(topics) { topic in
                    Button {
                        onToggleTopic(topic)
                    } label: {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: topic.checked ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(topic.checked ? Color.green : Color.secondary)
                                .frame(width: 16)
                            Text(topic.label)
                                .font(.system(size: 13))
                                .strikethrough(topic.checked)
                                .foregroundStyle(topic.checked ? .secondary : .primary)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 0)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var footer: some View {
        HStack {
            if !viewModel.isActive {
                Text("Idle")
                    .font(.system(size: 12))
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("End Session") {
                onEnd()
            }
            .keyboardShortcut("e", modifiers: [.command, .shift])
        }
    }
}
