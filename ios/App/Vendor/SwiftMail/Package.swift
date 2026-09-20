// swift-tools-version: 5.9
import PackageDescription

// Library-only snapshot of SwiftMail 1.11.0; see UPSTREAM.md and the retained license.
let package = Package(
    name: "SwiftMail",
    platforms: [.macOS(.v12), .iOS(.v15)],
    products: [.library(name: "SwiftMail", targets: ["SwiftMail"])],
    dependencies: [
        .package(url: "https://github.com/apple/swift-log.git", from: "1.6.0"),
        .package(url: "https://github.com/Cocoanetics/SwiftCross", from: "1.2.0"),
        .package(url: "https://github.com/apple/swift-nio", from: "2.101.3"),
        .package(url: "https://github.com/apple/swift-nio-imap", from: "0.3.0"),
        .package(url: "https://github.com/apple/swift-nio-ssl", from: "2.37.1"),
        .package(url: "https://github.com/apple/swift-collections.git", from: "1.0.0")
    ],
    targets: [.target(name: "SwiftMail", dependencies: [
        .product(name: "NIO", package: "swift-nio"),
        .product(name: "NIOSSL", package: "swift-nio-ssl"),
        .product(name: "Logging", package: "swift-log"),
        .product(name: "NIOIMAP", package: "swift-nio-imap"),
        .product(name: "OrderedCollections", package: "swift-collections"),
        .product(name: "SwiftCross", package: "SwiftCross")
    ], resources: [.copy("LICENSE")])]
)
