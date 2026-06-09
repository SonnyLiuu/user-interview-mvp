import AppKit

@MainActor
final class TranscriptWindowController: NSWindowController {
    private let onSubmit: (String) -> Void
    private let textView = NSTextView()
    private let statusLabel = NSTextField(labelWithString: "")

    init(onSubmit: @escaping (String) -> Void) {
        self.onSubmit = onSubmit

        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 420),
            styleMask: [.titled, .closable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Add Transcript Text"
        window.center()

        super.init(window: window)
        window.contentView = buildView()
    }

    required init?(coder: NSCoder) {
        nil
    }

    private func buildView() -> NSView {
        let root = NSView(frame: NSRect(x: 0, y: 0, width: 560, height: 420))

        let label = NSTextField(labelWithString: "Paste transcript text for the current live session.")
        label.frame = NSRect(x: 20, y: 380, width: 500, height: 22)
        root.addSubview(label)

        let scroll = NSScrollView(frame: NSRect(x: 20, y: 70, width: 520, height: 300))
        scroll.hasVerticalScroller = true
        textView.minSize = NSSize(width: 0, height: 0)
        textView.maxSize = NSSize(width: CGFloat.greatestFiniteMagnitude, height: CGFloat.greatestFiniteMagnitude)
        textView.isVerticallyResizable = true
        textView.isHorizontallyResizable = false
        textView.autoresizingMask = [.width]
        scroll.documentView = textView
        root.addSubview(scroll)

        let submit = NSButton(title: "Send to Checklist", target: self, action: #selector(submitTapped))
        submit.frame = NSRect(x: 20, y: 24, width: 140, height: 30)
        root.addSubview(submit)

        statusLabel.textColor = .secondaryLabelColor
        statusLabel.frame = NSRect(x: 170, y: 26, width: 350, height: 24)
        root.addSubview(statusLabel)

        return root
    }

    @objc private func submitTapped() {
        let text = textView.string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            statusLabel.stringValue = "Transcript text is required."
            return
        }
        onSubmit(text)
        textView.string = ""
        statusLabel.stringValue = "Sent."
    }
}
