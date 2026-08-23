import { currentSemesters } from '../semester'
import type { AuthSession, StudentProfile } from '../types'
import type { NtouApi } from './contract'
import { filterCalendarRange, parseNtouPublicCalendar } from './publicCalendar'
import { campusLinks, emptyCredits, trafficInfo } from './publicData'

const pwaProfile: StudentProfile = {
  id: 'PWA 本機模式',
  name: '海大 TAT',
  department: '',
  grade: '',
  avatarInitials: 'PWA',
}

const pwaSession = (): AuthSession => ({
  accessToken: 'pwa-local-session',
  refreshToken: 'pwa-local-session',
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  profile: pwaProfile,
  source: 'pwa',
})

export const createPwaApiClient = (): NtouApi => ({
  async login() {
    return pwaSession()
  },

  async refresh() {
    return pwaSession()
  },

  async getMe() {
    return pwaProfile
  },

  async getSemesters() {
    return currentSemesters()
  },

  async getTimetable(semesterId) {
    return {
      semesterId,
      updatedAt: new Date().toISOString(),
      slots: [],
    }
  },

  async getGrades() {
    return []
  },

  async getCredits() {
    return emptyCredits
  },

  async getCourseFiles() {
    return []
  },

  async getAnnouncements() {
    return []
  },

  async getCalendar(from, to) {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}ntou-calendar.html`, {
        cache: 'no-store',
      })
      if (!response.ok) return []
      return filterCalendarRange(parseNtouPublicCalendar(await response.text()), from, to)
    } catch {
      return []
    }
  },

  async getCampusLinks() {
    return campusLinks
  },

  async getTraffic() {
    return trafficInfo
  },

  async getPortalSystemMenu() {
    return [
      {
        id: 'pwa-open-ais',
        title: '在瀏覽器開啟 AIS',
        kind: 'page',
        path: ['pwa-open-ais'],
      },
    ]
  },

  async openPortalSystemPage() {
    window.open('https://ais.ntou.edu.tw/', '_blank', 'noopener,noreferrer')
  },
})
