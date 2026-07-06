import SwiftUI
import UserInterviewNotetakerCore

struct OverlayView: View {
    @ObservedObject var viewModel: AppViewModel
    private weak var actionHandler: OverlayActionHandler?

    init(viewModel: AppViewModel, actionHandler: OverlayActionHandler?) {
        self.viewModel = viewModel
        self.actionHandler = actionHandler
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if viewModel.overlayMode == .onboarding {
                OnboardingView(viewModel: viewModel, actionHandler: actionHandler)
            } else if viewModel.overlayMode == .settings {
                SettingsView(viewModel: viewModel, actionHandler: actionHandler)
            } else if viewModel.overlayMode == .signIn {
                SignInView(viewModel: viewModel, actionHandler: actionHandler)
            } else if viewModel.overlayMode == .transcript {
                TranscriptView(viewModel: viewModel, actionHandler: actionHandler)
            } else if viewModel.overlayMode == .review {
                ReviewView(viewModel: viewModel, actionHandler: actionHandler)
            } else if viewModel.overlayMode == .saveConfirmation {
                SaveConfirmationView(viewModel: viewModel, actionHandler: actionHandler)
            } else if viewModel.status == .pickingPerson {
                PersonPickerView(viewModel: viewModel, actionHandler: actionHandler)
            } else {
                header
                if viewModel.isActive {
                    topicList
                    footer
                } else {
                    idle
                }
            }
        }
        .padding(14)
        .frame(width: 460, alignment: .topLeading)
        .frame(minHeight: 220, maxHeight: .infinity, alignment: .topLeading)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var header: some View {
        HStack(spacing: 10) {
            if canReturnToPeopleList {
                Button {
                    actionHandler?.returnToPeopleList()
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 14, weight: .semibold))
                }
                .buttonStyle(.borderless)
                .help("Back to people")
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(viewModel.selectedPersonName.isEmpty ? "User Interview Notetaker" : viewModel.selectedPersonName)
                    .font(.system(size: 15, weight: .semibold))
                    .lineLimit(1)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        if viewModel.isCapturingAudio {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 6, height: 6)
                            Text("Recording")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(Color.red)
                        }
                        Text(primaryStatusText)
                            .font(.system(size: 12))
                            .foregroundStyle(primaryStatusIsError ? Color.red : Color.secondary)
                            .lineLimit(1)
                    }
                    if let warning = viewModel.systemAudioCaptureWarning {
                        Text(warning)
                            .font(.system(size: 11))
                            .foregroundStyle(Color.orange)
                            .lineLimit(1)
                    }
                }
            }
            Spacer()
        }
    }

    private var primaryStatusText: String {
        if let error = viewModel.audioCaptureError ?? viewModel.realtimeError {
            return error
        }
        if viewModel.isCapturingAudio {
            return "Mic audio streaming"
        }
        return viewModel.message
    }

    private var primaryStatusIsError: Bool {
        (viewModel.audioCaptureError ?? viewModel.realtimeError) != nil
    }

    private var canReturnToPeopleList: Bool {
        viewModel.isActive
    }

    private var idle: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Pick a person to start a live call checklist, or open a scheduled person in the web app.")
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Button("Start Session") { actionHandler?.startSession() }
                .keyboardShortcut(.defaultAction)
        }
    }

    private var topicList: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                section(title: "Questions", topics: viewModel.topics.filter { $0.category == .question })
            }
        }
        .frame(maxHeight: .infinity)
    }

    private func section(title: String, topics: [Topic]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if !topics.isEmpty {
                Text(title)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(.secondary)
                ForEach(topics) { topic in
                    Button {
                        actionHandler?.toggleTopic(topic)
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
            Button("Add Transcript") {
                viewModel.overlayMode = .transcript
            }
            Spacer()
            if viewModel.hasStartedSession {
                Button("End Session") {
                    actionHandler?.reviewSession()
                }
                .keyboardShortcut("e", modifiers: [.command, .shift])
            } else {
                Button("Start Session") {
                    actionHandler?.startMonitoring()
                }
                .keyboardShortcut(.defaultAction)
            }
        }
    }
}
