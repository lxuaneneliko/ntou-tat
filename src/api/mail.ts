import { Capacitor, registerPlugin } from '@capacitor/core'
import { decodeMailHeader } from '../mailMime'

export type MailCredentials = { account: string; password: string }
export type MailNotificationSettings = { enabled: boolean; permissionGranted: boolean }
export type MailFolderKind = 'inbox' | 'sent' | 'drafts' | 'archive' | 'trash' | 'spam' | 'starred' | 'custom'
export type MailFolder = { id: string; name: string; kind: MailFolderKind; unread: number; total: number }
export type MailSummary = {
  uid: string
  subject: string
  sender: string
  senderAddress: string
  receivedAt: string
  unread: boolean
  starred: boolean
}
export type MailInbox = {
  account: string
  folder: string
  total: number
  unread: number
  offset: number
  nextOffset: number
  hasMore: boolean
  messages: MailSummary[]
}
export type MailAttachment = { id: string; name: string; mimeType: string; size: number; inline: boolean }
export type MailBodyImage = { id: string; name: string; mimeType: string; src: string; external: boolean }
export type MailDetail = MailSummary & {
  recipients: string[]
  cc: string[]
  replyTo: string[]
  messageId: string
  references: string
  body: string
  bodyImages: MailBodyImage[]
  attachments: MailAttachment[]
}
export type MailOutgoingAttachment = { name: string; mimeType: string; data: string }
export type MailDraft = {
  to: string
  cc?: string
  bcc?: string
  subject: string
  body: string
  inReplyTo?: string
  references?: string
  attachments?: MailOutgoingAttachment[]
}

type NativeMailPlugin = {
  login(options: MailCredentials): Promise<{ account: string }>
  getNotificationSettings(): Promise<MailNotificationSettings>
  setNotifications(options: { enabled: boolean; account?: string; password?: string }): Promise<MailNotificationSettings>
  listFolders(options: MailCredentials): Promise<{ folders: MailFolder[] }>
  listMessages(options: MailCredentials & { folder: string; offset?: number; limit?: number }): Promise<MailInbox>
  getMessage(options: MailCredentials & { folder: string; uid: string }): Promise<MailDetail>
  setFlag(options: MailCredentials & { folder: string; uid: string; flag: 'seen' | 'flagged'; value: boolean }): Promise<void>
  moveMessage(options: MailCredentials & { folder: string; uid: string; targetFolder: string }): Promise<void>
  openAttachment(options: MailCredentials & { folder: string; uid: string; partId: string }): Promise<void>
  sendMessage(options: MailCredentials & MailDraft): Promise<void>
}

const NativeMail = registerPlugin<NativeMailPlugin>('NtouMail')
const isMailMock = import.meta.env.VITE_NTOU_AUTH_MODE === 'mock'
let mockNotificationsEnabled = false

const mockFolders: MailFolder[] = [
  { id: 'INBOX', name: '收件匣', kind: 'inbox', unread: 2, total: 5 },
  { id: 'Sent', name: '寄件備份', kind: 'sent', unread: 0, total: 8 },
  { id: 'Drafts', name: '草稿', kind: 'drafts', unread: 0, total: 1 },
  { id: 'Trash', name: '垃圾桶', kind: 'trash', unread: 0, total: 3 },
]

const mockMessages: MailSummary[] = [
  { uid: '501', subject: '選課結果與開學注意事項', sender: '海大教務處', senderAddress: 'academic@mail.ntou.edu.tw', receivedAt: new Date().toISOString(), unread: true, starred: true },
  { uid: '500', subject: '圖書館借閱到期通知', sender: '海大圖書館', senderAddress: 'library@mail.ntou.edu.tw', receivedAt: new Date(Date.now() - 86400000).toISOString(), unread: true, starred: false },
  { uid: '499', subject: '校園系統維護公告', sender: '圖資處', senderAddress: 'staff@mail.ntou.edu.tw', receivedAt: new Date(Date.now() - 172800000).toISOString(), unread: false, starred: false },
  { uid: '498', subject: '系學會活動報名確認', sender: '系學會', senderAddress: 'student@mail.ntou.edu.tw', receivedAt: new Date(Date.now() - 259200000).toISOString(), unread: false, starred: false },
  { uid: '497', subject: '獎學金申請資料補件', sender: '學務處', senderAddress: 'studentaffairs@mail.ntou.edu.tw', receivedAt: new Date(Date.now() - 345600000).toISOString(), unread: false, starred: false },
]

export const normalizeMailAccount = (account: string) => {
  const value = account.trim().toLowerCase()
  return value.endsWith('@mail.ntou.edu.tw') ? value.slice(0, -'@mail.ntou.edu.tw'.length) : value
}

const requireNative = () => {
  if (!isMailMock && !Capacitor.isNativePlatform()) throw new Error('海大信箱僅支援 Android APK')
}

