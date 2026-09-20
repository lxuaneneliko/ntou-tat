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
    func testNativeBridgeAndLiveVectorMap() async throws {
        executionTimeAllowance = 240
        // Diagnose HTTPS independently of our bridge / MapLibre, without changing TLS policy.
        for endpoint in ["https://www.apple.com/library/test/success.html", "https://tiles.openfreemap.org/styles/dark"] {
            do {
                var request = URLRequest(url: URL(string: endpoint)!)
                request.timeoutInterval = 15
                let (data, response) = try await URLSession.shared.data(for: request)
                print("IOS_NETWORK: \(endpoint) HTTP \((response as? HTTPURLResponse)?.statusCode ?? 0), \(data.count) bytes")
            } catch {
                print("IOS_NETWORK: \(endpoint) \(error)")
            }
        }
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
        print("IOS_CHECK: native QR image decode \(qrMatches ? "passed" : "FAILED"); loading real vector map")
        _ = try await js(web, "setTimeout(() => location.href='/__qa__/index.html', 100); return true")
        try await waitFor(web, "document.querySelectorAll('input').length === 2")
        try await waitFor(web, "Number(document.querySelector('#map-evidence')?.dataset.tiles) > 0", seconds: 60)
        print("IOS_CHECK: vector tiles rendered")
        func fill(_ name: String, _ value: String) async throws {
            _ = try await js(web, """
              const e = document.querySelector('input[aria-label="\(name)"]'); e.focus();
              Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'\(value)');
              e.dispatchEvent(new Event('input',{bubbles:true})); return true;
              """)
        }
        try await fill("起點", "馬尚彬")
        try await waitFor(web, "document.querySelector('[role=listbox]')?.innerText.includes('馬尚彬')")
        _ = try await js(web, "document.querySelector('input[aria-label=終點]').focus(); return true")
        try await waitFor(web, "!document.querySelector('[role=listbox]')")
        try await fill("起點", "BOH")
        try await waitFor(web, "document.querySelector('[role=option]')")
        _ = try await js(web, "document.querySelector('[role=option]').click(); return true")
        try await fill("終點", "MEB")
        try await waitFor(web, "document.querySelector('[role=option]')")
        _ = try await js(web, "document.querySelector('[role=option]').click(); return true")
        try await waitFor(web, "!document.querySelector('.ntou-map-route-submit').disabled")
        _ = try await js(web, "document.querySelector('.ntou-map-route-submit').click(); document.activeElement.blur(); return true")
        try await waitFor(web, "Number(document.querySelector('#map-evidence')?.dataset.routes) > 0", seconds: 60)
        print("IOS_CHECK: independent fields and live walking route passed")
        let snapshot = try await web.takeSnapshot(configuration: nil)
        let screenshot = XCTAttachment(image: snapshot)
        screenshot.name = "Live iOS campus map with route"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
}
