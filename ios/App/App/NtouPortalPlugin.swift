import Capacitor
import CoreFoundation
import Foundation
import Security
import UIKit
import WebKit

private struct PortalNativeResponse {
    let status: Int
    let url: URL
    let headers: [String: String]
    let data: Data
    let contentType: String?
}

private struct StoredPortalCookie: Codable {
    let name: String
    let value: String
    let domain: String
    let path: String
    let secure: Bool
    let httpOnly: Bool
    let expiresAt: Date?

    init(_ cookie: HTTPCookie) {
        name = cookie.name
        value = cookie.value
        domain = cookie.domain
        path = cookie.path
        secure = cookie.isSecure
        httpOnly = cookie.isHTTPOnly
        expiresAt = cookie.expiresDate
    }

    func makeCookie() -> HTTPCookie? {
        if let expiresAt, expiresAt <= Date() {
            return nil
        }

        var properties: [HTTPCookiePropertyKey: Any] = [
            .name: name,
            .value: value,
            .domain: domain,
            .path: path.isEmpty ? "/" : path,
            .secure: secure ? "TRUE" : "FALSE",
        ]
        if httpOnly {
            properties[HTTPCookiePropertyKey("HttpOnly")] = "TRUE"
        }
        if let expiresAt {
            properties[.expires] = expiresAt
        }
        return HTTPCookie(properties: properties)
    }
}

private enum PortalKeychain {
    static let service = "com.lxuan.ntou_tat.portal"

    static func read(_ account: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else {
            return nil
        }
        return item as? Data
    }

    static func write(_ data: Data, account: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        let attributes: [String: Any] = [kSecValueData as String: data]
        let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess {
            return
        }
        guard updateStatus == errSecItemNotFound else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(updateStatus))
        }

        var addQuery = query
        addQuery[kSecValueData as String] = data
        addQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
        guard addStatus == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(addStatus))
        }
    }

    static func delete(_ account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

private final class NoRedirectSessionDelegate: NSObject, URLSessionTaskDelegate {
    func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        willPerformHTTPRedirection response: HTTPURLResponse,
        newRequest request: URLRequest,
        completionHandler: @escaping (URLRequest?) -> Void
    ) {
        completionHandler(nil)
    }
}

