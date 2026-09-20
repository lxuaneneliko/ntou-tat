import XCTest
import UIKit
import WebKit
import CoreImage

/// Hosted by the real app; checks the actual Capacitor/WKWebView runtime, not Safari.
@MainActor final class IntegrationTests: XCTestCase {
    func findWebView(_ view: UIView) -> WKWebView? {
        if let web = view as? WKWebView { return web }
        return view.subviews.compactMap(findWebView).first
    }
    func webView() async throws -> WKWebView {
        for _ in 0..<100 {
            var windows = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows)
            if let window = UIApplication.shared.delegate?.window ?? nil { windows.append(window) }
            if let web = windows.compactMap({ findWebView($0) }).first { return web }
            try await Task.sleep(nanoseconds: 100_000_000)
        }
        throw NSError(domain: "UITest", code: 1, userInfo: [NSLocalizedDescriptionKey: "App did not create WKWebView"])
    }
    func js(_ web: WKWebView, _ source: String, arguments: [String: Any] = [:]) async throws -> Any? {
        // A terminated WebContent/GPU process may never return its JS callback.
        // Bound this operation separately from the condition polling deadline.
        try await withCheckedThrowingContinuation { continuation in
            var completed = false
            let timeout = DispatchWorkItem {
                guard !completed else { return }
                completed = true
                continuation.resume(throwing: NSError(domain: "UITest", code: 3,
                    userInfo: [NSLocalizedDescriptionKey: "WKWebView JS did not respond within 8 seconds"]))
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: timeout)
            web.callAsyncJavaScript(source, arguments: arguments, in: nil, in: .page) { result in
                guard !completed else { return }
                completed = true
                timeout.cancel()
                continuation.resume(with: result.map { Optional($0) })
            }
        }
    }
    func waitFor(_ web: WKWebView, _ condition: String, seconds: Int = 30) async throws {
        let deadline = Date().addingTimeInterval(TimeInterval(seconds))
        while Date() < deadline {
            if (try? await js(web, "return Boolean(\(condition))")) as? Bool == true { return }
            try await Task.sleep(nanoseconds: 500_000_000)
        }
        let visible = (try? await js(web, "return document.body.innerText")) as? String ?? "No DOM"
        XCTFail("Timed out: \(condition)\n\(visible)")
        throw NSError(domain: "UITest", code: 2)
    }
    func testNativeBridgeAndQRImageImport() async throws {
        executionTimeAllowance = 240
        print("IOS_CHECK: production login")
        let web = try await webView()
        try await waitFor(web, "window.Capacitor && document.querySelector('input')")
        let platform = try await js(web, "return Capacitor.getPlatform()") as? String
        XCTAssertEqual(platform, "ios")
        let settings = try await js(web, "return await Capacitor.nativePromise('NtouMail', 'getNotificationSettings', {})") as? [String: Any]
        XCTAssertEqual(settings?["enabled"] as? Bool, false)
        let scanner = try await js(web, "return await Capacitor.nativePromise('BarcodeScanner', 'checkPermissions', {})") as? [String: Any]
        XCTAssertNotNil(scanner?["camera"])
        let portal = try await js(web, "return await Capacitor.nativePromise('NtouPortal', 'cacheGet', {key:'__ios_smoke_empty__'})") as? [String: Any]
        XCTAssertNotNil(portal)
        print("IOS_CHECK: native mail, camera permission and portal bridges passed")
        // Exercise Vision through the same JS/native contract used by the photo picker.
        let filter = try XCTUnwrap(CIFilter(name: "CIQRCodeGenerator"))
        filter.setValue(Data("NTOUTAT iOS QR bridge check".utf8), forKey: "inputMessage")
        let qr = try XCTUnwrap(filter.outputImage).transformed(by: CGAffineTransform(scaleX: 12, y: 12))
        let cgImage = try XCTUnwrap(CIContext(options: [.useSoftwareRenderer: true]).createCGImage(qr, from: qr.extent))
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("ios-qr-smoke.png")
        // A real QR has a white quiet zone. Keep it in the fixture as well.
        let size = CGSize(width: CGFloat(cgImage.width + 96), height: CGFloat(cgImage.height + 96))
        let fixture = UIGraphicsImageRenderer(size: size).image { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: size))
            UIImage(cgImage: cgImage).draw(at: CGPoint(x: 48, y: 48))
        }
        try XCTUnwrap(fixture.pngData()).write(to: file)
        defer { try? FileManager.default.removeItem(at: file) }
        let decoded = try await js(web,
            "return await Capacitor.nativePromise('BarcodeScanner','readBarcodesFromImage',{path:path})",
            arguments: ["path": file.absoluteString]) as? [String: Any]
        let barcodes = decoded?["barcodes"] as? [[String: Any]]
        let qrMatches = barcodes?.first?["rawValue"] as? String == "NTOUTAT iOS QR bridge check"
        XCTAssertTrue(qrMatches, "Native Vision did not return the expected QR payload: \(String(describing: barcodes))")
        print("IOS_CHECK: native QR image decode \(qrMatches ? "passed" : "FAILED")")
        let snapshot = try await web.takeSnapshot(configuration: nil)
        let screenshot = XCTAttachment(image: snapshot)
        screenshot.name = "iOS login and native bridge"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
}
