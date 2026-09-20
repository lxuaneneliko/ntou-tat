import Foundation
import SwiftMail
import SwiftSoup
import Logging

enum NativeMailError: LocalizedError {
    case message(String)
    var errorDescription: String? { if case .message(let text) = self { return text }; return nil }
}

struct MailLogin: Codable {
    let account: String
    let password: String
    var address: String { account + "@mail.ntou.edu.tw" }
    init(account: String, password: String) throws {
        let normalized = account.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let suffix = "@mail.ntou.edu.tw"
        self.account = normalized.hasSuffix(suffix) ? String(normalized.dropLast(suffix.count)) : normalized
        guard self.account.range(of: "^[a-z0-9._-]+$", options: .regularExpression) != nil, !password.isEmpty else {
            throw NativeMailError.message("請輸入有效的海大信箱帳號與密碼")
        }
        self.password = password
    }
}

enum MailContent {
    static func address(_ value: String) -> String {
        if let start = value.lastIndex(of: "<"), let end = value[start...].firstIndex(of: ">") {
            return String(value[value.index(after: start)..<end])
        }
        return value.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    static func safeHeader(_ value: String) throws -> String {
        // CRLF is a single Swift Character; check Unicode scalars, not grapheme membership.
        guard !value.unicodeScalars.contains(where: { $0.value == 13 || $0.value == 10 || $0.value == 0 }) else {
            throw NativeMailError.message("郵件標題或地址格式不正確")
        }
        return value
    }
    static func recipients(_ value: String) throws -> [EmailAddress] {
        try safeHeader(value).split(whereSeparator: { $0 == "," || $0 == ";" || $0 == "，" || $0 == "；" }).map {
            let item = address(String($0))
            guard item.range(of: "^[^\\s<>@]+@[^\\s<>@]+\\.[^\\s<>@]+$", options: .regularExpression) != nil else {
                throw NativeMailError.message("收件者信箱格式不正確")
            }
            return EmailAddress(address: item)
        }
    }
    static func summary(_ header: MessageInfo) -> [String: Any] {
        let sender = header.from ?? ""
        return ["uid": String(header.uid?.value ?? 0), "subject": header.subject ?? "（無主旨）",
                "sender": sender, "senderAddress": address(sender),
                "receivedAt": (header.date ?? header.internalDate).map { ISO8601DateFormatter().string(from: $0) } ?? "",
                "unread": !header.flags.contains(where: { $0.description == "seen" }),
                "starred": header.flags.contains(where: { $0.description == "flagged" })]
    }
    static func folderKind(_ folder: Mailbox.Info) -> String {
        let name = folder.name.lowercased()
        if name == "inbox" { return "inbox" }
        if folder.attributes.contains(.sent) || name.contains("sent") || name.contains("寄件") { return "sent" }
        if folder.attributes.contains(.trash) || name.contains("trash") || name.contains("垃圾桶") { return "trash" }
        if folder.attributes.contains(.drafts) || name.contains("draft") { return "drafts" }
        if folder.attributes.contains(.junk) || name.contains("spam") || name.contains("junk") { return "spam" }
        if folder.attributes.contains(.archive) || name.contains("archive") { return "archive" }
        return "custom"
    }
    // Parse only: SwiftSoup never executes HTML, scripts, CSS or remote image requests.
    // Keep text and images in reading order; the web UI asks before loading external images.
    static func body(html: String?, plain: String, inlineImages: [String: [String: Any]]) throws -> (String, [[String: Any]], [[String: Any]]) {
        guard let html, !html.isEmpty else { return (plain, Array(inlineImages.values), [["type": "text", "text": plain]]) }
        let document = try SwiftSoup.parse(html)
        var images: [[String: Any]] = []
        var blocks: [[String: Any]] = []
        var text = ""
        func flush() {
            let value = text.replacingOccurrences(of: "\n{3,}", with: "\n\n", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
            if !value.isEmpty { blocks.append(["type": "text", "text": value]) }
            text = ""
        }
        func visit(_ node: Node, depth: Int) throws {
            guard depth < 100 else { return }
            if let node = node as? TextNode { text += node.getWholeText(); return }
            guard let element = node as? Element else { return }
            let tag = element.tagName().lowercased()
            if ["script", "style", "head", "iframe", "object", "noscript"].contains(tag) { return }
            if tag == "img" {
                let src = try element.attr("src")
                var image: [String: Any]?
                if src.lowercased().hasPrefix("cid:") {
                    image = inlineImages[String(src.dropFirst(4)).trimmingCharacters(in: CharacterSet(charactersIn: "<>"))]
                } else if let url = URL(string: src), ["https", "http"].contains(url.scheme?.lowercased() ?? ""), url.host != nil {
                    image = ["id": "external-\(images.count)", "name": try element.attr("alt"), "mimeType": "image/*", "src": src, "external": true]
                }
                if var image {
                    flush(); image["referenced"] = true
                    images.append(image); blocks.append(["type": "image", "imageId": image["id"] ?? ""])
                }
                return
            }
            let isBlock = ["br", "p", "div", "tr", "li", "h1", "h2", "h3", "hr"].contains(tag)
            if isBlock { text += "\n" }
            for child in node.getChildNodes() { try visit(child, depth: depth + 1) }
            if tag == "a" {
                let href = try element.attr("href")
                if ["https:", "http:", "mailto:"].contains(where: { href.lowercased().hasPrefix($0) }), !(try element.text()).contains(href) {
                    text += " (\(href))"
                }
            }
            if isBlock { text += "\n" }
            if tag == "td" || tag == "th" { text += "  " }
        }
        if let element = document.body() { try visit(element, depth: 0) }
        flush()
        for image in inlineImages.values where !images.contains(where: { ($0["id"] as? String) == (image["id"] as? String) }) { images.append(image) }
        let body = blocks.compactMap { $0["text"] as? String }.joined(separator: "\n\n")
        return (body.isEmpty ? plain : body, images, blocks.isEmpty ? [["type": "text", "text": plain]] : blocks)
    }
}

enum MailClient {
    static let host = "mail.ntou.edu.tw"
    static let maxPartBytes = 20 * 1024 * 1024
    private static let silenceLogs: Void = LoggingSystem.bootstrap { _ in SwiftLogNoOpLogHandler() }

    static func withInbox<T>(_ login: MailLogin, _ operation: (IMAPServer) async throws -> T) async throws -> T {
        _ = silenceLogs
        let server = IMAPServer(host: host, port: 993, transportSecurity: .implicitTLS, certificateVerificationPolicy: .fullVerification)
        do {
            try await server.connect()
            try await server.login(username: login.address, password: login.password)
            try Task.checkCancellation()
            let result = try await operation(server)
            try? await server.logout()
            try? await server.disconnect()
            return result
        } catch {
            try? await server.disconnect()
            throw error
        }
    }
    static func list(_ server: IMAPServer, login: MailLogin, folder: String, offset: Int, limit: Int) async throws -> [String: Any] {
        let selected = try await server.selectMailbox(folder)
        let total = selected.messageCount
        let last = total - max(0, offset)
        let first = max(1, last - min(100, max(1, limit)) + 1)
        let headers = last > 0 ? try await server.fetchMessageInfos(sequenceRange: SequenceNumber(first)...SequenceNumber(last), options: .slim) : []
        let unread = try await server.mailboxStatus(folder).unseenCount ?? 0
        return ["account": login.account, "folder": folder, "total": total, "unread": unread, "offset": offset,
                "nextOffset": offset + headers.count, "hasMore": first > 1,
                "messages": headers.sorted { $0.sequenceNumber.value > $1.sequenceNumber.value }.map(MailContent.summary)]
    }
    static func message(_ server: IMAPServer, folder: String, uid: SwiftMail.UID) async throws -> [String: Any] {
        try await server.selectMailbox(folder)
        guard let header = try await server.fetchMessageInfo(for: uid) else { throw NativeMailError.message("找不到這封信，可能已移動或刪除") }
        let structure = try await server.fetchStructure(uid)
        var bodyParts: [MessagePart] = []
        var inlineImages: [String: [String: Any]] = [:]
        var attachments: [[String: Any]] = []
        var loaded = 0
        for var part in structure {
            try Task.checkCancellation()
            let type = part.contentType.lowercased()
            let body = (type.hasPrefix("text/plain") || type.hasPrefix("text/html")) && part.disposition?.lowercased() != "attachment"
            let inline = type.hasPrefix("image/") && part.disposition?.lowercased() != "attachment"
            if !body {
                attachments.append(["id": part.section.description, "name": part.suggestedFilename, "mimeType": part.contentType, "size": part.size ?? 0, "inline": inline])
            }
            if (body || inline) && (part.size ?? 0) <= 8 * 1024 * 1024 && loaded < 12 * 1024 * 1024 {
                part.data = try await server.fetchPart(section: part.section, of: uid)
                loaded += part.data?.count ?? 0
                if body { bodyParts.append(part) }
                else if let data = part.decodedData() {
                    let id = part.section.description
                    let cid = (part.contentId ?? id).trimmingCharacters(in: CharacterSet(charactersIn: "<>"))
                    inlineImages[cid] = ["id": id, "name": part.suggestedFilename, "mimeType": part.contentType,
                                         "src": "data:\(part.contentType.components(separatedBy: ";")[0]);base64,\(data.base64EncodedString())", "external": false]
                }
            }
        }
        let message = Message(header: header, parts: bodyParts)
        let (body, images, blocks) = try MailContent.body(html: message.htmlBody, plain: message.textBody ?? "", inlineImages: inlineImages)
        var result = MailContent.summary(header)
        result.merge(["recipients": header.to, "cc": header.cc, "replyTo": [MailContent.address(header.from ?? "")],
                      "messageId": header.messageId?.description ?? "", "references": header.references?.map(\.description).joined(separator: " ") ?? "",
                      "body": body, "bodyImages": images, "bodyBlocks": blocks, "attachments": attachments]) { _, value in value }
        if let reply = header.additionalFields?.first(where: { $0.key.lowercased() == "reply-to" })?.value { result["replyTo"] = [MailContent.address(reply)] }
        try await server.store(flags: [.seen], on: UIDSet(uid), operation: .add)
        result["unread"] = false
        return result
    }
    static func send(_ login: MailLogin, email: Email) async throws -> String? {
        _ = silenceLogs
        let server = SMTPServer(host: host, port: 465, transportSecurity: .implicitTLS, certificateVerificationPolicy: .fullVerification)
        do {
            try await server.connect()
            try await server.login(username: login.address, password: login.password)
            try await server.sendEmail(email)
        } catch {
            try? await server.disconnect()
            // Delivery might have succeeded before the connection failed. Never retry automatically.
            if error is SMTPSendError { throw NativeMailError.message("寄送結果未能確認，請先查看寄件備份並向收件者確認，避免重複寄送") }
            throw error
        }
        try? await server.disconnect()
        do {
            try await withInbox(login) { imap in
                let folders = try await imap.listMailboxes()
                guard let sent = folders.first(where: { MailContent.folderKind($0) == "sent" }) else { throw NativeMailError.message("找不到寄件備份") }
                try await imap.append(email: email, to: sent.name, flags: [.seen])
            }
            return nil
        } catch { return "信件已寄出，但無法儲存寄件備份；請勿重複寄送。" }
    }
}