const normalizedCredentials = (credentials: MailCredentials): MailCredentials => ({
  account: normalizeMailAccount(credentials.account),
  password: credentials.password,
})

const normalizeSummary = <T extends MailSummary>(message: T): T => ({
  ...message,
  subject: decodeMailHeader(message.subject),
  sender: decodeMailHeader(message.sender),
})

export const mailApi = {
  async login(credentials: MailCredentials) {
    requireNative()
    if (isMailMock) return { account: normalizeMailAccount(credentials.account) }
    return NativeMail.login(normalizedCredentials(credentials))
  },
  async getNotificationSettings() {
    requireNative()
    if (isMailMock) return { enabled: mockNotificationsEnabled, permissionGranted: true }
    return NativeMail.getNotificationSettings()
  },
  async setNotifications(enabled: boolean, credentials?: MailCredentials) {
    requireNative()
    if (isMailMock) {
      mockNotificationsEnabled = enabled
      return { enabled, permissionGranted: true }
    }
    return NativeMail.setNotifications({
      enabled,
      ...(credentials ? normalizedCredentials(credentials) : {}),
    })
  },
  async listFolders(credentials: MailCredentials) {
    requireNative()
    if (isMailMock) return { folders: mockFolders }
    return NativeMail.listFolders(normalizedCredentials(credentials))
  },
  async listMessages(credentials: MailCredentials, folder: string, offset = 0, limit = 30) {
    requireNative()
    if (isMailMock) {
      const messages = folder === 'INBOX' ? mockMessages.slice(offset, offset + limit) : []
      return { account: normalizeMailAccount(credentials.account), folder, total: messages.length, unread: messages.filter((message) => message.unread).length, offset, nextOffset: offset + messages.length, hasMore: false, messages: messages.map(normalizeSummary) }
    }
    const page = await NativeMail.listMessages({ ...normalizedCredentials(credentials), folder, offset, limit })
    return { ...page, messages: page.messages.map(normalizeSummary) }
  },
  async getMessage(credentials: MailCredentials, folder: string, uid: string) {
    requireNative()
    if (isMailMock) {
      const summary = mockMessages.find((message) => message.uid === uid) ?? mockMessages[0]
      return normalizeSummary({
        ...summary, unread: false, recipients: [`${normalizeMailAccount(credentials.account)}@mail.ntou.edu.tw`], cc: [],
        replyTo: [summary.senderAddress], messageId: `<mock-${uid}@mail.ntou.edu.tw>`, references: '',
        body: '同學您好：\n\n本信包含完整排版、連結、表格與附件，用來確認海大 TAT 信箱畫面。\n\n海大首頁：https://www.ntou.edu.tw/',
        bodyImages: [{ id: 'mock-poster', name: '課程海報.png', mimeType: 'image/svg+xml', src: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22640%22 height=%22360%22 viewBox=%220 0 640 360%22%3E%3Crect width=%22640%22 height=%22360%22 fill=%22%23075b9f%22/%3E%3Ccircle cx=%22540%22 cy=%2280%22 r=%22120%22 fill=%22%233bb7e8%22 opacity=%22.55%22/%3E%3Ctext x=%2248%22 y=%22155%22 fill=%22white%22 font-size=%2246%22 font-family=%22sans-serif%22 font-weight=%22700%22%3ECOURSE POSTER%3C/text%3E%3Ctext x=%2248%22 y=%22215%22 fill=%22%23d9f4ff%22 font-size=%2226%22 font-family=%22sans-serif%22%3EMail2000 inline image preview%3C/text%3E%3C/svg%3E', external: false }],
        attachments: [{ id: '0.1', name: '選課結果.pdf', mimeType: 'application/pdf', size: 245760, inline: false }],
      })
    }
    const message = await NativeMail.getMessage({ ...normalizedCredentials(credentials), folder, uid })
    return normalizeSummary({ ...message, bodyImages: Array.isArray(message.bodyImages) ? message.bodyImages : [] })
  },
  async setFlag(credentials: MailCredentials, folder: string, uid: string, flag: 'seen' | 'flagged', value: boolean) {
    requireNative()
    if (isMailMock) return
    return NativeMail.setFlag({ ...normalizedCredentials(credentials), folder, uid, flag, value })
  },
  async moveMessage(credentials: MailCredentials, folder: string, uid: string, targetFolder: string) {
    requireNative()
    if (isMailMock) return
    return NativeMail.moveMessage({ ...normalizedCredentials(credentials), folder, uid, targetFolder })
  },
  async openAttachment(credentials: MailCredentials, folder: string, uid: string, partId: string) {
    requireNative()
    if (isMailMock) return
    return NativeMail.openAttachment({ ...normalizedCredentials(credentials), folder, uid, partId })
  },
  async sendMessage(credentials: MailCredentials, draft: MailDraft) {
    requireNative()
    if (isMailMock) return
    return NativeMail.sendMessage({ ...normalizedCredentials(credentials), ...draft })
  },
}
