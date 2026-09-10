import type { NtouApi } from './contract'
import {
  mockAnnouncements,
  mockCalendar,
  mockCampusLinks,
  mockCourseFiles,
  mockCredits,
  mockExternalCompetitions,
  mockIndustryNews,
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

  async getCourseSyllabus(semesterId, course) {
    await wait(260)
    return {
      semesterId,
      courseCode: course.courseCode,
      title: course.courseTitle,
      englishTitle: 'Introduction to Marine Data Analysis',
      instructor: course.instructor,
      department: course.department ?? '海洋科學系',
      className: course.className ?? '一A',
      objectiveZh: '建立資料整理、分析與解讀的基礎能力，並能應用於海洋相關問題。',
      objectiveEn: 'Build foundational skills for organizing, analyzing, and interpreting marine data.',
      prerequisitesZh: '基礎統計與程式設計。',
      prerequisitesEn: 'Basic statistics and programming.',
      contentZh: '資料前處理、視覺化、統計推論與案例實作。',
      contentEn: 'Data preparation, visualization, statistical inference, and case studies.',
      teachingMethodZh: '講授、課堂實作與分組討論。',
      teachingMethodEn: 'Lectures, hands-on exercises, and group discussions.',
      referencesZh: '教師自編教材。',
      referencesEn: 'Instructor-provided materials.',
      scheduleZh: '第 1–4 週：資料基礎\n第 5–10 週：分析方法\n第 11–16 週：專題實作',
      scheduleEn: '',
      evaluationZh: '作業 30%、期中 30%、期末專題 40%。',
      evaluationEn: '',
      referenceUrl: '',
    }
  },

  async getExternalCompetitions() {
    await wait()
    return mockExternalCompetitions
  },

  async getIndustryNews() {
    await wait()
    return mockIndustryNews
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
