import { SecureStoragePlugin } from 'capacitor-secure-storage-plugin'
import type { LoginPayload } from '../api/contract'

const CREDENTIALS_KEY = 'ntou_tat_user_credentials'

export const credentialsStore = {
  async saveCredentials(credentials: LoginPayload): Promise<void> {
    try {
      await SecureStoragePlugin.set({
        key: CREDENTIALS_KEY,
        value: JSON.stringify(credentials),
      })
    } catch (error) {
      console.error('Failed to save credentials securely:', error)
    }
  },

  async getCredentials(): Promise<LoginPayload | null> {
    try {
      const { value } = await SecureStoragePlugin.get({ key: CREDENTIALS_KEY })
      if (!value) return null
      return JSON.parse(value) as LoginPayload
    } catch (error) {
      console.warn('Failed to retrieve secure credentials (might not exist):', error)
      return null
    }
  },

  async clearCredentials(): Promise<void> {
    try {
      await SecureStoragePlugin.remove({ key: CREDENTIALS_KEY })
    } catch (error) {
      console.warn('Failed to clear credentials:', error)
    }
  },
}
