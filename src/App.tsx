import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import {
  AlertCircle,
  Bell,
  Building2,
  Bus,
  Camera,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  ExternalLink,
  FileText,
  GraduationCap,
  KeyRound,
  LayoutGrid,
  Link as LinkIcon,
  List as ListIcon,
  LogOut,
  Menu,
  MoreVertical,
  Phone,
  Plus,
  RefreshCw,
  Loader2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import './App.css'
import { apiMode, createNtouApi } from './api'
import { UnauthorizedError } from './api/errors'
import { emergencyContacts, emptyCredits } from './api/publicData'
import { clearPortalSession } from './api/portal'
import { cropAvatarFile, readStoredAvatar, storeAvatar } from './avatar'
import { GPA_MAX, hasPassingResult, scoreToGpa } from './gpa'
import { authStore } from './storage/authStorage'
import {
  personalEventsForStudent,
  readPersonalCalendarStore,
  writePersonalCalendarStore,
  type PersonalCalendarStore,
} from './storage/calendarStorage'
import { shouldMarkCalendarDate } from './api/publicCalendar'
import { semestersForStudent } from './semester'
import {
  clearSemesterCache,
  readSemesterCache,
  writeSemesterCache,
  type SemesterCacheEntry,
} from './storage/semesterCache'
import type {
  Announcement,
  AuthSession,
  CalendarEvent,
  CampusLink,
  CourseFile,
  CourseSummary,
  CreditSummary,
  Grade,
  LoginChallenge,
  MoreView,
  PortalSystemNode,
  Semester,
  StudentProfile,
  TabKey,
  TimetableResponse,
  TimetableSlot,
  TrafficInfo,
} from './types'

type AppData = {
  profile: StudentProfile
  semesters: Semester[]
  timetable: TimetableResponse
  grades: Grade[]
  credits: CreditSummary
  announcements: Announcement[]
  calendar: CalendarEvent[]
  campusLinks: CampusLink[]
  traffic: TrafficInfo[]
}

type SemesterData = Pick<AppData, 'timetable' | 'grades' | 'credits'>

type CalendarEventDraft = Pick<
  CalendarEvent,
  'title' | 'startsOn' | 'endsOn' | 'category' | 'time' | 'notes'
>

const weekdays = [
  { value: 1, short: '一' },
  { value: 2, short: '二' },
  { value: 3, short: '三' },
  { value: 4, short: '四' },
  { value: 5, short: '五' },
]

const periods = [
  { value: 0, time: '06:20' },
  { value: 1, time: '08:20' },
  { value: 2, time: '09:20' },
  { value: 3, time: '10:20' },
  { value: 4, time: '11:15' },
  { value: 5, time: '12:10' },
  { value: 6, time: '13:10' },
  { value: 7, time: '14:10' },
  { value: 8, time: '15:10' },
  { value: 9, time: '16:05' },
  { value: 10, time: '17:30' },
  { value: 11, time: '18:30' },
  { value: 12, time: '19:25' },
  { value: 13, time: '20:20' },
  { value: 14, time: '21:15' },
]

const getPeriodLabel = (val: number) => {
  if (val === 0) return '0'
  if (val >= 1 && val <= 4) return String(val)
  if (val === 5) return '中午'
  if (val >= 6 && val <= 10) return String(val - 1) // 6->5, 7->6, 8->7, 9->8, 10->9
  if (val >= 11 && val <= 15) return String(val - 1)
  return String(val)
}

const tabs: Array<{ key: TabKey; label: string; icon: typeof CalendarDays }> = [
  { key: 'timetable', label: '課表', icon: Clock3 },
  { key: 'calendar', label: '行事曆', icon: CalendarDays },
  { key: 'grades', label: '成績', icon: GraduationCap },
  { key: 'clock', label: '鬧鐘', icon: Clock },
  { key: 'more', label: '其它', icon: Menu },
]

const tabTitles: Record<TabKey, string> = {
  timetable: '課表',
  calendar: '行事曆',
  grades: '成績',
  clock: '鬧鐘與計時',
  more: '其它',
}

const messageFromError = (error: unknown) =>
  error instanceof Error ? error.message : '發生未知錯誤'

const coursesFromTimetable = (slots: TimetableSlot[]): CourseSummary[] => {
  const courses = new Map<string, CourseSummary>()
  slots.forEach((slot) => {
    if (!courses.has(slot.courseId)) {
      courses.set(slot.courseId, {
        id: slot.courseId,
        code: slot.courseCode,
        title: slot.courseTitle,
        instructor: slot.instructor,
        classroom: slot.classroom,
        credits: slot.credits,
        color: slot.color,
      })
    }
  })
  return [...courses.values()]
}

const periodsForSlot = (slot: TimetableSlot) => {
  const parsed = slot.section.match(/\d+/g)?.map(Number).filter((value) => value >= 0 && value <= 14)
  if (parsed?.length) {
    const first = Math.min(...parsed)
    const last = Math.max(...parsed)
    return Array.from({ length: last - first + 1 }, (_, index) => first + index)
  }

  const start = periods.find((period) => period.time === slot.startsAt)?.value
  return start === undefined ? [] : [start]
}

const coursePalette = ['#acd6f4', '#eef0b3', '#b9dfc4', '#f1bcc8', '#cdbfee', '#b9dedc']
const TIMETABLE_VIEW_STORAGE_KEY = 'ntou-timetable-view-v2'

const courseColor = (slot: TimetableSlot) => {
  const key = slot.courseId || slot.courseTitle
  const hash = [...key].reduce((total, character) => total + character.charCodeAt(0), 0)
  return coursePalette[hash % coursePalette.length]
}

type TimetableBlock = {
  slot: TimetableSlot
  startPeriod: number
  endPeriod: number
}

const timetableBlocks = (slots: TimetableSlot[]): TimetableBlock[] => {
  const expanded = new Map<string, { slot: TimetableSlot; period: number }>()
  slots.forEach((slot) => {
    periodsForSlot(slot).forEach((period) => {
      expanded.set(`${slot.day}-${slot.courseId}-${slot.classroom}-${period}`, { slot, period })
    })
  })

  const blocks: TimetableBlock[] = []
  ;[...expanded.values()]
    .sort((left, right) => left.slot.day - right.slot.day || left.period - right.period)
    .forEach(({ slot, period }) => {
      const previous = blocks.at(-1)
      if (
        previous &&
        previous.slot.day === slot.day &&
        previous.slot.courseId === slot.courseId &&
        previous.slot.classroom === slot.classroom &&
        previous.endPeriod + 1 === period
      ) {
        previous.endPeriod = period
        return
      }
      blocks.push({ slot, startPeriod: period, endPeriod: period })
    })
  return blocks
}

const visibleTimetablePeriods = (blocks: TimetableBlock[]) => {
  if (!blocks.length) {
    return periods.filter((period) =>
      period.value >= 1 && period.value <= 10 && period.value !== 5,
    )
  }
  const first = Math.min(1, ...blocks.map((block) => block.startPeriod))
  const last = Math.max(10, ...blocks.map((block) => block.endPeriod))
  return periods.filter((period) =>
    period.value >= first && period.value <= last && period.value !== 5,
  )
}

const creditSummaryFromGrades = (grades: Grade[]): CreditSummary => {
  const passed = grades.filter((grade) =>
    grade.score === null
      ? !/不及格|未通過|F/i.test(grade.letter ?? '')
      : grade.score >= 60,
  )
  const totalEarned = passed.reduce((total, grade) => total + grade.credits, 0)
  const requiredEarned = passed
    .filter((grade) => grade.required)
    .reduce((total, grade) => total + grade.credits, 0)
  return {
    ...emptyCredits,
    totalEarned,
    requiredEarned,
    electiveEarned: totalEarned - requiredEarned,
  }
}

const semesterDataFromCache = (entry: SemesterCacheEntry): SemesterData => ({
  timetable: entry.timetable,
  grades: entry.grades,
  credits: entry.credits,
})

const monthLabel = (date: Date) =>
  `${date.getFullYear()}年${date.getMonth() + 1}月`

const isoDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [data, setData] = useState<AppData | null>(null)
  const [selectedTab, setSelectedTab] = useState<TabKey>('timetable')
  const [timetableViewMode, setTimetableViewMode] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem(TIMETABLE_VIEW_STORAGE_KEY) === 'list' ? 'list' : 'grid'
    } catch {
      return 'grid'
    }
  })
  const [selectedSemester, setSelectedSemester] = useState('')
  const [moreView, setMoreView] = useState<MoreView | null>(null)
  const [customAvatar, setCustomAvatar] = useState(readStoredAvatar)
  const [activeCourse, setActiveCourse] = useState<CourseSummary | null>(null)
  const [courseFiles, setCourseFiles] = useState<Record<string, CourseFile[]>>({})
  const [fileLoadingId, setFileLoadingId] = useState<string | null>(null)
  const [isBooting, setIsBooting] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [appError, setAppError] = useState<string | null>(null)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginBusy, setLoginBusy] = useState(false)
  const [loginChallenge, setLoginChallenge] = useState<LoginChallenge | null>(null)
  const [challengeBusy, setChallengeBusy] = useState(false)
  const [autoCaptchaFailed, setAutoCaptchaFailed] = useState(false)

  // --- NTOU TAT Heavy 重構合併新增之狀態 ---
  const [customCourses, setCustomCourses] = useState<Record<string, TimetableSlot[]>>(() => {
    return JSON.parse(localStorage.getItem('ntou_custom_courses_v9') || '{}')
  })
  const [deletedCourses, setDeletedCourses] = useState<Record<string, string[]>>(() => {
    return JSON.parse(localStorage.getItem('ntou_deleted_courses_v9') || '{}')
  })
  const [customGrades, setCustomGrades] = useState<Record<string, Grade[]>>(() => {
    return JSON.parse(localStorage.getItem('ntou_custom_grades_v9') || '{}')
  })
  const [deletedGrades, setDeletedGrades] = useState<Record<string, string[]>>(() => {
    return JSON.parse(localStorage.getItem('ntou_deleted_grades_v9') || '{}')
  })
  const [alarms, setAlarms] = useState<Array<{ id: string; time: string; label: string; active: boolean }>>(() => {
    return JSON.parse(localStorage.getItem('ntou_alarms_v9') || '[]')
  })
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false)
  const [isAddGradeOpen, setIsAddGradeOpen] = useState(false)
  const [isAddCalendarEventOpen, setIsAddCalendarEventOpen] = useState(false)
  const [calendarEventDate, setCalendarEventDate] = useState(() => isoDate(new Date()))
  const [personalCalendarStore, setPersonalCalendarStore] = useState<PersonalCalendarStore>(
    readPersonalCalendarStore,
  )
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)

  const saveCustomCourses = (newCourses: Record<string, TimetableSlot[]>) => {
    setCustomCourses(newCourses)
    localStorage.setItem('ntou_custom_courses_v9', JSON.stringify(newCourses))
  }
  const saveDeletedCourses = (newDeleted: Record<string, string[]>) => {
    setDeletedCourses(newDeleted)
    localStorage.setItem('ntou_deleted_courses_v9', JSON.stringify(newDeleted))
  }
  const saveCustomGrades = (newGrades: Record<string, Grade[]>) => {
    setCustomGrades(newGrades)
    localStorage.setItem('ntou_custom_grades_v9', JSON.stringify(newGrades))
  }
  const saveDeletedGrades = (newDeleted: Record<string, string[]>) => {
    setDeletedGrades(newDeleted)
    localStorage.setItem('ntou_deleted_grades_v9', JSON.stringify(newDeleted))
  }
  const saveAlarms = (newAlarms: Array<{ id: string; time: string; label: string; active: boolean }>) => {
    setAlarms(newAlarms)
    localStorage.setItem('ntou_alarms_v9', JSON.stringify(newAlarms))
  }
  const savePersonalCalendarStore = (nextStore: PersonalCalendarStore) => {
    setPersonalCalendarStore(nextStore)
    writePersonalCalendarStore(nextStore)
  }
  const saveCustomAvatar = (dataUrl: string) => {
    storeAvatar(dataUrl)
    setCustomAvatar(dataUrl)
  }
  const dataRef = useRef<AppData | null>(null)
  const semesterCacheRef = useRef(new Map<string, SemesterData>())
  const dataRequestRef = useRef(0)

  const applyData = useCallback((nextData: AppData | null) => {
    dataRef.current = nextData
    setData(nextData)
  }, [])

  const handleUnauthorized = useCallback(async () => {
    dataRequestRef.current += 1
    await authStore.clearSession()
    setSession(null)
    applyData(null)
    setSelectedTab('timetable')
    setMoreView(null)
    setActiveCourse(null)
  }, [applyData])

  const api = useMemo(() => createNtouApi(handleUnauthorized), [handleUnauthorized])

  const loadLoginChallenge = useCallback(async (preserveError?: string) => {
    if (!api.getLoginChallenge) {
      return
    }

    setChallengeBusy(true)
    if (!preserveError) {
      setLoginError(null)
    }
    try {
      setLoginChallenge(await api.getLoginChallenge())
    } catch (error) {
      setLoginError(`${messageFromError(error)}。請確認網路後重新整理。`)
    } finally {
      if (preserveError) {
        setLoginError(preserveError)
      }
      setChallengeBusy(false)
    }
  }, [api])

  const loadAppData = useCallback(async (semesterOverride?: string, force = false) => {
    const requestId = ++dataRequestRef.current
    setAppError(null)
    const existing = dataRef.current
    const rawSemesters = existing?.semesters ?? await api.getSemesters()
    const storedSession = await authStore.getSession()
    const profile = existing?.profile ?? storedSession?.profile ?? await api.getMe()
    const semesters = semestersForStudent(rawSemesters, profile.id)
    const readCachedSemester = async (semesterId: string) => {
      const memory = semesterCacheRef.current.get(semesterId)
      if (memory) return memory
      const stored = await readSemesterCache(profile.id, semesterId)
      if (stored) {
        const cachedSemester = semesterDataFromCache(stored)
        semesterCacheRef.current.set(semesterId, cachedSemester)
        return cachedSemester
      }
      return undefined
    }

    let semesterId =
      semesterOverride && semesters.some((semester) => semester.id === semesterOverride)
        ? semesterOverride
        : semesters.find((semester) => semester.current)?.id || semesters[0]?.id || ''
    let cached: SemesterData | undefined
    if (semesterOverride) {
      cached = await readCachedSemester(semesterId)
    } else {
      for (const semester of semesters) {
        const candidate = await readCachedSemester(semester.id)
        if (candidate?.timetable.slots.length) {
          semesterId = semester.id
          cached = candidate
          break
        }
      }
      cached ??= await readCachedSemester(semesterId)
    }
    setSelectedSemester(semesterId)

    const today = new Date()
    const from = isoDate(today)
    const to = isoDate(new Date(today.getFullYear(), today.getMonth() + 5, today.getDate()))

    const loadErrors: string[] = []
    const loadOptional = async <T,>(label: string, request: Promise<T>, fallback: T) => {
      try {
        return await request
      } catch (error) {
        if (error instanceof UnauthorizedError) throw error
        loadErrors.push(`${label}：${messageFromError(error)}`)
        return fallback
      }
    }

    // Prepare initial empty or cached semester data
    const emptySemester: SemesterData = {
      timetable: { semesterId, updatedAt: new Date().toISOString(), slots: [] },
      grades: [],
      credits: emptyCredits,
    }
    const initialSemester = cached ?? emptySemester

    // Apply initial profile and cached timetable/grades immediately to render UI instantly
    applyData({
      profile,
      semesters,
      ...initialSemester,
      announcements: existing?.announcements ?? [],
      calendar: existing?.calendar ?? [],
      campusLinks: existing?.campusLinks ?? [],
      traffic: existing?.traffic ?? [],
    })

    // Fetch public data (announcements, calendar, campus links, traffic) in background
    if (!existing) {
      void Promise.all([
        loadOptional('公告', api.getAnnouncements(), []),
        loadOptional('行事曆', api.getCalendar(from, to), []),
        loadOptional('校園連結', api.getCampusLinks(), []),
        loadOptional('交通資訊', api.getTraffic(), []),
      ]).then(([ann, cal, links, traf]) => {
        if (requestId !== dataRequestRef.current) return
        const current = dataRef.current
        if (current) {
          applyData({
            ...current,
            announcements: ann,
            calendar: cal,
            campusLinks: links,
            traffic: traf,
          })
        }
      }).catch(() => {})
    }

    if (cached && !force) {
      if (loadErrors.length) {
        setAppError(`部分資料讀取失敗：${loadErrors.join('；')}`)
      }
      return
    }

    const loadSemesterPart = async <T,>(
      label: string,
      fetchFn: () => Promise<T>,
    ): Promise<{ value: T | null; error: unknown | null }> => {
      try {
        return { value: await fetchFn(), error: null }
      } catch (error) {
        loadErrors.push(`${label}：${messageFromError(error)}`)
        return { value: null, error }
      }
    }

    let activeSemesterId = semesterId
    let activeInitialSemester = initialSemester
    let timetableResult = await loadSemesterPart('課表', () => api.getTimetable(activeSemesterId))

    if (
      !semesterOverride &&
      !(timetableResult.value?.slots.length || activeInitialSemester.timetable.slots.length)
    ) {
      const currentIndex = semesters.findIndex((semester) => semester.id === activeSemesterId)
      for (const semester of semesters.slice(currentIndex + 1)) {
        const candidateCached = await readCachedSemester(semester.id)
        const candidateResult = await loadSemesterPart('課表', () => api.getTimetable(semester.id))
        const candidateTimetable = candidateResult.value ?? candidateCached?.timetable
        if (!candidateTimetable?.slots.length) continue

        activeSemesterId = semester.id
        activeInitialSemester = candidateCached ?? {
          timetable: candidateTimetable,
          grades: [],
          credits: emptyCredits,
        }
        timetableResult = {
          value: candidateTimetable,
          error: candidateResult.error,
        }
        setSelectedSemester(activeSemesterId)
        break
      }
    }

    const gradesResult = await loadSemesterPart('成績', () => api.getGrades(activeSemesterId))
    if (requestId !== dataRequestRef.current) return

    const timetable = timetableResult.value ?? activeInitialSemester.timetable
    const grades = gradesResult.value ?? activeInitialSemester.grades
    const credits = gradesResult.value
      ? creditSummaryFromGrades(gradesResult.value)
      : activeInitialSemester.credits
    const semesterData = { timetable, grades, credits }
    semesterCacheRef.current.set(activeSemesterId, semesterData)

    const current = dataRef.current
    applyData({
      profile,
      semesters,
      ...semesterData,
      announcements: current?.announcements ?? existing?.announcements ?? [],
      calendar: current?.calendar ?? existing?.calendar ?? [],
      campusLinks: current?.campusLinks ?? existing?.campusLinks ?? [],
      traffic: current?.traffic ?? existing?.traffic ?? [],
    })
    try {
      await writeSemesterCache(profile.id, activeSemesterId, {
        savedAt: new Date().toISOString(),
        ...semesterData,
      })
    } catch {
      // Data remains available in memory when encrypted cache storage is unavailable.
    }
    if (loadErrors.length) {
      setAppError(`部分資料讀取失敗：${loadErrors.join('；')}`)
    }
  }, [api, applyData])

  useEffect(() => {
    let mounted = true
    const boot = async () => {
      try {
        const savedSession = await authStore.getSession()
        if (!mounted) return
        setSession(savedSession)
        if (savedSession) {
          await loadAppData()
        } else {
          await loadLoginChallenge()
        }
      } catch (error) {
        if (!mounted) return
        if (error instanceof UnauthorizedError) {
          if (error.message === 'CAPTCHA_FAILED') {
            setAutoCaptchaFailed(true)
            await loadLoginChallenge('驗證碼自動辨識連續失敗，請手動登入')
          } else {
            await loadLoginChallenge(error.message)
          }
        } else {
          setAppError(messageFromError(error))
        }
      } finally {
        if (mounted) setIsBooting(false)
      }
    }
    void boot()
    return () => {
      mounted = false
    }
  }, [api, loadAppData, loadLoginChallenge])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const handleBackButton = CapApp.addListener('backButton', () => {
      if (isAddCalendarEventOpen) {
        setIsAddCalendarEventOpen(false)
      } else if (isAddCourseOpen) {
        setIsAddCourseOpen(false)
      } else if (isAddGradeOpen) {
        setIsAddGradeOpen(false)
      } else if (activeCourse) {
        setActiveCourse(null)
      } else if (moreView) {
        setMoreView(null)
      } else {
        void CapApp.minimizeApp()
      }
    })
    return () => {
      void handleBackButton.then((h: { remove: () => void }) => h.remove())
    }
  }, [activeCourse, moreView, isAddCalendarEventOpen, isAddCourseOpen, isAddGradeOpen])

  const handleLogin = async (studentId: string, password: string, providedCaptchaCode?: string, rememberMe?: boolean) => {
    setLoginBusy(true)
    setLoginError(null)
    try {
      const { recognizeCaptcha } = await import('./utils/ocr')
      let maxRetries = providedCaptchaCode ? 1 : 3
      let nextSession = null
      let currentChallenge = loginChallenge

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          if (!currentChallenge && api.getLoginChallenge) {
            currentChallenge = await api.getLoginChallenge()
          }
          
          let solvedCaptchaCode = providedCaptchaCode
          if (!solvedCaptchaCode && currentChallenge && currentChallenge.captchaDataUrl) {
             try {
               solvedCaptchaCode = await recognizeCaptcha(currentChallenge!.captchaDataUrl!)
             } catch (ocrError) {
               setAutoCaptchaFailed(true)
               throw ocrError
             }
          }

          nextSession = await api.login({
            studentId,
            password,
            captchaCode: solvedCaptchaCode,
            challenge: currentChallenge ?? undefined,
          })
          
          setAutoCaptchaFailed(false)
          break // Success
        } catch (error: any) {
          currentChallenge = null // Force new challenge on retry
          const errorMessage = messageFromError(error)
          
          // Only retry if it's a captcha error, otherwise throw immediately
          if (!errorMessage.includes('驗證碼') && !errorMessage.includes('captcha') && !errorMessage.includes('重複登入')) {
            throw error
          }
          if (attempt === maxRetries - 1) {
            if (!providedCaptchaCode) {
              setAutoCaptchaFailed(true)
            }
            throw error
          }
        }
      }

      await authStore.saveSession(nextSession!)
      
      if (rememberMe && Capacitor.isNativePlatform()) {
        const { credentialsStore } = await import('./storage/credentialsStorage')
        await credentialsStore.saveCredentials({ studentId, password })
      } else {
        const { credentialsStore } = await import('./storage/credentialsStorage')
        await credentialsStore.clearCredentials()
      }
      
      setSession(nextSession!)
      await loadAppData(undefined, true)
    } catch (error) {
      const message = messageFromError(error)
      setLoginError(message)
      if (api.getLoginChallenge) {
        await loadLoginChallenge(message)
      }
    } finally {
      setLoginBusy(false)
    }
  }

  const refresh = async () => {
    setIsRefreshing(true)
    try {
      await loadAppData(selectedSemester, true)
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        if (error.message === 'CAPTCHA_FAILED') {
          setAutoCaptchaFailed(true)
          await loadLoginChallenge('驗證碼自動辨識連續失敗，請手動登入')
        } else {
          await loadLoginChallenge(error.message)
        }
      } else {
        setAppError(messageFromError(error))
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  const changeSemester = async (semesterId: string) => {
    setSelectedSemester(semesterId)
    setIsRefreshing(true)
    try {
      await loadAppData(semesterId, true)
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        if (error.message === 'CAPTCHA_FAILED') {
          setAutoCaptchaFailed(true)
          await loadLoginChallenge('驗證碼自動辨識連續失敗，請手動登入')
        } else {
          await loadLoginChallenge(error.message)
        }
      } else {
        setAppError(messageFromError(error))
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  const openCourse = async (course: CourseSummary) => {
    setActiveCourse(course)
    if (courseFiles[course.id]) return
    setFileLoadingId(course.id)
    try {
      const files = await api.getCourseFiles(course.id)
      setCourseFiles((current) => ({ ...current, [course.id]: files }))
    } catch (error) {
      setAppError(messageFromError(error))
    } finally {
      setFileLoadingId(null)
    }
  }

  const logout = async () => {
    dataRequestRef.current += 1
    await authStore.clearSession()
    const { credentialsStore } = await import('./storage/credentialsStorage')
    await credentialsStore.clearCredentials()
    await clearPortalSession()
    await clearSemesterCache()
    semesterCacheRef.current.clear()
    setSession(null)
    applyData(null)
    setSelectedTab('timetable')
    setMoreView(null)
    setActiveCourse(null)
    await loadLoginChallenge()
  }

  const beginPortalReauthentication = async () => {
    dataRequestRef.current += 1
    await authStore.clearSession()
    await clearPortalSession()
    setSession(null)
    setMoreView(null)
    setLoginError(null)
    await loadLoginChallenge('海大 AIS 登入已過期，請重新登入')
  }

  const mergedSlots = useMemo(() => {
    if (!data?.timetable) return []
    const presets = data.timetable.slots || []
    const customs = customCourses[selectedSemester] || []
    const fullList = [...presets, ...customs]
    const deletedForSem = deletedCourses[selectedSemester] || []
    return fullList.filter((c) => {
      const key = `${c.day}_${c.section}_${c.courseTitle}`
      return !deletedForSem.includes(key)
    })
  }, [data?.timetable, customCourses, deletedCourses, selectedSemester])

  const mergedGrades = useMemo(() => {
    if (!data?.grades) return []
    const presets = data.grades || []
    const customs = customGrades[selectedSemester] || []
    const fullList = [...presets, ...customs]
    const deletedForSem = deletedGrades[selectedSemester] || []
    return fullList.filter((g) => {
      return !deletedForSem.includes(g.id)
    })
  }, [data?.grades, customGrades, deletedGrades, selectedSemester])

  const personalCalendarEvents = useMemo(
    () => data ? personalEventsForStudent(personalCalendarStore, data.profile.id) : [],
    [data, personalCalendarStore],
  )

  const mergedCalendarEvents = useMemo(
    () => [...(data?.calendar ?? []), ...personalCalendarEvents].sort((a, b) =>
      `${a.startsOn}-${a.time ?? ''}-${a.title}`.localeCompare(
        `${b.startsOn}-${b.time ?? ''}-${b.title}`,
      ),
    ),
    [data?.calendar, personalCalendarEvents],
  )

  const calculatedCreditsAndGpa = useMemo(() => {
    const passed = mergedGrades.filter((grade) =>
      hasPassingResult(grade.score, grade.letter),
    )
    const totalEarned = passed.reduce((total, grade) => total + grade.credits, 0)
    const requiredEarned = passed
      .filter((grade) => grade.required)
      .reduce((total, grade) => total + grade.credits, 0)

    let gpaSum = 0
    let gpaCredits = 0
    mergedGrades.forEach((g) => {
      const pts = scoreToGpa(g.score, g.letter)
      if (pts !== null) {
        gpaSum += pts * g.credits
        gpaCredits += g.credits
      }
    })

    const gpa = gpaCredits > 0 ? (gpaSum / gpaCredits) : 0.0
    return {
      totalEarned,
      requiredEarned,
      electiveEarned: totalEarned - requiredEarned,
      gpa,
    }
  }, [mergedGrades])

  if (isBooting) return <LoadingScreen />

  if (!session || !data) {
    return (
      <LoginScreen
        busy={loginBusy}
        challengeBusy={challengeBusy}
        error={loginError || appError}
        challenge={loginChallenge}
        autoCaptchaFailed={autoCaptchaFailed}
        onRefreshChallenge={() => void loadLoginChallenge()}
        onLogin={handleLogin}
      />
    )
  }

  const title = moreView ? moreViewTitle(moreView) : tabTitles[selectedTab]

  return (
    <div className="app app-dark">
      <div className="app-shell">
        <header className="app-header">
          <div className="header-main">
            {moreView ? (
              <button className="header-icon" type="button" aria-label="返回" onClick={() => setMoreView(null)}>
                <ChevronLeft size={24} />
              </button>
            ) : null}
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            <button
              className="header-icon"
              type="button"
              aria-label="重新整理"
              disabled={isRefreshing}
              onClick={() => void refresh()}
            >
              <RefreshCw className={isRefreshing ? 'spin' : ''} size={22} />
            </button>
            {!moreView ? (
              <div className="header-overflow">
                <button
                  className="header-icon"
                  type="button"
                  aria-label="更多操作"
                  aria-expanded={headerMenuOpen}
                  onClick={() => setHeaderMenuOpen((open) => !open)}
                >
                  <MoreVertical size={24} />
                </button>
                {headerMenuOpen ? (
                  <div className="header-menu" role="menu">
                    {selectedTab === 'timetable' ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setHeaderMenuOpen(false)
                          setIsAddCourseOpen(true)
                        }}
                      >
                        <Plus size={17} />
                        <span>新增自訂課程</span>
                      </button>
                    ) : null}
                    {selectedTab === 'grades' ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setHeaderMenuOpen(false)
                          setIsAddGradeOpen(true)
                        }}
                      >
                        <Plus size={17} />
                        <span>新增模擬成績</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setHeaderMenuOpen(false)
                        setSelectedTab('more')
                      }}
                    >
                      <Menu size={17} />
                      <span>開啟其它功能</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>

        {(selectedTab === 'timetable' || selectedTab === 'grades') && !moreView ? (
          <StudentStrip
            profile={data.profile}
            semesters={data.semesters}
            selectedSemester={selectedSemester}
            onSemesterChange={changeSemester}
            timetableViewMode={selectedTab === 'timetable' ? timetableViewMode : undefined}
            onTimetableViewModeChange={
              selectedTab === 'timetable'
                ? (mode) => {
                    setTimetableViewMode(mode)
                    try {
                      localStorage.setItem(TIMETABLE_VIEW_STORAGE_KEY, mode)
                    } catch {
                      // The timetable still works when storage is unavailable.
                    }
                  }
                : undefined
            }
          />
        ) : null}

        <main className="main-content">
          {appError ? (
            <div className="error-banner">
              <AlertCircle size={18} />
              <span>{appError}</span>
            </div>
          ) : null}

          <div className="view-transition" key={moreView ? `more-${moreView}` : selectedTab}>
            {moreView ? (
              <MoreSubview
                data={data}
                view={moreView}
                onLogout={logout}
                onReauthenticate={beginPortalReauthentication}
                loadPortalMenu={api.getPortalSystemMenu}
                onOpenPortalPage={api.openPortalSystemPage}
              />
            ) : selectedTab === 'timetable' ? (
              <TimetableScreen
                slots={mergedSlots}
                viewMode={timetableViewMode}
                onOpenCourse={(slot) => void openCourse(coursesFromTimetable([slot])[0])}
              />
            ) : selectedTab === 'calendar' ? (
              <CalendarScreen
                events={mergedCalendarEvents}
                onDeleteEvent={(id) => {
                  const event = personalCalendarEvents.find((candidate) => candidate.id === id)
                  if (!event || !confirm(`確定要刪除「${event.title}」嗎？`)) return
                  const nextEvents = personalCalendarEvents.filter((candidate) => candidate.id !== id)
                  const nextStore = { ...personalCalendarStore }
                  if (nextEvents.length) {
                    nextStore[data.profile.id] = nextEvents
                  } else {
                    delete nextStore[data.profile.id]
                  }
                  savePersonalCalendarStore(nextStore)
                }}
                onRequestAdd={(date) => {
                  setCalendarEventDate(date)
                  setIsAddCalendarEventOpen(true)
                }}
              />
            ) : selectedTab === 'grades' ? (
              <GradesScreen
                credits={calculatedCreditsAndGpa}
                grades={mergedGrades}
                onDeleteGrade={(id) => {
                  if (!confirm('確定要刪除這筆模擬成績嗎？')) return
                  const currentDeleted = deletedGrades[selectedSemester] || []
                  const nextDeleted = [...currentDeleted, id]
                  const nextCustom = (customGrades[selectedSemester] || []).filter((g) => g.id !== id)
                  saveDeletedGrades({ ...deletedGrades, [selectedSemester]: nextDeleted })
                  saveCustomGrades({ ...customGrades, [selectedSemester]: nextCustom })
                }}
              />
            ) : selectedTab === 'clock' ? (
              <ClockScreen
                alarms={alarms}
                onSaveAlarms={saveAlarms}
              />
            ) : (
              <MoreScreen
                avatarUrl={customAvatar}
                data={data}
                onAvatarChange={saveCustomAvatar}
                onLogout={logout}
                onOpen={setMoreView}
              />
            )}
          </div>
        </main>

        {!moreView ? (
          <nav className="bottom-nav" aria-label="主功能">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  className={`nav-button ${selectedTab === tab.key ? 'active' : ''}`}
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setHeaderMenuOpen(false)
                    setSelectedTab(tab.key)
                    setActiveCourse(null)
                  }}
                >
                  <Icon size={24} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        ) : null}

        {activeCourse ? (
          <CourseSheet
            course={activeCourse}
            files={courseFiles[activeCourse.id] ?? []}
            loading={fileLoadingId === activeCourse.id}
            onClose={() => setActiveCourse(null)}
            onDeleteCourse={(courseTitle) => {
              if (!confirm(`確定要從課表中刪除「${courseTitle}」嗎？`)) return
              const currentDeleted = deletedCourses[selectedSemester] || []
              const targetSlot = mergedSlots.find((s) => s.courseTitle === courseTitle)
              if (targetSlot) {
                const key = `${targetSlot.day}_${targetSlot.section}_${courseTitle}`
                const nextDeleted = [...currentDeleted, key]
                saveDeletedCourses({ ...deletedCourses, [selectedSemester]: nextDeleted })
                const nextCustom = (customCourses[selectedSemester] || []).filter((s) => s.courseTitle !== courseTitle)
                saveCustomCourses({ ...customCourses, [selectedSemester]: nextCustom })
              }
              setActiveCourse(null)
            }}
          />
        ) : null}

        {isAddCourseOpen ? (
          <AddCourseModal
            onClose={() => setIsAddCourseOpen(false)}
            onSave={(name, code, teacher, room, day, period) => {
              const newSlot: TimetableSlot = {
                id: `custom-${Date.now()}`,
                courseId: `custom-${Date.now()}`,
                courseCode: code || 'CUSTOM',
                courseTitle: name,
                instructor: teacher,
                classroom: room,
                day,
                startsAt: periods[period]?.time || '08:20',
                endsAt: '',
                section: String(period),
                credits: 2,
                color: ['#176db9', '#0a8f68', '#7c3aed', '#c45616', '#d81b4e'][Math.floor(Math.random() * 5)],
              }
              const currentCustom = customCourses[selectedSemester] || []
              saveCustomCourses({ ...customCourses, [selectedSemester]: [...currentCustom, newSlot] })
              setIsAddCourseOpen(false)
            }}
          />
        ) : null}

        {isAddGradeOpen ? (
          <AddGradeModal
            onClose={() => setIsAddGradeOpen(false)}
            onSave={(name, credits, score, required, category) => {
              const newGrade: Grade = {
                id: `custom-grade-${Date.now()}`,
                courseId: `custom-grade-${Date.now()}`,
                courseTitle: name,
                semester: selectedSemester,
                credits,
                score,
                required,
                category,
              }
              const currentCustom = customGrades[selectedSemester] || []
              saveCustomGrades({ ...customGrades, [selectedSemester]: [...currentCustom, newGrade] })
              setIsAddGradeOpen(false)
            }}
          />
        ) : null}

        {isAddCalendarEventOpen ? (
          <AddCalendarEventModal
            initialDate={calendarEventDate}
            onClose={() => setIsAddCalendarEventOpen(false)}
            onSave={(draft) => {
              const event: CalendarEvent = {
                id: `personal-calendar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                ...draft,
                source: 'personal',
              }
              const currentEvents = personalEventsForStudent(personalCalendarStore, data.profile.id)
              savePersonalCalendarStore({
                ...personalCalendarStore,
                [data.profile.id]: [...currentEvents, event],
              })
              setIsAddCalendarEventOpen(false)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

function StudentStrip({
  onSemesterChange,
  onTimetableViewModeChange,
  profile,
  selectedSemester,
  semesters,
  timetableViewMode,
}: {
  onSemesterChange: (semesterId: string) => Promise<void>
  onTimetableViewModeChange?: (mode: 'grid' | 'list') => void
  profile: StudentProfile
  selectedSemester: string
  semesters: Semester[]
  timetableViewMode?: 'grid' | 'list'
}) {
  return (
    <div className="student-strip">
      <div className="student-identity">
        <strong>{profile.id}</strong>
      </div>
      <div className="student-strip-controls">
        {timetableViewMode && onTimetableViewModeChange ? (
          <div className="timetable-view-switch" role="group" aria-label="課表顯示方式">
            <button
              className={timetableViewMode === 'grid' ? 'active' : ''}
              type="button"
              aria-label="格狀課表"
              aria-pressed={timetableViewMode === 'grid'}
              title="格狀課表"
              onClick={() => onTimetableViewModeChange('grid')}
            >
              <LayoutGrid size={20} />
            </button>
            <button
              className={timetableViewMode === 'list' ? 'active' : ''}
              type="button"
              aria-label="條列課表"
              aria-pressed={timetableViewMode === 'list'}
              title="條列課表"
              onClick={() => onTimetableViewModeChange('list')}
            >
              <ListIcon size={21} />
            </button>
          </div>
        ) : null}
        <label className="semester-select">
          <span className="sr-only">學期</span>
          <select
            value={selectedSemester}
            onChange={(event) => void onSemesterChange(event.target.value)}
          >
            {semesters.map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semester.id}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )
}

function TimetableScreen({
  onOpenCourse,
  slots,
  viewMode,
}: {
  onOpenCourse: (slot: TimetableSlot) => void
  slots: TimetableSlot[]
  viewMode: 'grid' | 'list'
}) {
  const today = new Date().getDay()
  const [listDay, setListDay] = useState(() => (today >= 1 && today <= 5 ? today : 1))
  const blocks = useMemo(() => timetableBlocks(slots), [slots])
  const visiblePeriods = useMemo(() => visibleTimetablePeriods(blocks), [blocks])
  const periodRows = new Map(visiblePeriods.map((period, index) => [period.value, index + 2]))
  const cells = useMemo(() => {
    const expanded = new Map<string, { slot: TimetableSlot; period: number }>()
    slots.forEach((slot) => {
      periodsForSlot(slot).forEach((period) => {
        if (slot.day < 1 || slot.day > 5) return
        expanded.set(`${slot.day}-${period}-${slot.courseId}`, { slot, period })
      })
    })
    return [...expanded.values()]
  }, [slots])
  const listGroups = useMemo(() => {
    const grouped = new Map<number, TimetableBlock[]>()
    blocks
      .filter((block) => block.slot.day >= 1 && block.slot.day <= 7)
      .sort(
        (left, right) =>
          left.slot.day - right.slot.day ||
          left.startPeriod - right.startPeriod ||
          left.slot.courseTitle.localeCompare(right.slot.courseTitle, 'zh-TW'),
      )
      .forEach((block) => {
        const dayBlocks = grouped.get(block.slot.day) ?? []
        dayBlocks.push(block)
        grouped.set(block.slot.day, dayBlocks)
      })
    return [...grouped.entries()]
  }, [blocks])
  const selectedListBlocks = listGroups.find(([day]) => day === listDay)?.[1] ?? []

  return (
    <section className="timetable-screen">
      {viewMode === 'grid' ? (
        <div
          className="timetable-grid"
          role="grid"
          aria-label="每週課表"
          style={{ '--period-count': visiblePeriods.length } as CSSProperties}
        >
          <div className="grid-corner" role="columnheader" aria-label="節次" />
          {weekdays.map((day, dayIndex) => (
            <div
              className={`day-header ${today === day.value ? 'today' : ''}`}
              key={day.value}
              role="columnheader"
              style={{ gridColumn: dayIndex + 2 }}
            >
              {day.short}
            </div>
          ))}
          {visiblePeriods.map((period, periodIndex) => (
            <div
              className={`period-band ${periodIndex % 2 ? 'alternate' : ''}`}
              key={`band-${period.value}`}
              style={{ gridColumn: '1 / -1', gridRow: periodIndex + 2 }}
            />
          ))}
          {visiblePeriods.map((period, periodIndex) => (
            <div
              className="period-label"
              key={period.value}
              role="rowheader"
              style={{ gridColumn: 1, gridRow: periodIndex + 2 }}
            >
              <strong>{getPeriodLabel(period.value)}</strong>
              <span>{period.time}</span>
            </div>
          ))}
          {cells.map(({ slot, period }) => {
            const row = periodRows.get(period)
            if (!row) return null
            return (
              <button
                className="course-cell"
                key={`${slot.day}-${slot.courseId}-${period}`}
                style={{
                  '--course-color': courseColor(slot),
                  gridColumn: slot.day + 1,
                  gridRow: row,
                } as CSSProperties}
                type="button"
                onClick={() => onOpenCourse(slot)}
              >
                <strong>{slot.courseTitle}</strong>
                {slot.classroom ? <span>{slot.classroom}</span> : null}
              </button>
            )
          })}
        </div>
      ) : (
        <div className="timetable-list" aria-label="條列課表">
          <div className="day-picker" role="tablist" aria-label="選擇星期">
            {weekdays.map((day) => (
              <button
                className={listDay === day.value ? 'active' : ''}
                key={day.value}
                type="button"
                role="tab"
                aria-selected={listDay === day.value}
                onClick={() => setListDay(day.value)}
              >
                {day.short}
              </button>
            ))}
          </div>
          <section className="timetable-list-day">
            <div className={`timetable-list-day-label ${today === listDay ? 'today' : ''}`}>
              <span>星期{weekdays.find((day) => day.value === listDay)?.short}</span>
              <small>{selectedListBlocks.length} 堂</small>
            </div>
            {selectedListBlocks.length ? (
              <div className="timetable-list-rows">
                {selectedListBlocks.map((block) => {
                  const periodLabel =
                    block.startPeriod === block.endPeriod
                      ? `第 ${getPeriodLabel(block.startPeriod)} 節`
                      : `第 ${getPeriodLabel(block.startPeriod)}-${getPeriodLabel(block.endPeriod)} 節`
                  const timeLabel = [block.slot.startsAt, block.slot.endsAt]
                    .filter(Boolean)
                    .join(' - ')
                  const locationLabel = [block.slot.instructor, block.slot.classroom]
                    .filter(Boolean)
                    .join(' · ')

                  return (
                    <button
                      className="timetable-list-row"
                      key={`${listDay}-${block.slot.courseId}-${block.startPeriod}`}
                      type="button"
                      onClick={() => onOpenCourse(block.slot)}
                    >
                      <span
                        className="timetable-list-color"
                        style={{ '--course-color': courseColor(block.slot) } as CSSProperties}
                        aria-hidden="true"
                      />
                      <span className="timetable-list-time">
                        <strong>{periodLabel}</strong>
                        {timeLabel ? <small>{timeLabel}</small> : null}
                      </span>
                      <span className="timetable-list-course">
                        <strong>{block.slot.courseTitle}</strong>
                        {locationLabel ? <small>{locationLabel}</small> : null}
                      </span>
                      <ChevronRight size={18} aria-hidden="true" />
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="inline-empty compact timetable-day-empty">
                <Clock3 size={22} />
                <span>星期{weekdays.find((day) => day.value === listDay)?.short}沒有課程</span>
              </div>
            )}
          </section>
        </div>
      )}
      {!slots.length ? (
        <div className="inline-empty timetable-empty">
          <Clock3 size={24} />
          <strong>尚未取得 AIS 課表</strong>
          <span>這個學期沒有課程，或 AIS 暫時沒有回傳選課課表</span>
        </div>
      ) : null}
    </section>
  )
}

function CalendarScreen({
  events,
  onDeleteEvent,
  onRequestAdd,
}: {
  events: CalendarEvent[]
  onDeleteEvent: (id: string) => void
  onRequestAdd: (date: string) => void
}) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState(() => isoDate(new Date()))
  const swipeStart = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const suppressCalendarClick = useRef(false)
  const firstDayOffset = (cursor.getDay() + 6) % 7
  const totalDays = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDayOffset + 1
    return day >= 1 && day <= totalDays ? day : null
  })
  const selectedEvents = events
    .filter((event) => {
      const end = event.endsOn || event.startsOn
      return selectedDate >= event.startsOn && selectedDate <= end
    })
    .sort((a, b) =>
      `${a.time ?? '99:99'}-${a.title}`.localeCompare(`${b.time ?? '99:99'}-${b.title}`),
    )
  const shiftMonth = (offset: number) => {
    setCursor((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + offset, 1)
      setSelectedDate(isoDate(next))
      return next
    })
  }
  const startMonthSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    swipeStart.current = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    }
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // Synthetic pointer events and older WebViews may not expose an active pointer.
    }
  }
  const finishMonthSwipe = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current
    swipeStart.current = null
    if (!start || start.pointerId !== event.pointerId) return

    const horizontal = event.clientX - start.x
    const vertical = event.clientY - start.y
    if (Math.abs(horizontal) < 48 || Math.abs(horizontal) <= Math.abs(vertical) * 1.2) return

    suppressCalendarClick.current = true
    window.setTimeout(() => {
      suppressCalendarClick.current = false
    }, 0)
    shiftMonth(horizontal < 0 ? 1 : -1)
  }

  return (
    <section className="calendar-screen">
      <div
        className="calendar-swipe-area"
        onClickCapture={(event) => {
          if (!suppressCalendarClick.current) return
          event.preventDefault()
          event.stopPropagation()
        }}
        onPointerCancel={() => {
          swipeStart.current = null
        }}
        onPointerDown={startMonthSwipe}
        onPointerUp={finishMonthSwipe}
      >
        <div className="calendar-toolbar">
          <button
            className="plain-icon"
            type="button"
            aria-label="上個月"
            onClick={() => shiftMonth(-1)}
          >
            <ChevronLeft size={22} />
          </button>
          <strong>{monthLabel(cursor)}</strong>
          <div className="calendar-toolbar-actions">
            <button
              className="plain-icon"
              type="button"
              aria-label="下個月"
              onClick={() => shiftMonth(1)}
            >
              <ChevronRight size={22} />
            </button>
            <button
              className="plain-icon calendar-add"
              type="button"
              aria-label="新增個人事件"
              title="新增個人事件"
              onClick={() => onRequestAdd(selectedDate)}
            >
              <Plus size={21} />
            </button>
          </div>
        </div>
        <div className="calendar-weekdays">
          {['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="calendar-grid" key={`${cursor.getFullYear()}-${cursor.getMonth()}`}>
          {cells.map((day, index) => {
            if (!day) return <span className="calendar-blank" key={`blank-${index}`} />
            const date = isoDate(new Date(cursor.getFullYear(), cursor.getMonth(), day))
            const dateEvents = events.filter((event) => shouldMarkCalendarDate(event, date))
            const hasOfficialEvent = dateEvents.some((event) => event.source !== 'personal')
            const hasPersonalEvent = dateEvents.some((event) => event.source === 'personal')
            return (
              <button
                className={`calendar-day ${selectedDate === date ? 'selected' : ''}`}
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
              >
                <span>{day}</span>
                {hasOfficialEvent || hasPersonalEvent ? (
                  <span className="calendar-markers" aria-hidden="true">
                    {hasOfficialEvent ? <i className="official" /> : null}
                    {hasPersonalEvent ? <i className="personal" /> : null}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
      <div className="agenda">
        <div className="section-label">{selectedDate}</div>
        {selectedEvents.length ? (
          selectedEvents.map((event) => (
            <div className={`agenda-row ${event.source === 'personal' ? 'personal' : 'official'}`} key={event.id}>
              <span className="agenda-dot" />
              <div className="agenda-copy">
                <strong>{event.title}</strong>
                <span>
                  {event.category}
                  {event.time ? ` · ${event.time}` : ''}
                  {event.endsOn && event.endsOn !== event.startsOn ? ` · 至 ${event.endsOn}` : ''}
                </span>
                {event.notes ? <p>{event.notes}</p> : null}
              </div>
              {event.source === 'personal' ? (
                <button
                  className="agenda-delete"
                  type="button"
                  aria-label={`刪除${event.title}`}
                  title="刪除個人事件"
                  onClick={() => onDeleteEvent(event.id)}
                >
                  <Trash2 size={17} />
                </button>
              ) : null}
            </div>
          ))
        ) : (
          <div className="inline-empty compact">
            <CalendarDays size={22} />
            <span>此日期沒有行事</span>
          </div>
        )}
      </div>
    </section>
  )
}

function GradesScreen({
  credits,
  grades,
  onDeleteGrade,
}: {
  credits: { totalEarned: number; requiredEarned: number; electiveEarned: number; gpa: number }
  grades: Grade[]
  onDeleteGrade: (id: string) => void
}) {
  const gpaPercent = Math.min(100, Math.max(0, (credits.gpa / GPA_MAX) * 100))

  return (
    <section className="grades-screen" style={{ padding: '12px' }}>
      {/* Dynamic Glassmorphic GPA Dashboard Card */}
      <div
        className="gpa-dashboard-card"
        style={{
          background: 'rgba(23, 26, 31, 0.65)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '18px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          boxShadow: 'var(--shadow)',
        }}
      >
        <div style={{ display: 'grid', gap: '6px' }}>
          <span style={{ color: 'var(--muted)', fontSize: '12px', fontWeight: 700 }}>GPA 試算與學分統計</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{ fontSize: '32px', fontWeight: 900, color: 'var(--active)' }}>{credits.gpa.toFixed(2)}</span>
            <span style={{ color: 'var(--muted)', fontSize: '14px' }}>/ 4.00</span>
          </div>
          <div style={{ color: 'var(--ink)', fontSize: '13px', display: 'flex', gap: '10px' }}>
            <span>已得：<strong>{credits.totalEarned}</strong> 學分</span>
            <span>必修：<strong>{credits.requiredEarned}</strong></span>
          </div>
        </div>

        {/* Conic progress circle wrapper */}
        <div
          className="gpa-circle-progress"
          style={{
            position: 'relative',
            width: '68px',
            height: '68px',
            borderRadius: '50%',
            background: `conic-gradient(var(--active) ${gpaPercent}%, #252a30 0)`,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div
            style={{
              width: '54px',
              height: '54px',
              borderRadius: '50%',
              background: '#171a1f',
              display: 'grid',
              placeItems: 'center',
              fontSize: '11px',
              fontWeight: 800,
              color: 'var(--ink)',
            }}
          >
            {Math.round(gpaPercent)}%
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span className="section-label" style={{ margin: 0 }}>學期成績清單</span>
      </div>

      {grades.length ? (
        <div className="grade-list" style={{ borderTop: '1px solid var(--line)', background: '#111419', borderRadius: '8px', overflow: 'hidden' }}>
          {grades.map((grade) => (
            <div className="grade-row" key={grade.id} style={{ borderBottom: '1px solid var(--line)', padding: '12px 14px' }}>
              <div style={{ flex: 1 }}>
                <strong style={{ display: 'block', fontSize: '14px', marginBottom: '3px' }}>{grade.courseTitle}</strong>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                  {grade.credits} 學分 · {grade.category} {grade.required ? '(必修)' : '(選修)'}
                  {grade.id.startsWith('custom-') ? ' · [模擬]' : ''}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <b style={{ fontSize: '20px', color: '#65c5ff' }}>{grade.score ?? grade.letter ?? '—'}</b>
                {grade.id.startsWith('custom-') ? (
                  <button
                    type="button"
                    style={{
                      background: 'transparent',
                      color: 'var(--danger)',
                      padding: '6px',
                      borderRadius: '4px',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                    onClick={() => onDeleteGrade(grade.id)}
                    aria-label="刪除模擬成績"
                  >
                    <Trash2 size={15} />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="inline-empty" style={{ background: '#111419', borderRadius: '8px' }}>
          <GraduationCap size={26} />
          <strong>尚未取得 AIS 成績</strong>
          <span>請按右上角重新整理；模擬成績已移到三點選單</span>
        </div>
      )}
    </section>
  )
}

function MoreScreen({
  avatarUrl,
  data,
  onAvatarChange,
  onLogout,
  onOpen,
}: {
  avatarUrl: string
  data: AppData
  onAvatarChange: (dataUrl: string) => void
  onLogout: () => Promise<void>
  onOpen: (view: MoreView) => void
}) {
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [avatarBusy, setAvatarBusy] = useState(false)

  const changeAvatar = async (file?: File) => {
    if (!file) return
    setAvatarBusy(true)
    try {
      onAvatarChange(await cropAvatarFile(file))
    } catch (error) {
      alert(messageFromError(error))
    } finally {
      setAvatarBusy(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  const tools: Array<{ icon: typeof Bell; label: string; view: MoreView }> = [
    { icon: Building2, label: '海大校務系統', view: 'portal' },
    { icon: Bell, label: '校務公告', view: 'announcements' },
    { icon: CalendarDays, label: '重要日期', view: 'calendar' },
    { icon: LinkIcon, label: '海大連結', view: 'campus' },
    { icon: Bus, label: '交通與地圖', view: 'traffic' },
    { icon: Phone, label: '緊急聯絡', view: 'emergency' },
    { icon: ShieldCheck, label: '帳號與設定', view: 'settings' },
  ]
  return (
    <section className="more-screen">
      <div className="profile-block">
        <button
          className="avatar-picker"
          type="button"
          aria-label="更換頭像"
          title="更換頭像"
          disabled={avatarBusy}
          onClick={() => avatarInputRef.current?.click()}
        >
          <span className="student-avatar large">
            {avatarUrl ? <img src={avatarUrl} alt="" /> : data.profile.avatarInitials}
          </span>
          <span className="avatar-picker-badge" aria-hidden="true">
            <Camera size={12} />
          </span>
        </button>
        <input
          ref={avatarInputRef}
          className="sr-only"
          type="file"
          accept="image/*"
          tabIndex={-1}
          onChange={(event) => void changeAvatar(event.target.files?.[0])}
        />
        <div>
          <strong>{data.profile.name === data.profile.id ? '海大學生' : data.profile.name}</strong>
          <span>{data.profile.id}</span>
        </div>
      </div>
      <div className="tool-list">
        {tools.map((tool) => {
          const Icon = tool.icon
          return (
            <button key={tool.view} type="button" onClick={() => onOpen(tool.view)}>
              <Icon size={22} />
              <span>{tool.label}</span>
              <ChevronRight size={19} />
            </button>
          )
        })}
      </div>
      <button className="direct-logout" type="button" onClick={() => void onLogout()}>
        <LogOut size={22} />
        <span>登出海大 AIS</span>
        <ChevronRight size={19} />
      </button>
    </section>
  )
}

function MoreSubview({
  data,
  loadPortalMenu,
  onLogout,
  onOpenPortalPage,
  onReauthenticate,
  view,
}: {
  data: AppData
  loadPortalMenu?: (path: string[]) => Promise<PortalSystemNode[]>
  onLogout: () => Promise<void>
  onOpenPortalPage?: (path: string[]) => Promise<void>
  onReauthenticate: () => Promise<void>
  view: MoreView
}) {
  if (view === 'portal') {
    return (
      <PortalSystemScreen
        loadMenu={loadPortalMenu}
        onOpenPage={onOpenPortalPage}
        onReauthenticate={onReauthenticate}
      />
    )
  }

  if (view === 'settings') {
    return (
      <section className="subview">
        <div className="settings-row">
          <span>資料來源</span>
          <strong>{apiMode === 'portal' ? '海大 AIS 直連' : apiMode}</strong>
        </div>
        <div className="settings-row">
          <span>Cookie</span>
          <strong>僅存在本機</strong>
        </div>
        <button className="logout-button" type="button" onClick={() => void onLogout()}>
          <LogOut size={19} />
          登出
        </button>
      </section>
    )
  }

  if (view === 'emergency') {
    return (
      <LinkList
        items={emergencyContacts.map((contact) => ({
          id: contact.id,
          title: contact.title,
          subtitle: contact.subtitle,
          url: `tel:${contact.phone}`,
        }))}
      />
    )
  }

  if (view === 'campus') return <LinkList items={data.campusLinks} />
  if (view === 'traffic') return <LinkList items={data.traffic} />

  if (view === 'announcements') {
    return data.announcements.length ? (
      <LinkList items={data.announcements.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: `${item.source} · ${item.publishedAt}`,
        url: item.url,
      }))} />
    ) : (
      <div className="inline-empty"><Bell size={24} /><span>尚未取得 AIS 公告</span></div>
    )
  }

  return data.calendar.length ? (
    <div className="event-list">
      {data.calendar.map((event) => (
        <div className="event-row" key={event.id}>
          <CalendarDays size={20} />
          <div><strong>{event.title}</strong><span>{event.startsOn}</span></div>
        </div>
      ))}
    </div>
  ) : (
    <div className="inline-empty"><CalendarDays size={24} /><span>尚未取得海大官方行事曆</span></div>
  )
}

function PortalSystemScreen({
  loadMenu,
  onOpenPage,
  onReauthenticate,
}: {
  loadMenu?: (path: string[]) => Promise<PortalSystemNode[]>
  onOpenPage?: (path: string[]) => Promise<void>
  onReauthenticate: () => Promise<void>
}) {
  const [path, setPath] = useState<string[]>([])
  const [nodes, setNodes] = useState<PortalSystemNode[]>([])
  const [loading, setLoading] = useState(true)
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const cache = useRef(new Map<string, PortalSystemNode[]>())

  useEffect(() => {
    let active = true
    const key = path.join('>')
    const cached = cache.current.get(key)
    if (cached) {
      setNodes(cached)
      setError(null)
      setLoading(false)
      return () => {
        active = false
      }
    }

    if (!loadMenu) {
      setNodes([])
      setError('目前資料模式不支援海大校務系統')
      setLoading(false)
      return () => {
        active = false
      }
    }

    setLoading(true)
    setError(null)
    void loadMenu(path)
      .then((nextNodes) => {
        if (!active) return
        cache.current.set(key, nextNodes)
        setNodes(nextNodes)
      })
      .catch((loadError) => {
        if (!active) return
        setNodes([])
        setError(messageFromError(loadError))
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadMenu, path, retryKey])

  const openNode = async (node: PortalSystemNode) => {
    if (node.kind === 'group') {
      setPath(node.path)
      return
    }
    if (!onOpenPage) {
      setError('目前資料模式無法開啟海大校務功能')
      return
    }

    setOpeningId(node.id)
    setError(null)
    try {
      await onOpenPage(node.path)
    } catch (openError) {
      setError(messageFromError(openError))
    } finally {
      setOpeningId(null)
    }
  }
  const sessionExpired = Boolean(error && /登入.*(?:過期|失效)|工作階段.*失效/i.test(error))

  return (
    <section className="portal-system-screen">
      <div className="portal-system-path">
        {path.length ? (
          <button
            className="plain-icon"
            type="button"
            aria-label="返回上一層校務系統"
            onClick={() => setPath((current) => current.slice(0, -1))}
          >
            <ChevronLeft size={21} />
          </button>
        ) : (
          <Building2 size={22} aria-hidden="true" />
        )}
        <div>
          <strong>{path.at(-1) ?? '海洋大學教學務系統'}</strong>
          {path.length > 1 ? <span>{path.slice(0, -1).join(' / ')}</span> : null}
        </div>
      </div>

      {error ? (
        <div className="portal-system-error-wrap">
          <div className="portal-system-error">
            <AlertCircle size={18} />
            <span>{error}</span>
            <button
              type="button"
              aria-label="重新載入校務系統"
              title="重新載入"
              onClick={() => setRetryKey((key) => key + 1)}
            >
              <RefreshCw size={18} />
            </button>
          </div>
          {sessionExpired ? (
            <button
              className="portal-reauth-button"
              type="button"
              onClick={() => void onReauthenticate()}
            >
              <KeyRound size={18} />
              <span>重新登入 AIS</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="inline-empty compact">
          <div className="spinner small" aria-label="讀取校務系統" />
        </div>
      ) : nodes.length ? (
        <div className="portal-system-list">
          {nodes.map((node) => (
            <button
              key={node.id}
              type="button"
              disabled={openingId === node.id}
              onClick={() => void openNode(node)}
            >
              <span className={`portal-node-icon ${node.kind}`}>
                {node.kind === 'group' ? <Plus size={16} /> : <ExternalLink size={15} />}
              </span>
              <span>{node.title}</span>
              {openingId === node.id ? (
                <RefreshCw className="spin" size={18} />
              ) : (
                <ChevronRight size={18} />
              )}
            </button>
          ))}
        </div>
      ) : !error ? (
        <div className="inline-empty compact">
          <span>此分類沒有可用功能</span>
        </div>
      ) : null}
    </section>
  )
}

function LinkList({
  items,
}: {
  items: Array<{ id: string; title: string; subtitle: string; url: string }>
}) {
  return (
    <div className="link-list">
      {items.map((item) => (
        <a href={item.url} key={item.id} rel="noreferrer" target="_blank">
          <div>
            <strong>{item.title}</strong>
            <span>{item.subtitle}</span>
          </div>
          <ExternalLink size={18} />
        </a>
      ))}
    </div>
  )
}

function CourseSheet({
  course,
  files,
  loading,
  onClose,
  onDeleteCourse,
}: {
  course: CourseSummary
  files: CourseFile[]
  loading: boolean
  onClose: () => void
  onDeleteCourse?: (title: string) => void
}) {
  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="course-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <button className="sheet-close" type="button" aria-label="關閉" onClick={onClose}>
          <X size={21} />
        </button>
        <div className="course-accent" style={{ background: course.color }} />
        <h2>{course.title}</h2>
        <div className="course-code">{course.code || '課程資料'}</div>
        <dl>
          <div><dt>授課教師</dt><dd>{course.instructor || '—'}</dd></div>
          <div><dt>上課地點</dt><dd>{course.classroom || '—'}</dd></div>
          <div><dt>學分</dt><dd>{course.credits || '—'}</dd></div>
        </dl>

        {onDeleteCourse ? (
          <button
            className="delete-course-btn"
            type="button"
            style={{
              width: '100%',
              height: '42px',
              marginTop: '12px',
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
              border: '1px solid #69303e',
              borderRadius: '6px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
            onClick={() => onDeleteCourse(course.title)}
          >
            <Trash2 size={17} />
            刪除此課程
          </button>
        ) : null}

        <div className="section-label">課程檔案</div>
        {loading ? (
          <div className="loading-line" />
        ) : files.length ? (
          files.map((file) => (
            <a className="file-row" href={file.url} key={file.id} rel="noreferrer" target="_blank">
              <FileText size={19} />
              <span>{file.title}</span>
              <ExternalLink size={16} />
            </a>
          ))
        ) : (
          <div className="muted-row">尚未取得課程檔案</div>
        )}
      </section>
    </div>
  )
}

type LoginScreenProps = {
  busy: boolean
  challengeBusy: boolean
  error: string | null
  challenge: LoginChallenge | null
  autoCaptchaFailed: boolean
  onRefreshChallenge: () => void
  onLogin: (studentId: string, password: string, providedCaptchaCode?: string, rememberMe?: boolean) => Promise<void>
}

function LoginScreen({
  busy,
  challengeBusy,
  error,
  challenge,
  autoCaptchaFailed,
  onRefreshChallenge,
  onLogin,
}: LoginScreenProps) {
  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [captchaCode, setCaptchaCode] = useState('')
  const [rememberMe, setRememberMe] = useState(true)

  return (
    <div className="login-page">
      <section className="login-panel">
        <div className="login-brand">
          <div className="brand-icon">
            <img src={`${import.meta.env.BASE_URL}ntou-emblem.png`} alt="海大校徽" />
          </div>
          <div><h1>海大 TAT</h1><p>National Taiwan Ocean University</p></div>
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const form = new FormData(event.currentTarget)
            const submittedStudentId = String(form.get('studentId') ?? studentId)
            const submittedPassword = String(form.get('password') ?? password)
            const submittedCaptcha = String(form.get('captchaCode') ?? captchaCode)
            setStudentId(submittedStudentId)
            setPassword(submittedPassword)
            setCaptchaCode(submittedCaptcha.toUpperCase())
            void onLogin(
              submittedStudentId,
              submittedPassword,
              autoCaptchaFailed ? submittedCaptcha : undefined,
              rememberMe,
            )
          }}
        >
          <label>
            <span>學號</span>
            <input
              name="studentId"
              autoComplete="username"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
            />
          </label>
          <label>
            <span>密碼</span>
            <input
              name="password"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>

          {autoCaptchaFailed && challenge && (
            <label className="captcha-label">
              <span>驗證碼</span>
              <div className="captcha-row">
                <input
                  name="captchaCode"
                  type="text"
                  maxLength={4}
                  autoComplete="off"
                  value={captchaCode}
                  onChange={(event) => setCaptchaCode(event.target.value.toUpperCase())}
                />
                <button
                  type="button"
                  className="refresh-captcha"
                  disabled={challengeBusy || busy}
                  onClick={onRefreshChallenge}
                  title="重新產生驗證碼"
                >
                  {challengeBusy ? <Loader2 size={18} className="spin" /> : <RefreshCw size={18} />}
                </button>
                {challenge.captchaUrl || challenge.captchaDataUrl ? (
                  <img src={challenge.captchaDataUrl || challenge.captchaUrl!} alt="Captcha" />
                ) : (
                  <div className="captcha-placeholder">無法載入</div>
                )}
              </div>
              <div className="captcha-hint">自動辨識失敗，請手動輸入圖中文字</div>
            </label>
          )}

          <label className="remember-me">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>記住帳號密碼並自動登入</span>
          </label>
          {error ? <div className="login-error"><AlertCircle size={18} /><span>{error}</span></div> : null}
          <button
            className="login-button"
            type="submit"
            disabled={busy || challengeBusy}
          >
            <KeyRound size={19} />
            {busy ? '登入中' : '登入'}
          </button>
        </form>
        <div className="privacy-note">
          <ShieldCheck size={17} />
          {rememberMe
            ? '帳密與 Cookie 將加密儲存於本機安全區'
            : '帳密不儲存，Cookie 於本機加密保存'}
        </div>
      </section>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="login-page">
      <div className="spinner" aria-label="載入中" />
    </div>
  )
}

function moreViewTitle(view: MoreView) {
  const titles: Record<MoreView, string> = {
    portal: '海大校務系統',
    announcements: '校務公告',
    calendar: '重要日期',
    campus: '海大連結',
    traffic: '交通與地圖',
    emergency: '緊急聯絡',
    settings: '帳號與設定',
  }
  return titles[view]
}

function ClockScreen({
  alarms,
  onSaveAlarms,
}: {
  alarms: Array<{ id: string; time: string; label: string; active: boolean }>
  onSaveAlarms: (newAlarms: Array<{ id: string; time: string; label: string; active: boolean }>) => void
}) {
  const [timeText, setTimeText] = useState('')
  const [secText, setSecText] = useState('')
  const [dateText, setDateText] = useState('')

  const [isSwRunning, setIsSwRunning] = useState(false)
  const [swMs, setSwMs] = useState(0)
  const swTimerRef = useRef<number | null>(null)

  const [alarmTime, setAlarmTime] = useState('08:00')
  const [alarmLabel, setAlarmLabel] = useState('')
  const [isRinging, setIsRinging] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const oscillatorRef = useRef<OscillatorNode | null>(null)

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const hours = String(now.getHours()).padStart(2, '0')
      const minutes = String(now.getMinutes()).padStart(2, '0')
      const seconds = String(now.getSeconds()).padStart(2, '0')

      setTimeText(`${hours}:${minutes}`)
      setSecText(seconds)

      const weekdays = ['日', '一', '二', '三', '四', '五', '六']
      setDateText(`${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 星期${weekdays[now.getDay()]}`)

      const hhmm = `${hours}:${minutes}`
      const matches = alarms.find((a) => a.active && a.time === hhmm && seconds === '00')
      if (matches) {
        setIsRinging(true)
        startAlarmSound()
      }
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [alarms])

  const startAlarmSound = () => {
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      if (oscillatorRef.current) return

      const ctx = audioCtxRef.current
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, ctx.currentTime)
      osc.connect(gain)
      gain.connect(ctx.destination)

      gain.gain.setValueAtTime(0.5, ctx.currentTime)

      osc.start()
      oscillatorRef.current = osc
    } catch (e) {
      console.error(e)
    }
  }

  const stopAlarmSound = () => {
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop()
        oscillatorRef.current.disconnect()
      } catch {}
      oscillatorRef.current = null
    }
    setIsRinging(false)
  }

  const toggleStopwatch = () => {
    if (isSwRunning) {
      if (swTimerRef.current) clearInterval(swTimerRef.current)
      setIsSwRunning(false)
    } else {
      const start = Date.now() - swMs
      swTimerRef.current = setInterval(() => {
        setSwMs(Date.now() - start)
      }, 37) as any
      setIsSwRunning(true)
    }
  }

  const resetStopwatch = () => {
    if (swTimerRef.current) clearInterval(swTimerRef.current)
    setSwMs(0)
    setIsSwRunning(false)
  }

  const formatStopwatch = (totalMs: number) => {
    const min = String(Math.floor(totalMs / 60000)).padStart(2, '0')
    const sec = String(Math.floor((totalMs % 60000) / 1000)).padStart(2, '0')
    const ms = String(Math.floor((totalMs % 1000) / 10)).padStart(2, '0')
    return `${min}:${sec}.${ms}`
  }

  const addAlarm = (e: React.FormEvent) => {
    e.preventDefault()
    if (!alarmTime) return
    const newAlarm = {
      id: `alarm-${Date.now()}`,
      time: alarmTime,
      label: alarmLabel.trim() || '鬧鐘',
      active: true,
    }
    onSaveAlarms([...alarms, newAlarm])
    setAlarmLabel('')
  }

  const deleteAlarm = (id: string) => {
    onSaveAlarms(alarms.filter((a) => a.id !== id))
  }

  const toggleAlarmActive = (id: string) => {
    onSaveAlarms(
      alarms.map((a) => (a.id === id ? { ...a, active: !a.active } : a))
    )
  }

  return (
    <section className="clock-screen" style={{ padding: '16px', color: 'var(--ink)' }}>
      {isRinging ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999,
            background: 'rgba(15, 23, 42, 0.95)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
          }}
        >
          <Clock className="spin" size={68} style={{ color: 'var(--active)' }} />
          <h2 style={{ fontSize: '24px', fontWeight: 900 }}>鬧鐘響起！</h2>
          <button
            type="button"
            style={{
              padding: '12px 28px',
              background: 'var(--danger)',
              color: '#fff',
              fontSize: '16px',
              fontWeight: 800,
              border: 0,
              borderRadius: '8px',
              boxShadow: '0 4px 14px rgba(255, 0, 0, 0.4)',
            }}
            onClick={stopAlarmSound}
          >
            關閉鬧鐘
          </button>
        </div>
      ) : null}

      <div style={{ textAlign: 'center', margin: '14px 0 24px' }}>
        <div style={{ fontSize: '58px', fontWeight: 900, fontFamily: 'monospace', color: 'var(--active)', lineHeight: 1 }}>
          {timeText}
          <span style={{ fontSize: '24px', color: 'var(--muted)', marginLeft: '4px' }}>{secText}</span>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: '13px', marginTop: '8px', fontWeight: 700 }}>
          {dateText}
        </div>
      </div>

      <div style={{ background: '#111419', borderRadius: '10px', padding: '14px', marginBottom: '20px', border: '1px solid var(--line)' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '12px' }}>
          我的鬧鐘
        </h3>

        <form onSubmit={addAlarm} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
          <input
            type="time"
            value={alarmTime}
            onChange={(e) => setAlarmTime(e.target.value)}
            style={{
              background: '#252a30',
              color: '#fff',
              border: '1px solid var(--line-strong)',
              borderRadius: '6px',
              padding: '6px',
              fontSize: '13px',
              fontWeight: 700,
            }}
          />
          <input
            type="text"
            placeholder="鬧鐘標籤 (例如：早八課表)"
            value={alarmLabel}
            onChange={(e) => setAlarmLabel(e.target.value)}
            style={{
              flex: 1,
              background: '#252a30',
              color: '#fff',
              border: '1px solid var(--line-strong)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '13px',
            }}
          />
          <button
            type="submit"
            style={{
              padding: '6px 14px',
              background: 'var(--brand)',
              color: '#fff',
              fontWeight: 800,
              borderRadius: '6px',
              fontSize: '13px',
            }}
          >
            新增
          </button>
        </form>

        {alarms.length ? (
          <div style={{ display: 'grid', gap: '10px' }}>
            {alarms.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: '#1d2126',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  border: '1px solid rgba(255, 255, 255, 0.04)',
                }}
              >
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: a.active ? 'var(--ink)' : 'var(--muted)' }}>
                    {a.time}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '2px' }}>
                    {a.label}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="checkbox"
                    checked={a.active}
                    onChange={() => toggleAlarmActive(a.id)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <button
                    type="button"
                    style={{ background: 'transparent', color: 'var(--danger)', display: 'grid', placeItems: 'center' }}
                    onClick={() => deleteAlarm(a.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: '12px', textAlign: 'center', padding: '10px 0' }}>
            尚無鬧鐘，設定一個來提醒上課吧！
          </div>
        )}
      </div>

      <div style={{ background: '#111419', borderRadius: '10px', padding: '14px', border: '1px solid var(--line)' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 800, marginBottom: '12px' }}>課程計時器</h3>
        <div style={{ fontSize: '32px', fontWeight: 900, fontFamily: 'monospace', textAlign: 'center', margin: '14px 0', color: 'var(--ink)' }}>
          {formatStopwatch(swMs)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
          <button
            type="button"
            style={{
              padding: '8px 20px',
              background: isSwRunning ? 'var(--danger)' : 'var(--success)',
              color: '#111',
              fontWeight: 800,
              borderRadius: '6px',
              fontSize: '13px',
              minWidth: '78px',
            }}
            onClick={toggleStopwatch}
          >
            {isSwRunning ? '暫停' : '開始'}
          </button>
          <button
            type="button"
            style={{
              padding: '8px 20px',
              background: '#252a30',
              color: '#fff',
              fontWeight: 800,
              border: '1px solid #373d45',
              borderRadius: '6px',
              fontSize: '13px',
              minWidth: '78px',
            }}
            onClick={resetStopwatch}
          >
            重設
          </button>
        </div>
      </div>
    </section>
  )
}

function AddCalendarEventModal({
  initialDate,
  onClose,
  onSave,
}: {
  initialDate: string
  onClose: () => void
  onSave: (event: CalendarEventDraft) => void
}) {
  const [title, setTitle] = useState('')
  const [startsOn, setStartsOn] = useState(initialDate)
  const [endsOn, setEndsOn] = useState(initialDate)
  const [time, setTime] = useState('')
  const [category, setCategory] = useState('個人')
  const [notes, setNotes] = useState('')

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) {
      alert('請輸入事件名稱！')
      return
    }
    if (!startsOn || !endsOn) {
      alert('請選擇事件日期！')
      return
    }
    if (endsOn < startsOn) {
      alert('結束日期不能早於開始日期！')
      return
    }

    onSave({
      title: title.trim(),
      startsOn,
      endsOn,
      category,
      time: time || undefined,
      notes: notes.trim() || undefined,
    })
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section
        className="course-sheet calendar-event-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="calendar-event-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <button className="sheet-close" type="button" aria-label="關閉" onClick={onClose}>
          <X size={21} />
        </button>
        <h2 id="calendar-event-title">新增個人事件</h2>
        <form className="calendar-event-form" onSubmit={handleSubmit}>
          <label>
            <span>事件名稱</span>
            <input
              autoFocus
              maxLength={80}
              placeholder="例如：繳交期末報告"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <div className="calendar-form-pair">
            <label>
              <span>開始日期</span>
              <input
                type="date"
                value={startsOn}
                onChange={(event) => {
                  const nextStart = event.target.value
                  setStartsOn(nextStart)
                  if (endsOn < nextStart) setEndsOn(nextStart)
                }}
              />
            </label>
            <label>
              <span>結束日期</span>
              <input
                min={startsOn}
                type="date"
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
            </label>
          </div>

          <div className="calendar-form-pair">
            <label>
              <span>時間（選填）</span>
              <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </label>
            <label>
              <span>分類</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="個人">個人</option>
                <option value="課業">課業</option>
                <option value="社團">社團</option>
                <option value="生活">生活</option>
              </select>
            </label>
          </div>

          <label>
            <span>備註（選填）</span>
            <textarea
              maxLength={300}
              placeholder="地點、攜帶物品或其他提醒"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <button className="calendar-event-save" type="submit">
            <Plus size={18} />
            <span>儲存事件</span>
          </button>
        </form>
      </section>
    </div>
  )
}

function AddCourseModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (name: string, code: string, teacher: string, room: string, day: number, period: number) => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [teacher, setTeacher] = useState('')
  const [room, setRoom] = useState('')
  const [day, setDay] = useState(1)
  const [period, setPeriod] = useState(1)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      alert('請輸入課程名稱！')
      return
    }
    onSave(name.trim(), code.trim(), teacher.trim(), room.trim(), day, period)
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="course-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <button className="sheet-close" type="button" aria-label="關閉" onClick={onClose}>
          <X size={21} />
        </button>
        <h2>新增自訂課程</h2>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px', marginTop: '14px' }}>
          <label style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>課程名稱</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ padding: '8px 10px', background: '#252a30', border: '1px solid var(--line-strong)', borderRadius: '6px', color: '#fff' }}
              placeholder="例如：熱力學（一）"
            />
          </label>
          <label style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>課號 (選填)</span>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={{ padding: '8px 10px', background: '#252a30', border: '1px solid var(--line-strong)', borderRadius: '6px', color: '#fff' }}
              placeholder="例如：B7202S42"
            />
          </label>
          <label style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>授課教師 (選填)</span>
            <input
              type="text"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              style={{ padding: '8px 10px', background: '#252a30', border: '1px solid var(--line-strong)', borderRadius: '6px', color: '#fff' }}
              placeholder="例如：莊程媐 助理教授"
            />
          </label>
          <label style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>教室地點 (選填)</span>
            <input
              type="text"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              style={{ padding: '8px 10px', background: '#252a30', border: '1px solid var(--line-strong)', borderRadius: '6px', color: '#fff' }}
              placeholder="例如：MEB429"
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ display: 'grid', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>星期</span>
              <select
                value={day}
                onChange={(e) => setDay(Number(e.target.value))}
                style={{ padding: '8px', background: '#252a30', border: '1px solid var(--line-strong)', borderRadius: '6px', color: '#fff' }}
              >
                <option value={1}>週一</option>
                <option value={2}>週二</option>
                <option value={3}>週三</option>
                <option value={4}>週四</option>
                <option value={5}>週五</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>節數</span>
              <select
                value={period}
                onChange={(e) => setPeriod(Number(e.target.value))}
                style={{ padding: '8px', background: '#252a30', border: '1px solid var(--line-strong)', borderRadius: '6px', color: '#fff' }}
              >
                {periods.map((p) => (
                  <option key={p.value} value={p.value}>
                    第 {getPeriodLabel(p.value)} 節 ({p.time})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="submit"
            style={{
              padding: '10px 20px',
              background: 'var(--brand)',
              color: '#fff',
              fontWeight: 800,
              borderRadius: '6px',
              marginTop: '8px',
            }}
          >
            儲存自訂課程
          </button>
        </form>
      </section>
    </div>
  )
}

function AddGradeModal({
  onClose,
  onSave,
}: {
  onClose: () => void
  onSave: (name: string, credits: number, score: number | null, required: boolean, category: string) => void
}) {
  const [name, setName] = useState('')
  const [credits, setCredits] = useState(3)
  const [scoreText, setScoreText] = useState('85')
  const [required, setRequired] = useState(true)
  const [category, setCategory] = useState('必修')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      alert('請輸入課程名稱！')
      return
    }
    const scoreVal = scoreText.trim()
    const numericScore = Number(scoreVal)
    const finalScore = Number.isFinite(numericScore) && scoreVal !== '' ? numericScore : null

    onSave(
      name.trim(),
      credits,
      finalScore,
      required,
      category
    )
  }

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="course-sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <button className="sheet-close" type="button" aria-label="關閉" onClick={onClose}>
          <X size={21} />
        </button>
        <h2>新增模擬成績</h2>
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px', marginTop: '14px' }}>
          <label style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>科目名稱</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ padding: '8px 10px', background: '#252a30', border: '1px solid var(--line-strong)', borderRadius: '6px', color: '#fff' }}
              placeholder="例如：熱力學"
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ display: 'grid', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>學分</span>
              <input
                type="number"
                min={1}
                max={10}
                value={credits}
                onChange={(e) => setCredits(Number(e.target.value))}
                style={{ padding: '8px 10px', background: '#252a30', border: '1px solid var(--line-strong)', borderRadius: '6px', color: '#fff' }}
              />
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>分數 (0-100 或 letter)</span>
              <input
                type="text"
                value={scoreText}
                onChange={(e) => setScoreText(e.target.value)}
                style={{ padding: '8px 10px', background: '#252a30', border: '1px solid var(--line-strong)', borderRadius: '6px', color: '#fff' }}
                placeholder="例如：85 或 A+"
              />
            </label>
          </div>

          <label style={{ display: 'grid', gap: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--muted)', fontWeight: 700 }}>科目選別</span>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                setRequired(e.target.value === '必修')
              }}
              style={{ padding: '8px', background: '#252a30', border: '1px solid var(--line-strong)', borderRadius: '6px', color: '#fff' }}
            >
              <option value="必修">必修</option>
              <option value="選修">選修</option>
              <option value="通識">通識</option>
            </select>
          </label>

          <button
            type="submit"
            style={{
              padding: '10px 20px',
              background: 'var(--brand)',
              color: '#fff',
              fontWeight: 800,
              borderRadius: '6px',
              marginTop: '8px',
            }}
          >
            儲存模擬成績
          </button>
        </form>
      </section>
    </div>
  )
}

export default App
