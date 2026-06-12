import SwiftUI
import UserInterviewNotetakerCore

struct OverlayView: View {
    @ObservedObject var viewModel: AppViewModel
    var onStart: () -> Void
    var onEnd: () -> Void
    var onSettings: () -> Void
    var onSaveSettings: () -> Void
    var onSignIn: () -> Void
    var onClearAuth: () -> Void
    var onBackFromAuxiliary: () -> Void
    var onDevSignIn: (String) -> Void
    var onAuthToken: (String) -> Void
    var onAuthError: (String) -> Void
    var onSubmitTranscript: (String) -> Void
    var onToggleTopic: (Topic) -> Void
    var onSelectPerson: (DesktopPerson) -> Void
    var onRefreshPeople: () -> Void
    var onBackFromPicker: () -> Void
    @State private var transcriptText = ""
    @State private var devEmail = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if viewModel.overlayMode == .settings {
                settingsView
            } else if viewModel.overlayMode == .signIn {
                signInView
            } else if viewModel.overlayMode == .transcript {
                transcriptView
            } else if viewModel.status == .pickingPerson {
                PersonPickerView(
                    viewModel: viewModel,
                    onSelectPerson: onSelectPerson,
                    onRefresh: onRefreshPeople,
                    onBack: onBackFromPicker
                )
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
        .frame(minHeight: 220, alignment: .topLeading)
        .background(Color(nsColor: .windowBackgroundColor))
    }

    private var auxiliaryHeader: some View {
        HStack(spacing: 8) {
            Button(action: onBackFromAuxiliary) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .semibold))
            }
            .buttonStyle(.borderless)
            .help("Back")

            Spacer()
        }
    }

    private var settingsView: some View {
        VStack(alignment: .leading, spacing: 14) {
            auxiliaryHeader

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
                Button("Save", action: onSaveSettings)
                    .keyboardShortcut(.defaultAction)

                if viewModel.authToken == nil {
                    Button("Sign In", action: onSignIn)
                } else {
                    Button("Clear Auth", action: onClearAuth)
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

    private var signInView: some View {
        VStack(alignment: .leading, spacing: 14) {
            auxiliaryHeader

            Text("Sign in to User Interview")
                .font(.system(size: 17, weight: .semibold))

            VStack(alignment: .leading, spacing: 6) {
                Text("Email")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(.secondary)
                TextField("you@example.com", text: $devEmail)
                    .textFieldStyle(.roundedBorder)
            }

            Button("Use Local Backend") {
                onDevSignIn(devEmail)
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

    private var transcriptView: some View {
        VStack(alignment: .leading, spacing: 12) {
            auxiliaryHeader

            Text("Add Transcript Text")
                .font(.system(size: 17, weight: .semibold))

            TextEditor(text: $transcriptText)
                .font(.system(size: 13))
                .frame(minHeight: 360)
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
                    onSubmitTranscript(trimmed)
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
            Button("Add Transcript") {
                viewModel.overlayMode = .transcript
            }
            Spacer()
            Button("End Session") {
                onEnd()
            }
            .keyboardShortcut("e", modifiers: [.command, .shift])
        }
    }
}
