#if os(iOS)
import BackgroundTasks
import Foundation
import Security
import UserNotifications

private struct NotificationState: Codable {
    var login: MailLogin
    var nextUID: UInt32
    var uidValidity: String
}

/// No push server and no background location. iOS decides whether/when refresh is run.
public enum NativeMailBackground {
    public static let taskIdentifier = "com.lxuan.ntoutat.mail-refresh"
    public static func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { background in
            let task = Task {
                let success = await MailNotifications.shared.check()
                await MailNotifications.shared.schedule()
                background.setTaskCompleted(success: success)
            }
            background.expirationHandler = { task.cancel() }
        }
    }
    public static func schedule() { Task { await MailNotifications.shared.schedule() } }
    public static func foreground() { Task { _ = await MailNotifications.shared.check() } }
}

actor MailNotifications {
    static let shared = MailNotifications()
    private let service = "com.lxuan.ntoutat.mail-notifications"
    private var checking = false
    private var lastCheck = Date.distantPast
    private var generation = 0
    private func read() -> NotificationState? {
        var result: CFTypeRef?
        let status = SecItemCopyMatching([kSecClass: kSecClassGenericPassword, kSecAttrService: service,
                                         kSecAttrAccount: "settings", kSecReturnData: true, kSecMatchLimit: kSecMatchLimitOne] as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return try? JSONDecoder().decode(NotificationState.self, from: data)
    }
    private func save(_ state: NotificationState?) throws {
        let query = [kSecClass: kSecClassGenericPassword, kSecAttrService: service, kSecAttrAccount: "settings"] as [CFString: Any]
        guard let state else {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw NativeMailError.message("通知設定無法清除，請重試") }
            return
        }
        let data = try JSONEncoder().encode(state)
        let attributes = [kSecValueData: data, kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly] as [CFString: Any]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { throw NativeMailError.message("無法安全儲存通知設定") }
    }
    func settings() async -> [String: Any] {
        let settings = await UNUserNotificationCenter.current().notificationSettings()
        let granted = settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional
        return ["enabled": read() != nil && granted, "permissionGranted": granted]
    }
    func configure(enabled: Bool, login: MailLogin?) async throws -> [String: Any] {
        generation += 1
        let version = generation
        if !enabled {
            try save(nil)
            BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: NativeMailBackground.taskIdentifier)
            UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ["ntou-new-mail"])
            UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ["ntou-new-mail"])
            return await settings()
        }
        guard let login else { throw NativeMailError.message("請先登入信箱") }
        guard try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) else { return await settings() }
        guard version == generation else { return await settings() }
        let state = try await MailClient.withInbox(login) { server -> NotificationState in
            let selected = try await server.selectMailbox("INBOX")
            return NotificationState(login: login, nextUID: max(1, selected.uidNext.value), uidValidity: String(describing: selected.uidValidity))
        }
        guard version == generation else { return await settings() }
        try save(state)
        schedule()
        return await settings()
    }
    func schedule() {
        guard read() != nil else { return }
        let request = BGAppRefreshTaskRequest(identifier: NativeMailBackground.taskIdentifier)
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
        // Not a promised interval: iOS may defer or decline this request.
        try? BGTaskScheduler.shared.submit(request)
    }
    func check() async -> Bool {
        guard !checking, Date().timeIntervalSince(lastCheck) >= 5 * 60, var state = read() else { return true }
        checking = true; lastCheck = Date()
        defer { checking = false }
        let version = generation
        do {
            let result = try await MailClient.withInbox(state.login) { server -> (UInt32, String, Int) in
                let selected = try await server.selectMailbox("INBOX")
                let validity = String(describing: selected.uidValidity)
                guard validity == state.uidValidity, selected.uidNext.value > state.nextUID else { return (selected.uidNext.value, validity, 0) }
                // Only count newly arrived unread mail; don't download subjects or message bodies.
                let headers = try await server.fetchMessageInfos(uidRange: SwiftMail.UID(state.nextUID)...SwiftMail.UID(selected.uidNext.value - 1), options: .uidFlagsOnly)
                return (selected.uidNext.value, validity, headers.filter { !$0.flags.contains(where: { $0.description == "seen" }) }.count)
            }
            try Task.checkCancellation()
            guard version == generation, read() != nil else { return true }
            state.nextUID = max(1, result.0); state.uidValidity = result.1
            try save(state)
            if result.2 > 0 {
                let content = UNMutableNotificationContent()
                content.title = "海大信箱"
                content.body = "你有 \(result.2) 封新郵件，開啟海大 TAT 查看。"
                content.sound = .default
                try await UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "ntou-new-mail", content: content, trigger: nil))
            }
            return true
        } catch { return false }
    }
}
import SwiftMail
#endif