@objc(NtouPortalPlugin)
public final class NtouPortalPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NtouPortalPlugin"
    public let jsName = "NtouPortal"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "image", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cacheGet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cacheSet", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cacheClear", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSystemPage", returnType: CAPPluginReturnPromise),
    ]

    private static let maximumRedirects = 5
    private static let networkTimeout = 20_000
    private static let cookieAccount = "portal_cookie_jar_v1"
    private static let cacheAccount = "portal_encrypted_cache_v1"
    private static let userAgent =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

    private let cookieStorage = HTTPCookieStorage.shared
    private let stateQueue = DispatchQueue(label: "com.lxuan.ntou_tat.portal.state")
    private var cookiesLoaded = false
    private var cookieGeneration = 0

    override public func load() {
        ensureCookiesLoaded()
    }

    @objc public func request(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("A valid URL is required")
            return
        }

        let method = call.getString("method") ?? "GET"
        let headers = stringHeaders(call.getObject("headers") ?? [:])
        let body = call.getString("data")?.data(using: .utf8)
        let timeout = clampedTimeout(call.getInt("timeoutMs") ?? Self.networkTimeout)

        Task {
            do {
                let response = try await execute(
                    initialURL: url,
                    initialMethod: method,
                    headers: headers,
                    body: body,
                    timeoutMs: timeout
                )
                let result: JSObject = [
                    "status": response.status,
                    "url": response.url.absoluteString,
                    "headers": jsHeaders(response.headers),
                    "data": decodeText(response.data, contentType: response.contentType),
                    "cookieNames": cookieNames(),
                ]
                call.resolve(result)
            } catch {
                call.reject("NTOU portal request failed", nil, error)
            }
        }
    }

    @objc public func image(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("A valid URL is required")
            return
        }
        let headers = stringHeaders(call.getObject("headers") ?? [:])

        Task {
            do {
                let response = try await execute(
                    initialURL: url,
                    initialMethod: "GET",
                    headers: headers,
                    body: nil,
                    timeoutMs: Self.networkTimeout
                )
                var result: JSObject = [
                    "status": response.status,
                    "url": response.url.absoluteString,
                    "headers": jsHeaders(response.headers),
                ]
                if (200..<400).contains(response.status),
                   !response.data.isEmpty,
                   let contentType = response.contentType?.split(separator: ";").first,
                   contentType.lowercased().hasPrefix("image/") {
                    result["dataUrl"] = "data:\(contentType);base64,\(response.data.base64EncodedString())"
                }
                call.resolve(result)
            } catch {
                call.reject("NTOU captcha request failed", nil, error)
            }
        }
    }

    @objc public func clear(_ call: CAPPluginCall) {
        stateQueue.sync {
            cookieGeneration += 1
            cookiesLoaded = true
            for cookie in cookieStorage.cookies ?? [] where isNtouCookie(cookie) {
                cookieStorage.deleteCookie(cookie)
            }
            PortalKeychain.delete(Self.cookieAccount)
        }
        call.resolve()
    }

    @objc public func cacheGet(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty else {
            call.reject("A cache key is required")
            return
        }
        let value = stateQueue.sync { readCache()[key] }
        if let value {
            call.resolve(["value": value])
        } else {
            call.resolve(["value": NSNull()])
        }
    }

    @objc public func cacheSet(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), !key.isEmpty,
              let value = call.getString("value") else {
            call.reject("A cache key and value are required")
            return
        }

        do {
            try stateQueue.sync {
                var cache = readCache()
                cache[key] = value
                let data = try JSONEncoder().encode(cache)
                try PortalKeychain.write(data, account: Self.cacheAccount)
            }
            call.resolve()
        } catch {
            call.reject("Unable to save encrypted cache", nil, error)
        }
    }

    @objc public func cacheClear(_ call: CAPPluginCall) {
        stateQueue.sync {
            PortalKeychain.delete(Self.cacheAccount)
        }
        call.resolve()
    }

    @objc public func openSystemPage(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString),
              isAllowedSystemURL(url) else {
            call.reject("The AIS system URL is not allowed")
            return
        }

        ensureCookiesLoaded()
        let cookies = matchingCookies(for: url)
        DispatchQueue.main.async { [weak self] in
            guard let self, let presenter = self.bridge?.viewController else {
                call.reject("Unable to open the AIS system page")
                return
            }
            let portal = PortalWebViewController(url: url, cookies: cookies)
            let navigation = UINavigationController(rootViewController: portal)
            navigation.modalPresentationStyle = .fullScreen
            presenter.present(navigation, animated: true) {
                call.resolve()
            }
        }
    }

    private func execute(
        initialURL: URL,
        initialMethod: String,
        headers: [String: String],
        body: Data?,
        timeoutMs: Int
    ) async throws -> PortalNativeResponse {
        ensureCookiesLoaded()
        let expectedGeneration = stateQueue.sync { cookieGeneration }
        var url = initialURL
        var method = initialMethod.uppercased()
        var requestBody = body

        for redirectCount in 0...Self.maximumRedirects {
            try assertGeneration(expectedGeneration)
            var request = URLRequest(url: url)
            request.httpMethod = method
            request.timeoutInterval = TimeInterval(timeoutMs) / 1_000
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue(Self.userAgent, forHTTPHeaderField: "User-Agent")
            request.setValue("zh-TW,zh;q=0.9,en;q=0.8", forHTTPHeaderField: "Accept-Language")
            for (name, value) in headers where !isRestrictedHeader(name) {
                request.setValue(value, forHTTPHeaderField: name)
            }
            if allowsRequestBody(method) {
                request.httpBody = requestBody
            }

            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpCookieStorage = cookieStorage
            configuration.httpShouldSetCookies = true
            configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
            let delegate = NoRedirectSessionDelegate()
            let session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
            let (data, rawResponse) = try await session.data(for: request)
            session.finishTasksAndInvalidate()
            guard let response = rawResponse as? HTTPURLResponse else {
                throw URLError(.badServerResponse)
            }

            try assertGeneration(expectedGeneration)
            storeResponseCookies(response, for: url)
            persistCookies(expectedGeneration: expectedGeneration)

            if isRedirect(response.statusCode),
               redirectCount < Self.maximumRedirects,
               let location = response.value(forHTTPHeaderField: "Location"),
               let nextURL = URL(string: location, relativeTo: url)?.absoluteURL {
                if response.statusCode == 303 ||
                    ([301, 302].contains(response.statusCode) && method != "GET" && method != "HEAD") {
                    method = "GET"
                    requestBody = nil
                }
                url = nextURL
                continue
            }

            return PortalNativeResponse(
                status: response.statusCode,
                url: response.url ?? url,
                headers: responseHeaders(response),
                data: data,
                contentType: response.value(forHTTPHeaderField: "Content-Type")
            )
        }

        throw URLError(.httpTooManyRedirects)
    }

    private func ensureCookiesLoaded() {
        stateQueue.sync {
            guard !cookiesLoaded else { return }
            cookiesLoaded = true
            guard let data = PortalKeychain.read(Self.cookieAccount),
                  let stored = try? JSONDecoder().decode([StoredPortalCookie].self, from: data) else {
                return
            }
            for record in stored {
                if let cookie = record.makeCookie() {
                    cookieStorage.setCookie(cookie)
                }
            }
        }
    }

    private func persistCookies(expectedGeneration: Int) {
        let snapshot = (cookieStorage.cookies ?? [])
            .filter(isNtouCookie)
            .filter { !$0.isSessionOnly || !$0.value.isEmpty }
            .filter { $0.expiresDate == nil || $0.expiresDate! > Date() }
            .map(StoredPortalCookie.init)

        stateQueue.async {
            guard self.cookieGeneration == expectedGeneration else { return }
            guard let data = try? JSONEncoder().encode(snapshot) else { return }
            try? PortalKeychain.write(data, account: Self.cookieAccount)
        }
    }

    private func storeResponseCookies(_ response: HTTPURLResponse, for url: URL) {
        var fields: [String: String] = [:]
        for (name, value) in response.allHeaderFields {
            fields[String(describing: name)] = String(describing: value)
        }
        for cookie in HTTPCookie.cookies(withResponseHeaderFields: fields, for: url) {
            cookieStorage.setCookie(cookie)
        }
    }

    private func assertGeneration(_ expected: Int) throws {
        let matches = stateQueue.sync { cookieGeneration == expected }
        if !matches {
            throw NSError(
                domain: "com.lxuan.ntou_tat.portal",
                code: 409,
                userInfo: [NSLocalizedDescriptionKey: "Portal session was refreshed"]
            )
        }
    }

    private func readCache() -> [String: String] {
        guard let data = PortalKeychain.read(Self.cacheAccount),
              let cache = try? JSONDecoder().decode([String: String].self, from: data) else {
            return [:]
        }
        return cache
    }

    private func matchingCookies(for url: URL) -> [HTTPCookie] {
        let host = url.host?.lowercased() ?? ""
        return (cookieStorage.cookies ?? []).filter { cookie in
            let domain = cookie.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
            return host == domain || host.hasSuffix(".\(domain)")
        }
    }

    private func cookieNames() -> String {
        (cookieStorage.cookies ?? [])
            .filter(isNtouCookie)
            .map(\.name)
            .joined(separator: ",")
    }

    private func isNtouCookie(_ cookie: HTTPCookie) -> Bool {
        let domain = cookie.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
        return domain == "ntou.edu.tw" || domain.hasSuffix(".ntou.edu.tw")
    }

    private func stringHeaders(_ object: JSObject) -> [String: String] {
        var headers: [String: String] = [:]
        for (name, value) in object {
            if let value = value as? String, !value.isEmpty {
                headers[name] = value
            }
        }
        return headers
    }

    private func responseHeaders(_ response: HTTPURLResponse) -> [String: String] {
        var headers: [String: String] = [:]
        for (name, value) in response.allHeaderFields {
            headers[String(describing: name)] = String(describing: value)
        }
        return headers
    }

    private func jsHeaders(_ headers: [String: String]) -> JSObject {
        var result: JSObject = [:]
        for (name, value) in headers {
            result[name] = value
        }
        return result
    }

    private func decodeText(_ data: Data, contentType: String?) -> String {
        if let contentType,
           let charsetRange = contentType.range(of: "charset=", options: .caseInsensitive) {
            let charset = contentType[charsetRange.upperBound...]
                .split(separator: ";", maxSplits: 1)
                .first?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let cfEncoding = CFStringConvertIANACharSetNameToEncoding(charset as CFString)
            if cfEncoding != kCFStringEncodingInvalidId {
                let encoding = String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(cfEncoding))
                if let text = String(data: data, encoding: encoding) {
                    return text
                }
            }
        }
        if let text = String(data: data, encoding: .utf8) {
            return text
        }
        let big5 = CFStringConvertIANACharSetNameToEncoding("Big5" as CFString)
        if big5 != kCFStringEncodingInvalidId {
            let encoding = String.Encoding(rawValue: CFStringConvertEncodingToNSStringEncoding(big5))
            if let text = String(data: data, encoding: encoding) {
                return text
            }
        }
        return String(decoding: data, as: UTF8.self)
    }

    private func clampedTimeout(_ timeout: Int) -> Int {
        min(max(timeout, 5_000), 90_000)
    }

    private func isRestrictedHeader(_ name: String) -> Bool {
        ["cookie", "content-length", "host"].contains(name.lowercased())
    }

    private func allowsRequestBody(_ method: String) -> Bool {
        ["POST", "PUT", "PATCH", "DELETE"].contains(method)
    }

    private func isRedirect(_ status: Int) -> Bool {
        [301, 302, 303, 307, 308].contains(status)
    }

    private func isAllowedSystemURL(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && url.host?.lowercased() == "ais.ntou.edu.tw"
    }
}

