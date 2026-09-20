import XCTest
import UIKit
import WebKit

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
    func js(_ web: WKWebView, _ source: String) async throws -> Any? {
        try await web.callAsyncJavaScript(source, arguments: [:], in: nil, contentWorld: .page)
    }
    func waitFor(_ web: WKWebView, _ condition: String, seconds: Int = 30) async throws {
        for _ in 0..<(seconds * 2) {
            if (try? await js(web, "return Boolean(\(condition))")) as? Bool == true { return }
            try await Task.sleep(nanoseconds: 500_000_000)
        }
        let visible = (try? await js(web, "return document.body.innerText")) as? String ?? "No DOM"
        XCTFail("Timed out: \(condition)\n\(visible)")
        throw NSError(domain: "UITest", code: 2)
    }
    func testNativeBridgeAndLiveVectorMap() async throws {
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
        _ = try await js(web, "setTimeout(() => location.href='/__qa__/index.html', 100); return true")
        try await waitFor(web, "document.querySelectorAll('input').length === 2")
        try await waitFor(web, "Number(document.querySelector('#map-evidence')?.dataset.tiles) > 0", seconds: 60)
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
        let snapshot = try await web.takeSnapshot(configuration: nil)
        let screenshot = XCTAttachment(image: snapshot)
        screenshot.name = "Live iOS campus map with route"
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }
}
