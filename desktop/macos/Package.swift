// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "UserInterviewNotetaker",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "UserInterviewNotetaker", targets: ["UserInterviewNotetaker"])
    ],
    targets: [
        .target(
            name: "UserInterviewNotetakerCore",
            path: "UserInterviewNotetakerCore"
        ),
        .executableTarget(
            name: "UserInterviewNotetaker",
            dependencies: ["UserInterviewNotetakerCore"],
            path: "UserInterviewNotetaker",
            exclude: [
                "Packaging",
                // Bundled into the .app by Packaging/build-dmg.sh, not SwiftPM.
                "Resources"
            ]
        ),
        // Plain executable rather than a test target: the Command Line Tools
        // toolchain has no XCTest. Run with `swift run UserInterviewNotetakerTests`.
        .executableTarget(
            name: "UserInterviewNotetakerTests",
            dependencies: ["UserInterviewNotetakerCore"],
            path: "UserInterviewNotetakerTests"
        )
    ]
)