private final class PortalWebViewController: UIViewController, WKNavigationDelegate {
    private let initialURL: URL
    private let cookies: [HTTPCookie]
    private var webView: WKWebView!
    private var progressObservation: NSKeyValueObservation?

    private let zoomLevels: [CGFloat] = [0.75, 0.9, 1.0, 1.15, 1.3, 1.5, 1.8, 2.0]
    private let defaultZoomIndex: Int = 5 // 1.5 (150%)
    private var currentZoomIndex: Int = 5
    private var zoomLabelItem: UIBarButtonItem!

    init(url: URL, cookies: [HTTPCookie]) {
        initialURL = url
        self.cookies = cookies
        let savedIndex = UserDefaults.standard.object(forKey: "ntou_portal_last_zoom_index") as? Int ?? defaultZoomIndex
        if savedIndex >= 0 && savedIndex < zoomLevels.count {
            currentZoomIndex = savedIndex
        }
        super.init(nibName: nil, bundle: nil)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "海大校務系統"
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .close,
            target: self,
            action: #selector(close)
        )

        let refreshItem = UIBarButtonItem(
            barButtonSystemItem: .refresh,
            target: self,
            action: #selector(reload)
        )
        let zoomInItem = UIBarButtonItem(
            title: "＋",
            style: .plain,
            target: self,
            action: #selector(zoomIn)
        )
        zoomLabelItem = UIBarButtonItem(
            title: "150%",
            style: .plain,
            target: self,
            action: #selector(resetZoom)
        )
        let zoomOutItem = UIBarButtonItem(
            title: "－",
            style: .plain,
            target: self,
            action: #selector(zoomOut)
        )
        navigationItem.rightBarButtonItems = [refreshItem, zoomInItem, zoomLabelItem, zoomOutItem]
        updateZoomDisplay()

