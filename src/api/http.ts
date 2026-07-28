import type { AuthStore } from '../storage/authStorage'
import type {
  Announcement,
  CalendarEvent,
  CampusLink,
  CourseFile,
  CreditSummary,
  Semester,
  StudentProfile,
  TrafficInfo,
} from '../types'
import type { LoginPayload, NtouApi } from './contract'
import { UnauthorizedError } from './errors'
import {
  normalizeApiError,
  normalizeGradesResponse,
  normalizeLoginResponse,
  normalizeProfile,
  normalizeTimetableResponse,
} from './mappers'

const jsonHeaders = { 'Content-Type': 'application/json', Accept: 'application/json' }

const readJson = async (response: Response) => {
  const text = await response.text()
  return text ? (JSON.parse(text) as unknown) : null
}

export const createHttpApiClient = (
  baseUrl: string,
  store: AuthStore,
  onUnauthorized: () => void,
): NtouApi => {
  const urlFor = (path: string) => new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`)

  const postWithoutRetry = async (path: string, body: unknown) => {
    const response = await fetch(urlFor(path), {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(body),
    })
    const payload = await readJson(response)
    if (!response.ok) {
      throw normalizeApiError(response.status, payload)
    }
    return payload
  }

  const refreshSession = async (refreshToken: string) => {
    const payload = await postWithoutRetry('auth/refresh', { refreshToken })
    const session = normalizeLoginResponse(payload)
    await store.saveSession(session)
    return session
  }

  const request = async <T>(path: string, init: RequestInit = {}, retry = true): Promise<T> => {
    const session = await store.getSession()
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    if (session?.accessToken) {
      headers.set('Authorization', `Bearer ${session.accessToken}`)
    }

    const response = await fetch(urlFor(path), { ...init, headers })
    const payload = await readJson(response)

    if (response.status === 401 && retry && session?.refreshToken) {
      try {
        await refreshSession(session.refreshToken)
      } catch {
        await store.clearSession()
        onUnauthorized()
        throw new UnauthorizedError()
      }
      return request<T>(path, init, false)
    }

    if (!response.ok) {
      throw normalizeApiError(response.status, payload)
    }

    return payload as T
  }

  return {
    async login(payload: LoginPayload) {
      const response = await postWithoutRetry('auth/login', payload)
      return normalizeLoginResponse(response)
    },

    refresh: refreshSession,

    async getMe() {
      return normalizeProfile(await request<StudentProfile>('me'))
    },

    async getSemesters() {
      return request<Semester[]>('semesters')
    },

    async getTimetable(semesterId) {
      const url = `timetable?semester=${encodeURIComponent(semesterId)}`
      return normalizeTimetableResponse(await request(url))
    },

    async getGrades(semesterId) {
      const url = `grades?semester=${encodeURIComponent(semesterId)}`
      return normalizeGradesResponse(await request(url))
    },

    async getCredits() {
      return request<CreditSummary>('credits')
    },

    async getCourseFiles(courseId) {
      return request<CourseFile[]>(`courses/${encodeURIComponent(courseId)}/files`)
    },

    async getAnnouncements() {
      return request<Announcement[]>('announcements')
    },

    async getCalendar(from, to) {
      return request<CalendarEvent[]>(
        `calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      )
    },

    async getCampusLinks() {
      return request<CampusLink[]>('campus/links')
    },

    async getTraffic() {
      return request<TrafficInfo[]>('campus/traffic')
    },
  }
}
