import SwiftUI

/// Small reusable back button header used by auxiliary views.
struct BackHeader: View {
    var action: () -> Void

    var body: some View {
        HStack(spacing: 8) {
            Button(action: action) {
                Image(systemName: "chevron.left")
                    .font(.system(size: 14, weight: .semibold))
            }
            .buttonStyle(.borderless)
            .help("Back")

            Spacer()
        }
    }
}
