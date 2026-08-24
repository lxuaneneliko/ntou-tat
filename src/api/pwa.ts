import { currentSemesters } from '../semester'
import type { AuthSession, StudentProfile } from '../types'
import type { NtouApi } from './contract'
import { filterCalendarRange, parseNtouPublicCalendar } from './publicCalendar'
import { campusLinks, emptyCredits, trafficInfo } from './publicData'

export const PWA_SESSION_TOKEN = 'pwa-local-session-v2'

const profileForStudent = (studentId: string): StudentProfile => {
  const normalizedId = studentId.trim()
  return {
    id: normalizedId || 'PWA 本機模式',
    name: normalizedId ? '海大學生' : '海大 TAT',
    department: '',
    grade: '',
    avatarInitials: normalizedId ? normalizedId.slice(-2).toUpperCase() : 'PWA',
  }
}

const pwaSession = (profile: StudentProfile): AuthSession => ({
  accessToken: PWA_SESSION_TOKEN,
  refreshToken: PWA_SESSION_TOKEN,
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
  profile,
  source: 'pwa',
})

export const createPwaApiClient = (): NtouApi => {
  let activeProfile = profileForStudent('')

  return {
    async login(payload) {
      activeProfile = profileForStudent(payload.studentId)
      return pwaSession(activeProfile)
    },

    async refresh() {
      return pwaSession(activeProfile)
    },

    async getMe() {
      return activeProfile
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
  }
}
