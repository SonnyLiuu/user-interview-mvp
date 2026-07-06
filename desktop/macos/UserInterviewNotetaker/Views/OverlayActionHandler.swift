import UserInterviewNotetakerCore

/// All actions the overlay UI can request from the app coordinator.
/// Eliminates the 15-closure parameter chains through OverlayWindowController → OverlayView.
@MainActor
protocol OverlayActionHandler: AnyObject {
    func startSession()
    func endSession()
    func openSettings()
    func saveSettings()
    func openSignIn()
    func clearAuth()
    func signInWithDevToken(email: String)
    func submitTranscript(_ text: String)
    func toggleTopic(_ topic: Topic)
    func selectPerson(_ person: DesktopPerson)
    func returnToPeopleList()
    func startMonitoring()
    func reviewSession()
    func saveReviewedSession()
    func refreshPeople()
    func dismissPicker()
    func dismissAuxiliary()
}
