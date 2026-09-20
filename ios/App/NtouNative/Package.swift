// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NtouNative",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [.library(name: "NtouNative", targets: ["NtouNative"])],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.4.2"),
        .package(path: "../Vendor/SwiftMail"),
        .package(url: "https://github.com/scinfu/SwiftSoup.git", exact: "2.13.9"),
        .package(url: "https://github.com/apple/swift-log.git", from: "1.6.0")
    ],
    targets: [
        .target(name: "NtouNative", dependencies: [
            .product(name: "Capacitor", package: "capacitor-swift-pm", condition: .when(platforms: [.iOS])),
            .product(name: "SwiftMail", package: "SwiftMail"),
            .product(name: "SwiftSoup", package: "SwiftSoup"),
            .product(name: "Logging", package: "swift-log")
        ]),
        .testTarget(name: "NtouNativeTests", dependencies: ["NtouNative", .product(name: "SwiftMail", package: "SwiftMail")])
    ]
)
