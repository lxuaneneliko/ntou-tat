import { Capacitor, registerPlugin } from '@capacitor/core'

export type MailCredentials = {
  account: string
  password: string
}

export type MailSummary = {
  uid: string
  subject: string
  sender: string
  senderAddress: string
  receivedAt: string
  unread: boolean
}

export type MailInbox = {
  account: string
  total: number
  unread: number
  messages: MailSummary[]
}

export type MailDetail = MailSummary & {
  recipients: string[]
  body: string
  attachments: string[]
}

type NativeMailPlugin = {
  login(options: MailCredentials): Promise<{ account: string }>
  listMessages(options: MailCredentials & { limit?: number }): Promise<MailInbox>
  getMessage(options: MailCredentials & { uid: string }): Promise<MailDetail>
}

const NativeMail = registerPlugin<NativeMailPlugin>('NtouMail')

export const normalizeMailAccount = (account: string) => {
  const value = account.trim().toLowerCase()
  return value.endsWith('@mail.ntou.edu.tw')
    ? value.slice(0, -'@mail.ntou.edu.tw'.length)
    : value
}

const requireNative = () => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('海大信箱僅支援 Android APK')
  }
}

const normalizedCredentials = (credentials: MailCredentials): MailCredentials => ({
  account: normalizeMailAccount(credentials.account),
  password: credentials.password,
})

export const mailApi = {
  async login(credentials: MailCredentials) {
    requireNative()
    return NativeMail.login(normalizedCredentials(credentials))
  },

  async listMessages(credentials: MailCredentials, limit = 30) {
    requireNative()
    return NativeMail.listMessages({ ...normalizedCredentials(credentials), limit })
  },

  async getMessage(credentials: MailCredentials, uid: string) {
    requireNative()
    return NativeMail.getMessage({ ...normalizedCredentials(credentials), uid })
  },
}
