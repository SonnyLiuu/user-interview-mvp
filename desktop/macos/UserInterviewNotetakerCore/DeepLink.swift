import Foundation

public struct FoundryDeepLink: Equatable, Sendable {
    public var action: String
    public var personId: String?
    public var token: String?
    public var zoomMeetingIdentifier: String?

    public init(action: String, personId: String? = nil, token: String? = nil, zoomMeetingIdentifier: String? = nil) {
        self.action = action
        self.personId = personId
        self.token = token
        self.zoomMeetingIdentifier = zoomMeetingIdentifier
    }
}

public enum DeepLinkParser {
    public static func parse(_ raw: String) -> FoundryDeepLink? {
        guard let components = URLComponents(string: raw),
              components.scheme?.lowercased() == "foundry"
        else {
            return nil
        }

        let host = components.host ?? ""
        let path = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let action = [host, path].filter { !$0.isEmpty }.joined(separator: "/")
        guard !action.isEmpty else { return nil }

        let query = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { item in
            (item.name, item.value ?? "")
        })
        return FoundryDeepLink(
            action: action,
            personId: query["personId"],
            token: query["token"],
            zoomMeetingIdentifier: query["zoomMeetingIdentifier"]
        )
    }
}
