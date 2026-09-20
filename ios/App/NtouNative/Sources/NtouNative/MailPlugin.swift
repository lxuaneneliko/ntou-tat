#if os(iOS)
import Capacitor
import Foundation
import SwiftMail
import UIKit

@objc(NtouMailPlugin)
public final class NtouMailPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NtouMailPlugin"
    public let jsName = "NtouMail"
    public let pluginMethods: [CAPPluginMethod] = ["login", "getNotificationSettings", "setNotifications", "listFolders", "listMessages", "getMessage", "setFlag", "moveMessage", "openAttachment", "sendMessage"].compactMap {
        CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise)
    }
    private func run(_ call: CAPPluginCall, _ work: @escaping () async throws -> [String: Any]) {
        Task {
            do { call.resolve(try await work()) }
            catch let error as NativeMailError { call.reject(error.localizedDescription, "MAIL_OPERATION_FAILED") }
            catch is CancellationError { call.reject("操作已取消", "MAIL_CANCELED") }
            catch {
                // Never expose server responses, credentials, subjects or addresses in bridge errors/logs.
                call.reject("Mail2000 操作失敗，請確認網路、帳密與信箱服務設定", "MAIL_OPERATION_FAILED")
            }
        }
    }
    private func loginInfo(_ call: CAPPluginCall) throws -> MailLogin {
        try MailLogin(account: call.getString("account") ?? "", password: call.getString("password") ?? "")
    }
    private func uid(_ call: CAPPluginCall) throws -> SwiftMail.UID {
        guard let value = UInt32(call.getString("uid") ?? ""), value > 0 else { throw NativeMailError.message("信件識別碼無效") }
        return SwiftMail.UID(value)
    }
    @objc public func login(_ call: CAPPluginCall) {
        run(call) {
            let login = try self.loginInfo(call)
            return try await MailClient.withInbox(login) { _ in ["account": login.account] }
        }
    }
    @objc public func getNotificationSettings(_ call: CAPPluginCall) {
        run(call) { await MailNotifications.shared.settings() }
    }
    @objc public func setNotifications(_ call: CAPPluginCall) {
        run(call) {
            let enabled = call.getBool("enabled") ?? false
            return try await MailNotifications.shared.configure(enabled: enabled, login: enabled ? self.loginInfo(call) : nil)
        }
    }
    @objc public func listFolders(_ call: CAPPluginCall) {
        run(call) {
            try await MailClient.withInbox(self.loginInfo(call)) { server in
                var rows: [[String: Any]] = []
                for folder in try await server.listMailboxes() where folder.isSelectable {
                    try Task.checkCancellation()
                    let status = try await server.mailboxStatus(folder.name)
                    let kind = MailContent.folderKind(folder)
                    let names = ["inbox": "收件匣", "sent": "寄件備份", "drafts": "草稿", "trash": "垃圾桶", "spam": "垃圾郵件", "archive": "封存"]
                    rows.append(["id": folder.name, "name": names[kind] ?? folder.name, "kind": kind,
                                 "unread": status.unseenCount ?? 0, "total": status.messageCount ?? 0])
                }
                rows.sort { ($0["kind"] as? String == "inbox" ? "0" : "1") + ($0["name"] as? String ?? "") < ($1["kind"] as? String == "inbox" ? "0" : "1") + ($1["name"] as? String ?? "") }
                return ["folders": rows]
            }
        }
    }
    @objc public func listMessages(_ call: CAPPluginCall) {
        run(call) {
            let login = try self.loginInfo(call)
            return try await MailClient.withInbox(login) { server in
                try await MailClient.list(server, login: login, folder: call.getString("folder") ?? "INBOX", offset: max(0, call.getInt("offset") ?? 0), limit: call.getInt("limit") ?? 30)
            }
        }
    }
    @objc public func getMessage(_ call: CAPPluginCall) {
        run(call) {
            try await MailClient.withInbox(self.loginInfo(call)) { server in
                try await MailClient.message(server, folder: call.getString("folder") ?? "INBOX", uid: self.uid(call))
            }
        }
    }
    @objc public func setFlag(_ call: CAPPluginCall) {
        run(call) {
            let flag: SwiftMail.Flag
            switch call.getString("flag") {
            case "seen": flag = .seen
            case "flagged": flag = .flagged
            default: throw NativeMailError.message("不支援的信件狀態")
            }
            return try await MailClient.withInbox(self.loginInfo(call)) { server in
                try await server.selectMailbox(call.getString("folder") ?? "INBOX")
                try await server.store(flags: [flag], on: UIDSet(self.uid(call)), operation: call.getBool("value") == true ? .add : .remove)
                return [:]
            }
        }
    }
    @objc public func moveMessage(_ call: CAPPluginCall) {
        run(call) {
            guard let target = call.getString("targetFolder"), !target.isEmpty else { throw NativeMailError.message("請選擇目的資料夾") }
            return try await MailClient.withInbox(self.loginInfo(call)) { server in
                try await server.selectMailbox(call.getString("folder") ?? "INBOX")
                try await server.move(messages: UIDSet(self.uid(call)), to: target)
                return [:]
            }
        }
    }
    @objc public func openAttachment(_ call: CAPPluginCall) {
        run(call) {
            let (filename, data): (String, Data) = try await MailClient.withInbox(self.loginInfo(call)) { server in
                try await server.selectMailbox(call.getString("folder") ?? "INBOX")
                let uid = try self.uid(call)
                guard let header = try await server.fetchMessageInfo(for: uid),
                      let part = try await server.fetchStructure(uid).first(where: { $0.section.description == call.getString("partId") }) else {
                    throw NativeMailError.message("找不到這個附件")
                }
                guard (part.size ?? 0) <= MailClient.maxPartBytes else { throw NativeMailError.message("附件超過 20 MB，請使用網頁信箱下載") }
                let data = try await server.fetchAndDecodeMessagePartData(messageInfo: header, part: part)
                guard data.count <= MailClient.maxPartBytes else { throw NativeMailError.message("附件超過 20 MB") }
                return (part.suggestedFilename, data)
            }
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent("mail-" + UUID().uuidString, isDirectory: true)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
            let safeName = URL(fileURLWithPath: filename).lastPathComponent
            let url = directory.appendingPathComponent(safeName.isEmpty ? "attachment" : safeName)
            try data.write(to: url, options: [.atomic, .completeFileProtection])
            let presented = await MainActor.run {
                guard let presenter = self.bridge?.viewController, presenter.presentedViewController == nil else { return false }
                let share = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                share.popoverPresentationController?.sourceView = presenter.view
                share.popoverPresentationController?.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
                share.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: directory) }
                presenter.present(share, animated: true)
                return true
            }
            guard presented else {
                try? FileManager.default.removeItem(at: directory)
                throw NativeMailError.message("請關閉目前視窗後再開啟附件")
            }
            return [:]
        }
    }
    @objc public func sendMessage(_ call: CAPPluginCall) {
        run(call) {
            let login = try self.loginInfo(call)
            var attachments: [Attachment] = []
            var size = 0
            for item in call.getArray("attachments", JSObject.self) ?? [] {
                guard let encoded = item["data"] as? String, let data = Data(base64Encoded: encoded) else { throw NativeMailError.message("附件內容無效") }
                size += data.count
                guard size <= MailClient.maxPartBytes else { throw NativeMailError.message("附件總大小不能超過 20 MB") }
                attachments.append(Attachment(filename: try MailContent.safeHeader(item["name"] as? String ?? "attachment"), mimeType: try MailContent.safeHeader(item["mimeType"] as? String ?? "application/octet-stream"), data: data))
            }
            var email = Email(sender: EmailAddress(address: login.address), recipients: try MailContent.recipients(call.getString("to") ?? ""),
                              ccRecipients: try MailContent.recipients(call.getString("cc") ?? ""), bccRecipients: try MailContent.recipients(call.getString("bcc") ?? ""),
                              subject: try MailContent.safeHeader(call.getString("subject") ?? ""), textBody: call.getString("body") ?? "", attachments: attachments)
            guard !email.allRecipients.isEmpty else { throw NativeMailError.message("請輸入收件者") }
            email.messageID = MessageID.generate(domain: "mail.ntou.edu.tw")
            var headers: [String: String] = [:]
            if let value = call.getString("inReplyTo"), !value.isEmpty { headers["In-Reply-To"] = try MailContent.safeHeader(value) }
            if let value = call.getString("references"), !value.isEmpty { headers["References"] = try MailContent.safeHeader(value) }
            email.additionalHeaders = headers
            let warning = try await MailClient.send(login, email: email)
            return ["sent": true, "warning": warning ?? ""]
        }
    }
}
#endif
