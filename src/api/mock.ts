import type { NtouApi } from './contract'
import {
  mockAnnouncements,
  mockCalendar,
  mockCampusLinks,
  mockCourseFiles,
  mockCredits,
  mockGrades,
  mockProfile,
  mockSemesters,
  mockTimetable,
  mockTraffic,
} from './mockData'

const wait = (ms = 180) => new Promise((resolve) => window.setTimeout(resolve, ms))

export const createMockApiClient = (): NtouApi => ({
  async getLoginChallenge() {
    return {
      id: 'mock-login',
      source: 'mock',
      loginUrl: 'mock://login',
      notice: '示範模式不需要驗證碼',
    }
  },

  async login(payload) {
    await wait()
    if (!payload.studentId.trim() || !payload.password.trim()) {
      throw new Error('請輸入學號與密碼')
    }

    return {
      accessToken: `mock-access-${crypto.randomUUID()}`,
      refreshToken: `mock-refresh-${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 1000 * 60 * 45).toISOString(),
      profile: mockProfile,
      source: 'mock',
    }
  },

  async refresh() {
    await wait(80)
    return {
      accessToken: `mock-access-${crypto.randomUUID()}`,
      refreshToken: `mock-refresh-${crypto.randomUUID()}`,
      expiresAt: new Date(Date.now() + 1000 * 60 * 45).toISOString(),
      profile: mockProfile,
      source: 'mock',
    }
  },

  async getMe() {
    await wait()
    return mockProfile
  },

  async getSemesters() {
    await wait()
    return mockSemesters
  },

  async getTimetable(semesterId) {
    await wait()
    return { ...mockTimetable, semesterId }
  },

  async getGrades() {
    await wait()
    return mockGrades
  },

  async getCredits() {
    await wait()
    return mockCredits
  },

  async getCourseFiles(courseId) {
    await wait()
    return mockCourseFiles[courseId] ?? []
  },

  async getAnnouncements() {
    await wait()
    return mockAnnouncements
  },

  async getCalendar() {
    await wait()
    return mockCalendar
  },

  async getCampusLinks() {
    await wait()
    return mockCampusLinks
  },

  async getTraffic() {
    await wait()
    return mockTraffic
  },
})
