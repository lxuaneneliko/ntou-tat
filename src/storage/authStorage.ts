import { Preferences } from '@capacitor/preferences'
import type { AuthSession } from '../types'

const AUTH_KEY = 'ntou_tat_auth_session'

export type AuthStore = {
  getSession: () => Promise<AuthSession | null>
  saveSession: (session: AuthSession) => Promise<void>
  clearSession: () => Promise<void>
}

export const authStore: AuthStore = {
  async getSession() {
    const { value } = await Preferences.get({ key: AUTH_KEY })
    if (!value) {
      return null
    }

    try {
      return JSON.parse(value) as AuthSession
    } catch {
      await Preferences.remove({ key: AUTH_KEY })
      return null
    }
  },

  async saveSession(session) {
    await Preferences.set({ key: AUTH_KEY, value: JSON.stringify(session) })
  },

  async clearSession() {
    await Preferences.remove({ key: AUTH_KEY })
  },
}
