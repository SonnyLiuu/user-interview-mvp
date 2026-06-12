// swift-tools-version: 5.9

import PackageDescription

let package = Package(
    name: "UserInterviewNotetaker",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "UserInterviewNotetaker", targets: ["UserInterviewNotetaker"]),
        .executable(name: "UserInterviewNotetakerCoreSmokeTests", targets: ["UserInterviewNotetakerCoreSmokeTests"])
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
                "Resources/Info.plist",
                "Resources/UserInterviewNotetaker.entitlements"
            ],
            resources: [
                .copy("Resources/AppIcon.icns")
            ]
        ),
        .executableTarget(
            name: "UserInterviewNotetakerCoreSmokeTests",
            dependencies: ["UserInterviewNotetakerCore"],
            path: "UserInterviewNotetakerCoreSmokeTests"
        ),
        .executableTarget(
            name: "UserInterviewNotetakerTests",
            dependencies: ["UserInterviewNotetakerCore"],
            path: "UserInterviewNotetakerTests"
        )
    ]
)
