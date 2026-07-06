import Foundation

public struct DesktopPerson: Codable, Identifiable, Equatable, Sendable {
    public var id: String
    public var name: String
    public var title: String?
    public var company: String?
    public var startupName: String?
    public var startupId: String?
    public var startupSlug: String?
    public var projectName: String?
    public var projectId: String?
    public var projectSlug: String?

    public init(
        id: String,
        name: String,
        title: String? = nil,
        company: String? = nil,
        startupName: String? = nil,
        startupId: String? = nil,
        startupSlug: String? = nil,
        projectName: String? = nil,
        projectId: String? = nil,
        projectSlug: String? = nil
    ) {
        self.id = id
        self.name = name
        self.title = title
        self.company = company
        self.startupName = startupName
        self.startupId = startupId
        self.startupSlug = startupSlug
        self.projectName = projectName
        self.projectId = projectId
        self.projectSlug = projectSlug
    }

    public var subtitle: String {
        [title, company, startupName, projectName]
            .compactMap { value in
                let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines)
                return trimmed?.isEmpty == false ? trimmed : nil
            }
            .joined(separator: " - ")
    }
}
