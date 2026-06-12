import SwiftUI
import UserInterviewNotetakerCore

struct PersonPickerView: View {
    @ObservedObject var viewModel: AppViewModel
    private weak var actionHandler: OverlayActionHandler?

    init(viewModel: AppViewModel, actionHandler: OverlayActionHandler?) {
        self.viewModel = viewModel
        self.actionHandler = actionHandler
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            filters
            Divider().padding(.vertical, 8)
            if viewModel.isLoadingPeople {
                Spacer()
                HStack {
                    Spacer()
                    ProgressView().scaleEffect(0.8)
                    Spacer()
                }
                Spacer()
            } else if viewModel.filteredPeople.isEmpty {
                Spacer()
                VStack(spacing: 8) {
                    Text(viewModel.message)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 24)
                Spacer()
            } else {
                peopleList
            }
        }
        .frame(maxHeight: .infinity, alignment: .topLeading)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Button {
                actionHandler?.dismissPicker()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .semibold))
            }
            .buttonStyle(.borderless)
            .help("Back")

            Text("Start Session")
                .font(.system(size: 15, weight: .semibold))

            Spacer()

            Button {
                actionHandler?.refreshPeople()
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 13))
            }
            .buttonStyle(.borderless)
            .help("Refresh people list")

            Button {
                actionHandler?.openSettings()
            } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 13))
            }
            .buttonStyle(.borderless)
            .help("Settings")
        }
        .padding(.bottom, 8)
    }

    private var filters: some View {
        HStack(spacing: 8) {
            // Startup dropdown
            VStack(alignment: .leading, spacing: 2) {
                Text("Startup")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.secondary)
                Picker("Startup", selection: $viewModel.selectedStartup) {
                    Text("All Startups").tag(nil as String?)
                    ForEach(viewModel.availableStartups, id: \.self) { startup in
                        Text(startup).tag(startup as String?)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .frame(maxWidth: .infinity)
                .onChange(of: viewModel.selectedStartup) { _ in
                    viewModel.selectedProject = nil
                }
            }

            // Project dropdown
            VStack(alignment: .leading, spacing: 2) {
                Text("Project")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(.secondary)
                Picker("Project", selection: $viewModel.selectedProject) {
                    Text("All Projects").tag(nil as String?)
                    ForEach(viewModel.availableProjects, id: \.self) { project in
                        Text(project).tag(project as String?)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                .frame(maxWidth: .infinity)
            }
        }
    }

    private var peopleList: some View {
        ScrollView {
            LazyVStack(spacing: 6) {
                ForEach(viewModel.filteredPeople) { person in
                    personRow(person)
                }
            }
            .padding(.vertical, 4)
        }
        .frame(maxHeight: .infinity)
    }

    private func personRow(_ person: DesktopPerson) -> some View {
        Button {
            actionHandler?.selectPerson(person)
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(person.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)

                if !person.subtitle.isEmpty {
                    Text(person.subtitle)
                        .font(.system(size: 11))
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(nsColor: .controlBackgroundColor))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 6)
                    .stroke(Color(nsColor: .separatorColor).opacity(0.4), lineWidth: 0.5)
            )
        }
        .buttonStyle(.plain)
    }
}
