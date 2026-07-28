import type {
  Announcement,
  AuthSession,
  CalendarEvent,
  CampusLink,
  CourseFile,
  CreditSummary,
  Grade,
  LoginChallenge,
  PortalSystemNode,
  Semester,
  StudentProfile,
  TimetableResponse,
  TrafficInfo,
} from '../types'

export type LoginPayload = {
  studentId: string
  password: string
  captchaCode?: string
  challenge?: LoginChallenge
}

export type NtouApi = {
  getLoginChallenge?: () => Promise<LoginChallenge>
  login: (payload: LoginPayload) => Promise<AuthSession>
  refresh: (refreshToken: string) => Promise<AuthSession>
  getMe: () => Promise<StudentProfile>
  getSemesters: () => Promise<Semester[]>
  getTimetable: (semesterId: string) => Promise<TimetableResponse>
  getGrades: (semesterId: string) => Promise<Grade[]>
  getCredits: () => Promise<CreditSummary>
  getCourseFiles: (courseId: string) => Promise<CourseFile[]>
  getAnnouncements: () => Promise<Announcement[]>
  getCalendar: (from: string, to: string) => Promise<CalendarEvent[]>
  getCampusLinks: () => Promise<CampusLink[]>
  getTraffic: () => Promise<TrafficInfo[]>
  getPortalSystemMenu?: (path: string[]) => Promise<PortalSystemNode[]>
  openPortalSystemPage?: (path: string[]) => Promise<void>
}