        navigationController?.navigationBar.tintColor = .white
        navigationController?.navigationBar.barTintColor = UIColor(red: 7 / 255, green: 90 / 255, blue: 153 / 255, alpha: 1)
        navigationController?.navigationBar.titleTextAttributes = [.foregroundColor: UIColor.white]

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            webView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        progressObservation = webView.observe(\.estimatedProgress, options: [.new]) { [weak self] webView, _ in
            self?.navigationItem.prompt = webView.estimatedProgress < 1 ? "載入中" : nil
        }
        installCookiesAndLoad()
    }

    private func installCookiesAndLoad() {
        let group = DispatchGroup()
        let store = webView.configuration.websiteDataStore.httpCookieStore
        for cookie in cookies {
            group.enter()
            store.setCookie(cookie) { group.leave() }
        }
        group.notify(queue: .main) { [weak self] in
            guard let self else { return }
            self.webView.load(URLRequest(url: self.initialURL))
        }
    }

    @objc private func close() {
        dismiss(animated: true)
    }

    @objc private func reload() {
        webView.reload()
    }

    @objc private func zoomIn() {
        adjustZoom(delta: 1)
    }

    @objc private func zoomOut() {
        adjustZoom(delta: -1)
    }

    @objc private func resetZoom() {
        currentZoomIndex = defaultZoomIndex // 150%
        saveZoomIndex()
        updateZoomDisplay()
        applyZoom()
    }

    private func adjustZoom(delta: Int) {
        let nextIndex = currentZoomIndex + delta
        if nextIndex >= 0 && nextIndex < zoomLevels.count {
            currentZoomIndex = nextIndex
            saveZoomIndex()
            updateZoomDisplay()
            applyZoom()
        }
    }

    private func saveZoomIndex() {
        UserDefaults.standard.set(currentZoomIndex, forKey: "ntou_portal_last_zoom_index")
    }

    private func updateZoomDisplay() {
        let percent = Int(round(zoomLevels[currentZoomIndex] * 100))
        zoomLabelItem?.title = "\(percent)%"
    }

    private func applyZoom() {
        guard let webView else { return }
        let scale = zoomLevels[currentZoomIndex]
        if #available(iOS 14.0, *) {
            webView.pageZoom = scale
        }
        let js = "if (document.body) { document.body.style.zoom = '\(scale)'; }"
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        applyZoom()
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url,
              url.scheme?.lowercased() == "https",
              url.host?.lowercased() == "ais.ntou.edu.tw" else {
            if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }
}
