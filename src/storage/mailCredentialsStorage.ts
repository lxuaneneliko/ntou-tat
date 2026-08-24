import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin'
import type { MailCredentials } from '../api/mail'

const MAIL_CREDENTIALS_KEY = 'ntou_tat_mail_credentials_v1'

export const mailCredentialsStore = {
  async save(credentials: MailCredentials): Promise<void> {
    await SecureStoragePlugin.set({
      key: MAIL_CREDENTIALS_KEY,
      value: JSON.stringify(credentials),
    })
  },

  async read(): Promise<MailCredentials | null> {
    try {
      const { value } = await SecureStoragePlugin.get({ key: MAIL_CREDENTIALS_KEY })
      if (!value) return null
      const parsed = JSON.parse(value) as Partial<MailCredentials>
      return typeof parsed.account === 'string' && typeof parsed.password === 'string'
        ? { account: parsed.account, password: parsed.password }
        : null
    } catch {
      return null
    }
  },

  async clear(): Promise<void> {
    try {
      await SecureStoragePlugin.remove({ key: MAIL_CREDENTIALS_KEY })
    } catch {
      // Missing secure-storage entries are already equivalent to signed out.
    }
  },
}
