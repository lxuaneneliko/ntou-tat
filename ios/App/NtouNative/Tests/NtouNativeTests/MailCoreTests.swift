import XCTest
@testable import NtouNative

final class MailCoreTests: XCTestCase {
    func testAccountNormalizationAndValidation() throws {
        XCTAssertEqual(try MailLogin(account: " USER@mail.ntou.edu.tw ", password: "test").address, "user@mail.ntou.edu.tw")
        XCTAssertThrowsError(try MailLogin(account: "user@attacker.example", password: "test"))
        XCTAssertThrowsError(try MailLogin(account: "user", password: ""))
    }
    func testHeaderInjectionRejected() {
        XCTAssertThrowsError(try MailContent.safeHeader("Hello\r\nBcc: bad@example.com"))
        XCTAssertThrowsError(try MailContent.recipients("user@example.com\nBcc: bad@example.com"))
    }
    func testRecipients() throws {
        XCTAssertEqual(try MailContent.recipients("同學 <a@example.com>; b@example.com").map(\.address), ["a@example.com", "b@example.com"])
        XCTAssertThrowsError(try MailContent.recipients("invalid"))
    }
    func testHTMLReadingOrderAndExternalPrivacy() throws {
        let html = "<p>前段</p><img src='cid:poster'><p>後段</p><img src='https://example.com/image.png'><script>bad()</script><img src='javascript:bad()'>"
        let result = try MailContent.body(html: html, plain: "", inlineImages: ["poster": ["id": "1.2", "src": "data:image/png;base64,AA==", "external": false]])
        XCTAssertEqual(result.2.compactMap { $0["type"] as? String }, ["text", "image", "text", "image"])
        XCTAssertEqual(result.1.count, 2)
        XCTAssertEqual(result.1.last?["external"] as? Bool, true)
        XCTAssertFalse(result.0.contains("bad"))
        XCTAssertTrue(result.0.contains("前段"))
    }
    func testPlainTextAndLinkPreservation() throws {
        XCTAssertEqual(try MailContent.body(html: nil, plain: "Hello\nWorld", inlineImages: [:]).0, "Hello\nWorld")
        XCTAssertTrue(try MailContent.body(html: "<a href='https://ntou.edu.tw'>官網</a>", plain: "", inlineImages: [:]).0.contains("https://ntou.edu.tw"))
    }
}
