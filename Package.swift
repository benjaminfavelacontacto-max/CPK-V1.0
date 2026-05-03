// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "CPKVitrox",
    platforms: [
        .macOS(.v13)
    ],
    targets: [
        .executableTarget(
            name: "CPKVitrox",
            path: "Sources/CPKVitrox",
            resources: [
                .process("Resources")
            ]
        )
    ]
)
