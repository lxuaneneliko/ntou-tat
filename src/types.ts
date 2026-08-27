export type AuthSession = {
  accessToken: string
  refreshToken: string
  expiresAt: string
  profile: StudentProfile
  source?: 'api' | 'mock' | 'portal'
}

export type LoginChallenge = {
  id: string
  source: 'portal' | 'mock' | 'api'
  loginUrl: string
  captchaUrl?: string
  captchaDataUrl?: string
  cookieHeader?: string
  hiddenFields?: Record<string, string>
  fieldNames?: {
    account: string
    password: string
    captcha: string
  }
  submitName?: string
  submitValue?: string
  notice?: string
}

export type StudentProfile = {
  id: string
  name: string
  department: string
  grade: string
  className?: string
  email?: string
  avatarInitials: string
}

export type Semester = {
  id: string
  title: string
  current: boolean
}

export type TimetableSlot = {
  id: string
  courseId: string
  courseCode: string
  courseTitle: string
  instructor: string
  classroom: string
  day: number
  startsAt: string
  endsAt: string
  section: string
  credits: number
  color: string
}

export type TimetableResponse = {
  semesterId: string
  updatedAt: string
  slots: TimetableSlot[]
}

export type CourseSummary = {
  id: string
  code: string
  title: string
  instructor: string
  classroom: string
  credits: number
  color: string
}

export type CourseFile = {
  id: string
  courseId: string
  title: string
  type: string
  size: string
  updatedAt: string
  url: string
}

export type Announcement = {
  id: string
  title: string
  source: string
  publishedAt: string
  pinned: boolean
  url: string
}

export type ExternalCompetition = {
  id: string
  title: string
  publishedAt: string
  source: string
  url: string
}

export type IndustryNews = {
  id: string
  title: string
  publishedAt: string
  source: string
  url: string
}

export type Grade = {
  id: string
  courseId: string
  courseTitle: string
  semester: string
  credits: number
  score: number | null
  letter?: string
  required: boolean
  category: string
}

export type CreditSummary = {
  requiredEarned: number
  requiredTotal: number
  electiveEarned: number
  electiveTotal: number
  generalEarned: number
  generalTotal: number
  serviceEarned: number
  serviceTotal: number
  totalEarned: number
  totalRequired: number
}

export type CalendarEvent = {
  id: string
  title: string
  startsOn: string
  endsOn?: string
  category: string
  time?: string
  notes?: string
  source?: 'official' | 'personal'
}

export type CampusLink = {
  id: string
  title: string
  subtitle: string
  url: string
  group: string
}

export type PortalSystemNode = {
  id: string
  title: string
  kind: 'group' | 'page'
  path: string[]
}

export type TrafficInfo = {
  id: string
  title: string
  subtitle: string
  url: string
}

export type EmergencyContact = {
  id: string
  title: string
  phone: string
  subtitle: string
}

export type TabKey = 'timetable' | 'calendar' | 'grades' | 'mail' | 'more'

export type MoreView =
  | 'portal'
  | 'announcements'
  | 'departments'
  | 'industry'
  | 'competitions'
  | 'calendar'
  | 'campus'
  | 'traffic'
  | 'emergency'
  | 'settings'
