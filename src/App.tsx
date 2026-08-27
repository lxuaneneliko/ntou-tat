import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import {
  BarcodeFormat,
  BarcodeScanner,
  GoogleBarcodeScannerModuleInstallState,
} from '@capacitor-mlkit/barcode-scanning'
import QRCode from 'qrcode'
import {
  AlertCircle,
  Bell,
  Building2,
  Camera,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  GraduationCap,
  Handshake,
  KeyRound,
  LayoutGrid,
  Link as LinkIcon,
  List as ListIcon,
  LogOut,
  Mail,
  MapPinned,
  Menu,
  MoreVertical,
  PackageOpen,
  Phone,
  Plus,
  QrCode,
  RefreshCw,
  ScanLine,
  Loader2,
  Pencil,
  ShieldCheck,
  Trash2,
  Trophy,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import './App.css'
import { apiMode, createNtouApi } from './api'
import { UnauthorizedError } from './api/errors'
import { emergencyContacts, emptyCredits } from './api/publicData'
import { clearPortalSession } from './api/portal'
import { cropAvatarFile, readStoredAvatar, storeAvatar } from './avatar'
import { GPA_MAX, hasPassingResult, scoreToGpa } from './gpa'
import { MailScreen, type MailScreenHandle } from './MailScreen'
import { DepartmentSitesScreen, type DepartmentSitesScreenHandle } from './DepartmentSitesScreen'
import { authStore } from './storage/authStorage'
import {
  decodeTimetableShare,
  encodeTimetableShare,
  importTimetablePreview,
  readSharedTimetables,
  writeSharedTimetables,
  type SharedTimetable,
  type TimetableSharePreview,
} from './timetableShare'
import {
  readStoredExternalCompetitions,
  writeStoredExternalCompetitions,
} from './storage/externalCompetitionStorage'
import {
  readStoredIndustryNews,
  writeStoredIndustryNews,
} from './storage/industryNewsStorage'
import {
  personalEventsForStudent,
  readPersonalCalendarStore,
  writePersonalCalendarStore,
  type PersonalCalendarStore,
} from './storage/calendarStorage'
import { isHolidayCalendarEvent, shouldMarkCalendarDate } from './api/publicCalendar'
import { semestersForStudent } from './semester'
import {
  fetchLatestAppUpdate,
  millisecondsUntilNextUpdateCheck,
  scheduleNextScheduledUpdateCheck,
  scheduleNextUpdateCheck,
  shouldCheckForUpdate,
  UPDATE_RETRY_INTERVAL_MS,
  type AppUpdate,
} from './update'
import {
  clearSemesterCache,
  markEmptyTimetableVerified,
  readSemesterCache,
  semesterCacheProgress,
  shouldPrefetchSemester,
  shouldRecoverEmptyTimetable,
  withCachedGrades,
  withCachedTimetable,
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
  ExternalCompetition,
  Grade,
  IndustryNews,
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
  externalCompetitions: ExternalCompetition[]
  industryNews: IndustryNews[]
  calendar: CalendarEvent[]
  campusLinks: CampusLink[]
  traffic: TrafficInfo[]
}

type SemesterData = Pick<AppData, 'timetable' | 'grades' | 'credits'>

type SemesterPrefetchProgress = {
  semesterId: string
  percent: number
}

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
  { key: 'mail', label: '信箱', icon: Mail },
  { key: 'more', label: '其它', icon: Menu },
]

const tabTitles: Record<TabKey, string> = {
  timetable: '課表',
  calendar: '行事曆',
  grades: '成績',
  mail: '海大信箱',
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

const emptySemesterCacheEntry = (semesterId: string): SemesterCacheEntry => ({
  savedAt: '',
  timetable: { semesterId, updatedAt: '', slots: [] },
  grades: [],
  credits: emptyCredits,
  timetableCached: false,
  gradesCached: false,
})

const semesterMemoryKey = (studentId: string, semesterId: string) =>
  `${studentId.trim().toUpperCase()}:${semesterId}`

const monthLabel = (date: Date) =>
  `${date.getFullYear()}年${date.getMonth() + 1}月`

const isoDate = (date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const CALENDAR_AUTO_REFRESH_MS = 6 * 60 * 60 * 1000

const officialCalendarRange = (now = new Date()) => ({
  from: isoDate(new Date(now.getFullYear(), 0, 1)),
  to: isoDate(new Date(now.getFullYear() + 1, 11, 31)),
})

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
  const [semesterPrefetchProgress, setSemesterPrefetchProgress] = useState<SemesterPrefetchProgress | null>(null)
  const [calendarRefreshing, setCalendarRefreshing] = useState(false)
  const [competitionRefreshing, setCompetitionRefreshing] = useState(false)
  const [industryRefreshing, setIndustryRefreshing] = useState(false)
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
  const [isAddCourseOpen, setIsAddCourseOpen] = useState(false)
  const [isAddGradeOpen, setIsAddGradeOpen] = useState(false)
  const [isAddCalendarEventOpen, setIsAddCalendarEventOpen] = useState(false)
  const [calendarEventDate, setCalendarEventDate] = useState(() => isoDate(new Date()))
  const [personalCalendarStore, setPersonalCalendarStore] = useState<PersonalCalendarStore>(
    readPersonalCalendarStore,
  )
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false)
  const [sharedTimetables, setSharedTimetables] = useState<SharedTimetable[]>(readSharedTimetables)
  const [selectedTimetableSource, setSelectedTimetableSource] = useState('mine')
  const [timetableDialog, setTimetableDialog] = useState<'share' | 'scan' | 'rename' | null>(null)
  const [activeCourseSlot, setActiveCourseSlot] = useState<TimetableSlot | null>(null)
  const [activeCourseIsShared, setActiveCourseIsShared] = useState(false)
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdate | null>(null)
  const [installedVersion, setInstalledVersion] = useState('')
  const [exitHintVisible, setExitHintVisible] = useState(false)
  const updateCheckRunningRef = useRef(false)
  const mailScreenRef = useRef<MailScreenHandle>(null)
  const departmentSitesRef = useRef<DepartmentSitesScreenHandle>(null)
  const lastRootBackAtRef = useRef(0)
  const exitHintTimerRef = useRef<number | undefined>(undefined)

  const clearExitHint = useCallback(() => {
    lastRootBackAtRef.current = 0
    setExitHintVisible(false)
    if (exitHintTimerRef.current !== undefined) {
      window.clearTimeout(exitHintTimerRef.current)
      exitHintTimerRef.current = undefined
    }
  }, [])

  const requestAppExit = useCallback(() => {
    const now = Date.now()
    if (now - lastRootBackAtRef.current <= 2000) {
      clearExitHint()
      void CapApp.exitApp()
      return
    }

    lastRootBackAtRef.current = now
    setExitHintVisible(true)
    if (exitHintTimerRef.current !== undefined) window.clearTimeout(exitHintTimerRef.current)
    exitHintTimerRef.current = window.setTimeout(() => clearExitHint(), 2000)
  }, [clearExitHint])

  const checkForUpdate = useCallback(async () => {
    if (!Capacitor.isNativePlatform() || updateCheckRunningRef.current || !shouldCheckForUpdate()) {
      return
    }

    updateCheckRunningRef.current = true
    try {
      const appInfo = await CapApp.getInfo()
      setInstalledVersion(appInfo.version)
      const update = await fetchLatestAppUpdate(appInfo.version)
      scheduleNextScheduledUpdateCheck()
      setAvailableUpdate(update)
    } catch {
      scheduleNextUpdateCheck(UPDATE_RETRY_INTERVAL_MS)
    } finally {
      updateCheckRunningRef.current = false
    }
  }, [])

  const remindAboutUpdateLater = useCallback(() => {
    scheduleNextScheduledUpdateCheck()
    setAvailableUpdate(null)
  }, [])

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
  const savePersonalCalendarStore = (nextStore: PersonalCalendarStore) => {
    setPersonalCalendarStore(nextStore)
    writePersonalCalendarStore(nextStore)
  }
  const saveSharedTimetables = (items: SharedTimetable[]) => {
    setSharedTimetables(items)
    writeSharedTimetables(items)
  }
  const saveCustomAvatar = (dataUrl: string) => {
    storeAvatar(dataUrl)
    setCustomAvatar(dataUrl)
  }
  const dataRef = useRef<AppData | null>(null)
  const selectedSemesterRef = useRef('')
  const semesterCacheRef = useRef(new Map<string, SemesterCacheEntry>())
  const semesterPrefetchQueueRef = useRef<string[]>([])
  const semesterPrefetchQueuedRef = useRef(new Set<string>())
  const semesterLoadInFlightRef = useRef(new Set<string>())
  const semesterPrefetchRunningRef = useRef(false)
  const semesterPrefetchTaskRef = useRef<Promise<void> | null>(null)
  const semesterPrefetchGenerationRef = useRef(0)
  const runSemesterPrefetchRef = useRef<() => void>(() => {})
  const appActiveRef = useRef(true)
  const dataRequestRef = useRef(0)
  const calendarUpdatedAtRef = useRef(0)
  const calendarRefreshPromiseRef = useRef<Promise<void> | null>(null)
  const competitionRefreshPromiseRef = useRef<Promise<void> | null>(null)
  const industryRefreshPromiseRef = useRef<Promise<void> | null>(null)

  const applyData = useCallback((nextData: AppData | null) => {
    dataRef.current = nextData
    setData(nextData)
  }, [])

  const handleUnauthorized = useCallback(async () => {
    dataRequestRef.current += 1
    semesterPrefetchGenerationRef.current += 1
    semesterPrefetchQueueRef.current = []
    semesterPrefetchQueuedRef.current.clear()
    setSemesterPrefetchProgress(null)
    await authStore.clearSession()
    setSession(null)
    applyData(null)
    setSelectedTab('timetable')
    setMoreView(null)
    setActiveCourse(null)
  }, [applyData])

  const api = useMemo(() => createNtouApi(handleUnauthorized), [handleUnauthorized])

  const refreshExternalCompetitions = useCallback(async () => {
    if (competitionRefreshPromiseRef.current) return competitionRefreshPromiseRef.current

    const task = (async () => {
      setCompetitionRefreshing(true)
      try {
        const items = await api.getExternalCompetitions()
        if (!items.length) throw new Error('競賽來源目前沒有資料')
        writeStoredExternalCompetitions(items)
        const current = dataRef.current
        if (current) applyData({ ...current, externalCompetitions: items })
      } finally {
        setCompetitionRefreshing(false)
      }
    })()

    competitionRefreshPromiseRef.current = task
    try {
      await task
    } finally {
      competitionRefreshPromiseRef.current = null
    }
  }, [api, applyData])

  const refreshIndustryNews = useCallback(async () => {
    if (industryRefreshPromiseRef.current) return industryRefreshPromiseRef.current

    const task = (async () => {
      setIndustryRefreshing(true)
      try {
        const items = await api.getIndustryNews()
        if (!items.length) throw new Error('產學中心目前沒有消息')
        writeStoredIndustryNews(items)
        const current = dataRef.current
        if (current) applyData({ ...current, industryNews: items })
      } finally {
        setIndustryRefreshing(false)
      }
    })()

    industryRefreshPromiseRef.current = task
    try {
      await task
    } finally {
      industryRefreshPromiseRef.current = null
    }
  }, [api, applyData])

  const refreshOfficialCalendar = useCallback(async () => {
    if (calendarRefreshPromiseRef.current) return calendarRefreshPromiseRef.current

    const task = (async () => {
      setCalendarRefreshing(true)
      const { from, to } = officialCalendarRange()
      try {
        const calendar = await api.getCalendar(from, to)
        if (!calendar.length) throw new Error('海大官方行事曆目前沒有回傳事件')
        const current = dataRef.current
        if (current) applyData({ ...current, calendar })
        calendarUpdatedAtRef.current = Date.now()
      } catch (error) {
        setAppError(`行事曆更新失敗：${messageFromError(error)}`)
      } finally {
        setCalendarRefreshing(false)
      }
    })()

    calendarRefreshPromiseRef.current = task
    try {
      await task
    } finally {
      calendarRefreshPromiseRef.current = null
    }
  }, [api, applyData])

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

  const readCachedSemesterEntry = useCallback(async (studentId: string, semesterId: string) => {
    const memoryKey = semesterMemoryKey(studentId, semesterId)
    const memory = semesterCacheRef.current.get(memoryKey)
    if (memory) return memory
    const stored = await readSemesterCache(studentId, semesterId)
    const entry = stored ?? emptySemesterCacheEntry(semesterId)
    semesterCacheRef.current.set(memoryKey, entry)
    return entry
  }, [])

  const publishSemesterEntry = useCallback((
    studentId: string,
    semesterId: string,
    entry: SemesterCacheEntry,
  ) => {
    if (selectedSemesterRef.current !== semesterId) return
    const current = dataRef.current
    if (!current || current.profile.id.trim().toUpperCase() !== studentId.trim().toUpperCase()) return
    applyData({ ...current, ...semesterDataFromCache(entry) })
  }, [applyData])

  const persistSemesterEntry = useCallback(async (
    studentId: string,
    semesterId: string,
    entry: SemesterCacheEntry,
  ) => {
    semesterCacheRef.current.set(semesterMemoryKey(studentId, semesterId), entry)
    publishSemesterEntry(studentId, semesterId, entry)
    try {
      await writeSemesterCache(studentId, semesterId, entry)
    } catch {
      // Keep the successfully loaded data in memory when encrypted storage is unavailable.
    }
  }, [publishSemesterEntry])

  const loadSemesterIntoCache = useCallback(async (
    studentId: string,
    semesterId: string,
    force: boolean,
    onProgress?: (percent: number) => void,
  ) => {
    let entry = await readCachedSemesterEntry(studentId, semesterId)
    const errors: string[] = []
    let requested = false

    if (!force) onProgress?.(semesterCacheProgress(entry))
    semesterLoadInFlightRef.current.add(semesterId)
    try {
      if (force || !entry.timetableCached) {
        requested = true
        try {
          const timetable = await api.getTimetable(semesterId)
          entry = withCachedTimetable(entry, timetable)
          await persistSemesterEntry(studentId, semesterId, entry)
          if (!force) onProgress?.(semesterCacheProgress(entry))
        } catch (error) {
          if (error instanceof UnauthorizedError) throw error
          errors.push(`課表：${messageFromError(error)}`)
        }
      }

      if (force || !entry.gradesCached) {
        requested = true
        try {
          const grades = await api.getGrades(semesterId)
          entry = withCachedGrades(entry, grades, creditSummaryFromGrades(grades))
          await persistSemesterEntry(studentId, semesterId, entry)
          if (!force) onProgress?.(semesterCacheProgress(entry))
        } catch (error) {
          if (error instanceof UnauthorizedError) throw error
          errors.push(`成績：${messageFromError(error)}`)
        }
      }

      if (shouldRecoverEmptyTimetable(entry)) {
        if (force) {
          entry = markEmptyTimetableVerified(entry)
          await persistSemesterEntry(studentId, semesterId, entry)
          if (!force) onProgress?.(semesterCacheProgress(entry))
        } else {
          requested = true
          try {
            const recoveredTimetable = await api.getTimetable(semesterId)
            entry = withCachedTimetable(entry, recoveredTimetable)
            if (!recoveredTimetable.slots.length) {
              entry = markEmptyTimetableVerified(entry)
            }
            await persistSemesterEntry(studentId, semesterId, entry)
            onProgress?.(semesterCacheProgress(entry))
          } catch (error) {
            if (error instanceof UnauthorizedError) throw error
            errors.push(`課表再次確認：${messageFromError(error)}`)
          }
        }
      }

      return { entry, errors, requested }
    } finally {
      semesterLoadInFlightRef.current.delete(semesterId)
    }
  }, [api, persistSemesterEntry, readCachedSemesterEntry])

  const runSemesterPrefetchQueue = useCallback(() => {
    if (semesterPrefetchRunningRef.current || !appActiveRef.current) return
    semesterPrefetchRunningRef.current = true
    const generation = semesterPrefetchGenerationRef.current

    const task = (async () => {
      while (
        appActiveRef.current &&
        generation === semesterPrefetchGenerationRef.current &&
        semesterPrefetchQueueRef.current.length
      ) {
        const semesterId = semesterPrefetchQueueRef.current.shift()!
        semesterPrefetchQueuedRef.current.delete(semesterId)
        const current = dataRef.current
        if (!current) break

        const cachedBeforePrefetch = await readCachedSemesterEntry(
          current.profile.id,
          semesterId,
        )
        if (!shouldPrefetchSemester(cachedBeforePrefetch)) continue

        setSemesterPrefetchProgress({
          semesterId,
          percent: 0,
        })

        let visualPercent = 0
        let progressLimit = 49
        const publishVisualProgress = () => {
          setSemesterPrefetchProgress((progress) =>
            progress?.semesterId === semesterId
              ? { semesterId, percent: visualPercent }
              : progress,
          )
        }
        const progressTimer = window.setInterval(() => {
          if (visualPercent >= progressLimit) return
          visualPercent = Math.min(progressLimit, visualPercent + 1)
          publishVisualProgress()
        }, 120)

        try {
          const result = await loadSemesterIntoCache(
            current.profile.id,
            semesterId,
            false,
            (actualPercent) => {
              progressLimit = actualPercent >= 50 ? 99 : 49
            },
          )
          window.clearInterval(progressTimer)
          if (result.errors.length) {
            setAppError(`歷史資料預載已暫停：${result.errors.join('；')}`)
            semesterPrefetchGenerationRef.current += 1
            break
          }

          const completionFrom = visualPercent
          const completionStartedAt = performance.now()
          const completionDuration = Math.max(320, (99 - completionFrom) * 7)
          while (
            visualPercent < 99 &&
            appActiveRef.current &&
            generation === semesterPrefetchGenerationRef.current
          ) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, 16))
            const elapsed = performance.now() - completionStartedAt
            const ratio = Math.min(1, elapsed / completionDuration)
            const nextPercent = Math.min(
              99,
              Math.floor(completionFrom + (99 - completionFrom) * ratio),
            )
            if (nextPercent > visualPercent) {
              visualPercent = nextPercent
              publishVisualProgress()
            }
          }

          if (
            appActiveRef.current &&
            generation === semesterPrefetchGenerationRef.current
          ) {
            await new Promise<void>((resolve) => window.setTimeout(resolve, 140))
            visualPercent = 100
            publishVisualProgress()
            await new Promise<void>((resolve) => window.setTimeout(resolve, 260))
          }
        } catch (error) {
          if (error instanceof UnauthorizedError) {
            const message = error.message === 'CAPTCHA_FAILED'
              ? '驗證碼自動辨識連續失敗，請手動登入'
              : error.message
            if (error.message === 'CAPTCHA_FAILED') setAutoCaptchaFailed(true)
            await loadLoginChallenge(message)
          } else {
            setAppError(`歷史資料預載已暫停：${messageFromError(error)}`)
          }
          semesterPrefetchGenerationRef.current += 1
          break
        } finally {
          window.clearInterval(progressTimer)
        }
      }
    })().finally(() => {
      semesterPrefetchRunningRef.current = false
      semesterPrefetchTaskRef.current = null
      const canContinue =
        appActiveRef.current &&
        semesterPrefetchQueueRef.current.length > 0 &&
        generation === semesterPrefetchGenerationRef.current
      if (!canContinue) {
        setSemesterPrefetchProgress(null)
      }
      if (canContinue) {
        window.setTimeout(() => runSemesterPrefetchRef.current(), 0)
      }
    })

    semesterPrefetchTaskRef.current = task
  }, [loadLoginChallenge, loadSemesterIntoCache, readCachedSemesterEntry])

  runSemesterPrefetchRef.current = runSemesterPrefetchQueue

  const enqueueSemesterPrefetch = useCallback((semesters: Semester[], prioritySemesterId: string) => {
    if (!semesterPrefetchRunningRef.current && !semesterPrefetchQueueRef.current.length) {
      setSemesterPrefetchProgress(null)
    }
    const ordered = [
      prioritySemesterId,
      ...semesters.map((semester) => semester.id).filter((id) => id !== prioritySemesterId),
    ]

    ordered.forEach((semesterId) => {
      if (
        semesterPrefetchQueuedRef.current.has(semesterId) ||
        semesterLoadInFlightRef.current.has(semesterId)
      ) return
      semesterPrefetchQueuedRef.current.add(semesterId)
      semesterPrefetchQueueRef.current.push(semesterId)
    })

    const priorityIndex = semesterPrefetchQueueRef.current.indexOf(prioritySemesterId)
    if (priorityIndex > 0) {
      semesterPrefetchQueueRef.current.splice(priorityIndex, 1)
      semesterPrefetchQueueRef.current.unshift(prioritySemesterId)
    }
    runSemesterPrefetchRef.current()
  }, [])

  const loadAppData = useCallback(async (semesterOverride?: string, force = false) => {
    setAppError(null)
    const existing = dataRef.current
    const rawSemesters = existing?.semesters ?? await api.getSemesters()
    const storedSession = await authStore.getSession()
    const profile = existing?.profile ?? storedSession?.profile ?? await api.getMe()
    const semesters = semestersForStudent(rawSemesters, profile.id)
    const semesterId =
      semesterOverride && semesters.some((semester) => semester.id === semesterOverride)
        ? semesterOverride
        : semesters.find((semester) => semester.current)?.id || semesters[0]?.id || ''
    selectedSemesterRef.current = semesterId
    setSelectedSemester(semesterId)

    const cached = await readCachedSemesterEntry(profile.id, semesterId)
    const cachedExternalCompetitions = existing?.externalCompetitions.length
      ? existing.externalCompetitions
      : readStoredExternalCompetitions()
    const cachedIndustryNews = existing?.industryNews.length
      ? existing.industryNews
      : readStoredIndustryNews()
    applyData({
      profile,
      semesters,
      ...semesterDataFromCache(cached),
      announcements: existing?.announcements ?? [],
      externalCompetitions: cachedExternalCompetitions,
      industryNews: cachedIndustryNews,
      calendar: existing?.calendar ?? [],
      campusLinks: existing?.campusLinks ?? [],
      traffic: existing?.traffic ?? [],
    })

    const { from, to } = officialCalendarRange()
    if (!existing || force) {
      const loadOptional = async <T,>(request: Promise<T>, fallback: T) => {
        try {
          return await request
        } catch {
          return fallback
        }
      }
      void Promise.all([
        loadOptional(api.getAnnouncements(), existing?.announcements ?? []),
        loadOptional(api.getCalendar(from, to), existing?.calendar ?? []),
        loadOptional(api.getCampusLinks(), existing?.campusLinks ?? []),
        loadOptional(api.getTraffic(), existing?.traffic ?? []),
      ]).then(([announcements, calendar, campusLinks, traffic]) => {
        const current = dataRef.current
        if (!current || current.profile.id.trim().toUpperCase() !== profile.id.trim().toUpperCase()) return
        if (calendar.length) calendarUpdatedAtRef.current = Date.now()
        applyData({ ...current, announcements, calendar, campusLinks, traffic })
      }).catch(() => {})
    }

    if (force) {
      const result = await loadSemesterIntoCache(profile.id, semesterId, true)
      if (result.errors.length) {
        setAppError(`重新整理失敗，已保留上次資料：${result.errors.join('；')}`)
      }
      return
    }

    enqueueSemesterPrefetch(semesters, semesterId)
  }, [
    api,
    applyData,
    enqueueSemesterPrefetch,
    loadSemesterIntoCache,
    readCachedSemesterEntry,
  ])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    let active = true
    let generation = 0
    let timer: number | undefined

    const runAndSchedule = async () => {
      const currentGeneration = ++generation
      if (timer !== undefined) window.clearTimeout(timer)
      await checkForUpdate()
      if (!active || currentGeneration !== generation) return
      timer = window.setTimeout(() => void runAndSchedule(), millisecondsUntilNextUpdateCheck())
    }

    void runAndSchedule()
    const updateListener = CapApp.addListener('appStateChange', ({ isActive }) => {
      active = isActive
      generation += 1
      if (timer !== undefined) window.clearTimeout(timer)
      if (isActive) void runAndSchedule()
    })

    return () => {
      active = false
      generation += 1
      if (timer !== undefined) window.clearTimeout(timer)
      void updateListener.then((handle) => handle.remove())
    }
  }, [checkForUpdate])

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
      if (availableUpdate) {
        clearExitHint()
        remindAboutUpdateLater()
      } else if (timetableDialog) {
        clearExitHint()
        setTimetableDialog(null)
      } else if (headerMenuOpen) {
        clearExitHint()
        setHeaderMenuOpen(false)
      } else if (isAddCalendarEventOpen) {
        clearExitHint()
        setIsAddCalendarEventOpen(false)
      } else if (isAddCourseOpen) {
        clearExitHint()
        setIsAddCourseOpen(false)
      } else if (isAddGradeOpen) {
        clearExitHint()
        setIsAddGradeOpen(false)
      } else if (activeCourse) {
        clearExitHint()
        setActiveCourse(null)
      } else if (selectedTab === 'mail' && mailScreenRef.current?.goBack()) {
        clearExitHint()
      } else if (moreView === 'departments' && departmentSitesRef.current?.goBack()) {
        clearExitHint()
      } else if (moreView) {
        clearExitHint()
        setMoreView(null)
      } else {
        requestAppExit()
      }
    })
    return () => {
      void handleBackButton.then((h: { remove: () => void }) => h.remove())
    }
  }, [
    activeCourse,
    availableUpdate,
    clearExitHint,
    headerMenuOpen,
    isAddCalendarEventOpen,
    isAddCourseOpen,
    isAddGradeOpen,
    moreView,
    remindAboutUpdateLater,
    requestAppExit,
    selectedTab,
    timetableDialog,
  ])

  useEffect(() => () => clearExitHint(), [clearExitHint])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const appStateListener = CapApp.addListener('appStateChange', ({ isActive }) => {
      appActiveRef.current = isActive
      if (!isActive) {
        semesterPrefetchGenerationRef.current += 1
      } else {
        const currentTask = semesterPrefetchTaskRef.current
        if (currentTask) {
          void currentTask.finally(() => runSemesterPrefetchRef.current())
        } else {
          runSemesterPrefetchRef.current()
        }
      }
      if (
        isActive &&
        dataRef.current &&
        Date.now() - calendarUpdatedAtRef.current >= CALENDAR_AUTO_REFRESH_MS
      ) {
        void refreshOfficialCalendar()
      }
    })
    return () => {
      void appStateListener.then((handle) => handle.remove())
    }
  }, [refreshOfficialCalendar])

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
      await loadAppData()
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
      semesterPrefetchGenerationRef.current += 1
      await semesterPrefetchTaskRef.current
      await loadAppData(selectedSemester, true)
      const current = dataRef.current
      if (current) enqueueSemesterPrefetch(current.semesters, selectedSemester)
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
    selectedSemesterRef.current = semesterId
    setSelectedSemester(semesterId)
    try {
      await loadAppData(semesterId)
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
    }
  }

  const openCourse = async (course: CourseSummary, slot?: TimetableSlot) => {
    setActiveCourseSlot(slot ?? null)
    setActiveCourseIsShared(false)
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
    semesterPrefetchGenerationRef.current += 1
    semesterPrefetchQueueRef.current = []
    semesterPrefetchQueuedRef.current.clear()
    setSemesterPrefetchProgress(null)
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
    semesterPrefetchGenerationRef.current += 1
    semesterPrefetchQueueRef.current = []
    semesterPrefetchQueuedRef.current.clear()
    setSemesterPrefetchProgress(null)
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

  const selectedSharedTimetable = useMemo(
    () => sharedTimetables.find((item) => item.id === selectedTimetableSource) ?? null,
    [selectedTimetableSource, sharedTimetables],
  )
  const displayedTimetableSlots = selectedSharedTimetable?.slots ?? mergedSlots

  useEffect(() => {
    if (selectedTimetableSource === 'mine') return
    if (!sharedTimetables.some((item) => item.id === selectedTimetableSource)) {
      setSelectedTimetableSource('mine')
    }
  }, [selectedTimetableSource, sharedTimetables])

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

  const updateSheet = availableUpdate ? (
    <UpdateSheet
      currentVersion={installedVersion}
      update={availableUpdate}
      onClose={remindAboutUpdateLater}
      onDownload={() => {
        scheduleNextScheduledUpdateCheck()
        setAvailableUpdate(null)
      }}
    />
  ) : null

  const exitHint = exitHintVisible ? (
    <div className="exit-hint" role="status">再按一次返回鍵即可離開海大 TAT</div>
  ) : null

  if (isBooting) return <><LoadingScreen />{updateSheet}{exitHint}</>

  if (!session || !data) {
    return (
      <>
      <LoginScreen
        busy={loginBusy}
        challengeBusy={challengeBusy}
        error={loginError || appError}
        challenge={loginChallenge}
        autoCaptchaFailed={autoCaptchaFailed}
        onRefreshChallenge={() => void loadLoginChallenge()}
        onLogin={handleLogin}
      />
      {updateSheet}
      {exitHint}
      </>
    )
  }

  const title = moreView ? moreViewTitle(moreView) : tabTitles[selectedTab]

  return (
    <div className="app app-dark">
      <div className="app-shell">
        <header className="app-header">
          <div className="header-main">
            {moreView ? (
              <button className="header-icon" type="button" aria-label="返回" onClick={() => {
                if (moreView === 'departments' && departmentSitesRef.current?.goBack()) return
                setMoreView(null)
              }}>
                <ChevronLeft size={24} />
              </button>
            ) : null}
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            {selectedTab !== 'mail' || moreView ? (
              <button
                className="header-icon"
                type="button"
                aria-label="重新整理"
                disabled={isRefreshing}
                onClick={() => void refresh()}
              >
                <RefreshCw className={isRefreshing ? 'spin' : ''} size={22} />
              </button>
            ) : null}
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
                    {selectedTab === 'timetable' && !selectedSharedTimetable ? (
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
                    {selectedTab === 'timetable' && !selectedSharedTimetable ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setHeaderMenuOpen(false)
                          setTimetableDialog('share')
                        }}
                      >
                        <QrCode size={17} />
                        <span>顯示我的 QR Code</span>
                      </button>
                    ) : null}
                    {selectedTab === 'timetable' ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setHeaderMenuOpen(false)
                          setTimetableDialog('scan')
                        }}
                      >
                        <ScanLine size={17} />
                        <span>掃描同學課表</span>
                      </button>
                    ) : null}
                    {selectedTab === 'timetable' && selectedSharedTimetable ? (
                      <>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setHeaderMenuOpen(false)
                            setTimetableDialog('rename')
                          }}
                        >
                          <Pencil size={17} />
                          <span>重新命名這份課表</span>
                        </button>
                        <button
                          className="header-menu-danger"
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setHeaderMenuOpen(false)
                            if (!confirm(`確定要刪除「${selectedSharedTimetable.displayName}」嗎？`)) return
                            saveSharedTimetables(sharedTimetables.filter((item) => item.id !== selectedSharedTimetable.id))
                            setSelectedTimetableSource('mine')
                          }}
                        >
                          <Trash2 size={17} />
                          <span>刪除這份課表</span>
                        </button>
                      </>
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
            selectedTimetableSource={selectedTab === 'timetable' ? selectedTimetableSource : undefined}
            sharedTimetables={selectedTab === 'timetable' ? sharedTimetables : undefined}
            onTimetableSourceChange={selectedTab === 'timetable' ? setSelectedTimetableSource : undefined}
            sharedSemesterId={selectedSharedTimetable?.semesterId}
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
          {semesterPrefetchProgress ? (
            <div className="semester-prefetch-banner" role="status">
              <b>{semesterPrefetchProgress.semesterId}</b>
              <div
                className="semester-prefetch-track"
                role="progressbar"
                aria-label={`${semesterPrefetchProgress.semesterId} 課表與成績快取進度`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={semesterPrefetchProgress.percent}
              >
                <i style={{
                  '--semester-prefetch-width': `${semesterPrefetchProgress.percent}%`,
                } as CSSProperties} />
              </div>
              <strong>{semesterPrefetchProgress.percent}%</strong>
            </div>
          ) : null}
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
                onRefreshCompetitions={refreshExternalCompetitions}
                competitionRefreshing={competitionRefreshing}
                onRefreshIndustry={refreshIndustryNews}
                industryRefreshing={industryRefreshing}
                departmentSitesRef={departmentSitesRef}
              />
            ) : selectedTab === 'timetable' ? (
              <TimetableScreen
                slots={displayedTimetableSlots}
                viewMode={timetableViewMode}
                onOpenCourse={(slot) => {
                  const course = coursesFromTimetable([slot])[0]
                  if (selectedSharedTimetable) {
                    setActiveCourseSlot(slot)
                    setActiveCourseIsShared(true)
                    setActiveCourse(course)
                    return
                  }
                  void openCourse(course, slot)
                }}
              />
            ) : selectedTab === 'calendar' ? (
              <CalendarScreen
                events={mergedCalendarEvents}
                refreshing={calendarRefreshing}
                onRefresh={() => void refreshOfficialCalendar()}
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
            ) : selectedTab === 'mail' ? (
              <MailScreen ref={mailScreenRef} studentId={data.profile.id} />
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
            slot={activeCourseSlot}
            isSharedSnapshot={activeCourseIsShared}
            onDeleteCourse={activeCourseIsShared ? undefined : (courseTitle) => {
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

        {timetableDialog === 'share' ? (
          <TimetableShareSheet
            initialName={`${data.profile.name || '我的'}的課表`}
            semesterId={selectedSemester}
            slots={mergedSlots}
            onClose={() => setTimetableDialog(null)}
          />
        ) : null}

        {timetableDialog === 'scan' ? (
          <TimetableScanSheet
            onClose={() => setTimetableDialog(null)}
            onImport={(preview, displayName) => {
              const existing = sharedTimetables.find((item) => item.id === preview.id)
              if (existing && !confirm(`「${existing.displayName}」已存在，要用這次掃描的快照取代嗎？`)) {
                return false
              }
              const imported = importTimetablePreview(preview, displayName)
              saveSharedTimetables([
                ...sharedTimetables.filter((item) => item.id !== imported.id),
                imported,
              ])
              setSelectedTimetableSource(imported.id)
              setTimetableDialog(null)
              return true
            }}
          />
        ) : null}

        {timetableDialog === 'rename' && selectedSharedTimetable ? (
          <RenameTimetableSheet
            initialName={selectedSharedTimetable.displayName}
            onClose={() => setTimetableDialog(null)}
            onSave={(displayName) => {
              saveSharedTimetables(sharedTimetables.map((item) => (
                item.id === selectedSharedTimetable.id ? { ...item, displayName } : item
              )))
              setTimetableDialog(null)
            }}
          />
        ) : null}

        {updateSheet}
        {exitHint}
      </div>
    </div>
  )
}

function UpdateSheet({
  currentVersion,
  onClose,
  onDownload,
  update,
}: {
  currentVersion: string
  onClose: () => void
  onDownload: () => void
  update: AppUpdate
}) {
  return (
    <div className="sheet-backdrop update-backdrop" role="presentation" onClick={onClose}>
      <section
        className="update-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="update-sheet-hero" aria-hidden="true">
          <span className="update-package-icon"><PackageOpen size={31} strokeWidth={1.8} /></span>
          <span className="update-version-route">
            <small>目前</small>
            <strong>v{currentVersion || '—'}</strong>
            <span>→</span>
            <small>最新</small>
            <strong>v{update.version}</strong>
          </span>
        </div>

        <p className="update-eyebrow">新版已發布</p>
        <h2 id="update-title">NTOU TAT 可以更新了</h2>
        <p className="update-intro">下載新版 APK 後，直接安裝即可保留原有 App 資料。</p>

        <ul className="update-highlights">
          {update.highlights.map((highlight) => <li key={highlight}>{highlight}</li>)}
        </ul>

        <div className="update-actions">
          <a
            className="update-download"
            href={update.downloadUrl}
            rel="noreferrer"
            target="_blank"
            onClick={onDownload}
          >
            <Download size={19} />
            下載新版 APK
          </a>
          <button className="update-later" type="button" onClick={onClose}>稍後提醒</button>
        </div>

        <p className="update-safety"><ShieldCheck size={15} />檔案來自 NTOU TAT 官方 GitHub Release</p>
      </section>
    </div>
  )
}

function StudentStrip({
  onSemesterChange,
  onTimetableSourceChange,
  onTimetableViewModeChange,
  profile,
  selectedSemester,
  selectedTimetableSource,
  semesters,
  sharedSemesterId,
  sharedTimetables,
  timetableViewMode,
}: {
  onSemesterChange: (semesterId: string) => Promise<void>
  onTimetableSourceChange?: (sourceId: string) => void
  onTimetableViewModeChange?: (mode: 'grid' | 'list') => void
  profile: StudentProfile
  selectedSemester: string
  selectedTimetableSource?: string
  semesters: Semester[]
  sharedSemesterId?: string
  sharedTimetables?: SharedTimetable[]
  timetableViewMode?: 'grid' | 'list'
}) {
  const isShared = Boolean(selectedTimetableSource && selectedTimetableSource !== 'mine')
  return (
    <div className={`student-strip ${selectedTimetableSource ? 'timetable-student-strip' : ''}`}>
      <div className="student-identity">
        <strong>{isShared ? '同學課表' : profile.id}</strong>
        {isShared ? <span className="snapshot-badge">唯讀快照</span> : null}
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
            disabled={isShared}
            value={isShared ? sharedSemesterId : selectedSemester}
            onChange={(event) => void onSemesterChange(event.target.value)}
          >
            {isShared ? (
              <option value={sharedSemesterId}>{sharedSemesterId}</option>
            ) : (
              semesters.map((semester) => (
                <option key={semester.id} value={semester.id}>
                  {semester.id}
                </option>
              ))
            )}
          </select>
        </label>
      </div>
      {selectedTimetableSource && onTimetableSourceChange ? (
        <label className="timetable-source-select">
          <Users size={17} />
          <span className="sr-only">課表來源</span>
          <select
            value={selectedTimetableSource}
            onChange={(event) => onTimetableSourceChange(event.target.value)}
          >
            <option value="mine">我的課表</option>
            {sharedTimetables?.map((item) => (
              <option key={item.id} value={item.id}>
                {item.displayName}
              </option>
            ))}
          </select>
        </label>
      ) : null}
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
  refreshing,
  onRefresh,
  onDeleteEvent,
  onRequestAdd,
}: {
  events: CalendarEvent[]
  refreshing: boolean
  onRefresh: () => void
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
              className="plain-icon"
              type="button"
              aria-label="更新官方行事曆"
              title="更新官方行事曆"
              disabled={refreshing}
              onClick={onRefresh}
            >
              <RefreshCw className={refreshing ? 'spin' : ''} size={20} />
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
            const hasHolidayEvent = dateEvents.some(isHolidayCalendarEvent)
            const hasOfficialEvent = dateEvents.some(
              (event) => event.source !== 'personal' && !isHolidayCalendarEvent(event),
            )
            const hasPersonalEvent = dateEvents.some((event) => event.source === 'personal')
            return (
              <button
                className={`calendar-day ${selectedDate === date ? 'selected' : ''}`}
                key={date}
                type="button"
                onClick={() => setSelectedDate(date)}
              >
                <span>{day}</span>
                {hasOfficialEvent || hasHolidayEvent || hasPersonalEvent ? (
                  <span className="calendar-markers" aria-hidden="true">
                    {hasOfficialEvent ? <i className="official" /> : null}
                    {hasHolidayEvent ? <i className="holiday" /> : null}
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
            <div
              className={`agenda-row ${
                event.source === 'personal'
                  ? 'personal'
                  : isHolidayCalendarEvent(event)
                    ? 'holiday'
                    : 'official'
              }`}
              key={event.id}
            >
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
    { icon: Building2, label: '各系系網', view: 'departments' },
    { icon: Handshake, label: '海大產學中心', view: 'industry' },
    { icon: Trophy, label: '校外競賽', view: 'competitions' },
    { icon: CalendarDays, label: '重要日期', view: 'calendar' },
    { icon: LinkIcon, label: '海大連結', view: 'campus' },
    { icon: MapPinned, label: '交通與地圖', view: 'traffic' },
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
  competitionRefreshing,
  data,
  departmentSitesRef,
  industryRefreshing,
  loadPortalMenu,
  onLogout,
  onOpenPortalPage,
  onReauthenticate,
  onRefreshCompetitions,
  onRefreshIndustry,
  view,
}: {
  data: AppData
  competitionRefreshing: boolean
  departmentSitesRef: RefObject<DepartmentSitesScreenHandle | null>
  industryRefreshing: boolean
  loadPortalMenu?: (path: string[]) => Promise<PortalSystemNode[]>
  onLogout: () => Promise<void>
  onOpenPortalPage?: (path: string[]) => Promise<void>
  onReauthenticate: () => Promise<void>
  onRefreshCompetitions: () => Promise<void>
  onRefreshIndustry: () => Promise<void>
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
  if (view === 'traffic') return <CampusMapScreen />

  if (view === 'announcements') {
    return data.announcements.length ? (
      <section className="source-list-view">
        <div className="source-list-summary">
          <Bell size={18} />
          <span>海大學校公告 · 共 {data.announcements.length} 筆</span>
        </div>
        <LinkList items={data.announcements.map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: `${item.source} · ${item.publishedAt}`,
          url: item.url,
        }))} />
      </section>
    ) : (
      <div className="inline-empty"><Bell size={24} /><span>海大學校公告頁目前沒有資料</span></div>
    )
  }

  if (view === 'departments') return <DepartmentSitesScreen ref={departmentSitesRef} />

  if (view === 'industry') {
    return (
      <IndustryCenterScreen
        items={data.industryNews}
        onRefresh={onRefreshIndustry}
        refreshing={industryRefreshing}
      />
    )
  }

  if (view === 'competitions') {
    return (
      <ExternalCompetitionScreen
        items={data.externalCompetitions}
        onRefresh={onRefreshCompetitions}
        refreshing={competitionRefreshing}
      />
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

function IndustryCenterScreen({
  items,
  onRefresh,
  refreshing,
}: {
  items: IndustryNews[]
  onRefresh: () => Promise<void>
  refreshing: boolean
}) {
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      await onRefresh()
    } catch (refreshError) {
      setError(messageFromError(refreshError))
    }
  }, [onRefresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!items.length && refreshing) {
    return (
      <div className="inline-empty">
        <RefreshCw className="spin" size={24} />
        <span>正在取得最新產學消息</span>
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="inline-empty">
        <Handshake size={24} />
        <strong>目前沒有取得產學中心消息</strong>
        {error ? <span>{error}</span> : null}
        <button className="inline-retry" type="button" onClick={() => void refresh()}>
          <RefreshCw size={17} />重新整理
        </button>
      </div>
    )
  }

  return (
    <section className="source-list-view">
      <div className="source-list-summary industry">
        <Handshake size={18} />
        <span>海大產學營運總中心 · 最新 {items.length} 筆</span>
        <button
          type="button"
          aria-label="重新整理產學中心消息"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw className={refreshing ? 'spin' : undefined} size={17} />
        </button>
      </div>
      {error ? <div className="source-list-warning">更新失敗，暫時顯示上次資料：{error}</div> : null}
      <LinkList items={items.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: `${item.source} · ${item.publishedAt}`,
        url: item.url,
      }))} />
    </section>
  )
}

function ExternalCompetitionScreen({
  items,
  onRefresh,
  refreshing,
}: {
  items: ExternalCompetition[]
  onRefresh: () => Promise<void>
  refreshing: boolean
}) {
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setError(null)
    try {
      await onRefresh()
    } catch (refreshError) {
      setError(messageFromError(refreshError))
    }
  }, [onRefresh])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!items.length && refreshing) {
    return (
      <div className="inline-empty">
        <RefreshCw className="spin" size={24} />
        <span>正在取得最新校外競賽</span>
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="inline-empty">
        <Trophy size={24} />
        <strong>目前沒有取得校外競賽資料</strong>
        {error ? <span>{error}</span> : null}
        <button className="inline-retry" type="button" onClick={() => void refresh()}>
          <RefreshCw size={17} />重新整理
        </button>
      </div>
    )
  }

  return (
    <section className="source-list-view">
      <div className="source-list-summary competition">
        <Trophy size={18} />
        <span>創新創業發展中心 · 最新 {items.length} 筆</span>
        <button
          type="button"
          aria-label="重新整理校外競賽"
          disabled={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw className={refreshing ? 'spin' : undefined} size={17} />
        </button>
      </div>
      {error ? <div className="source-list-warning">更新失敗，暫時顯示上次資料：{error}</div> : null}
      <LinkList items={items.map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: `${item.source.replace(/^中原大學/, '')} · ${item.publishedAt}`,
        url: item.url,
      }))} />
    </section>
  )
}

function CampusMapScreen() {
  const [zoom, setZoom] = useState(1)

  return (
    <section className="campus-map-screen">
      <div className="campus-map-toolbar">
        <div>
          <MapPinned size={19} />
          <span>海大基隆校區館樓配置簡圖</span>
        </div>
        <div className="campus-map-zoom" aria-label="地圖縮放控制">
          <button
            type="button"
            aria-label="縮小地圖"
            disabled={zoom <= 1}
            onClick={() => setZoom((value) => Math.max(1, value - 0.5))}
          >
            <ZoomOut size={18} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            aria-label="放大地圖"
            disabled={zoom >= 3}
            onClick={() => setZoom((value) => Math.min(3, value + 0.5))}
          >
            <ZoomIn size={18} />
          </button>
        </div>
      </div>
      <div className="campus-map-scroll">
        <img
          alt="國立臺灣海洋大學基隆校區館樓配置簡圖"
          className="campus-map-image"
          src="/ntou-campus-map-2026.jpg"
          style={{ width: `${zoom * 100}%` }}
        />
      </div>
      <p className="campus-map-source">海大教務處 2026.7.27 版 · 使用上方按鈕放大後可拖曳查看</p>
    </section>
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
  isSharedSnapshot,
  loading,
  onClose,
  onDeleteCourse,
  slot,
}: {
  course: CourseSummary
  files: CourseFile[]
  isSharedSnapshot?: boolean
  loading: boolean
  onClose: () => void
  onDeleteCourse?: (title: string) => void
  slot?: TimetableSlot | null
}) {
  const weekday = slot ? weekdays.find((item) => item.value === slot.day)?.short : undefined
  const scheduleText = slot
    ? `週${weekday ?? slot.day} ${slot.startsAt || `第 ${slot.section} 節`}${slot.endsAt ? `–${slot.endsAt}` : ''}`
    : ''
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
          {scheduleText ? <div><dt>上課時間</dt><dd>{scheduleText}</dd></div> : null}
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

        <div className="section-label">{isSharedSnapshot ? '課表來源' : '課程檔案'}</div>
        {isSharedSnapshot ? (
          <div className="shared-course-note">
            <Users size={18} />
            <span>這是從 QR Code 匯入的唯讀課表快照，不會影響你的選課資料。</span>
          </div>
        ) : loading ? (
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

function TimetableShareSheet({
  initialName,
  onClose,
  semesterId,
  slots,
}: {
  initialName: string
  onClose: () => void
  semesterId: string
  slots: TimetableSlot[]
}) {
  const [ownerName, setOwnerName] = useState(initialName)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const renderQrCode = async () => {
      try {
        setError('')
        const payload = encodeTimetableShare({ ownerName, semesterId, slots })
        const dataUrl = await QRCode.toDataURL(payload, {
          width: 840,
          margin: 3,
          errorCorrectionLevel: 'M',
          color: { dark: '#082a43', light: '#ffffff' },
        })
        if (active) setQrDataUrl(dataUrl)
      } catch (renderError) {
        if (active) {
          setQrDataUrl('')
          setError(messageFromError(renderError))
        }
      }
    }
    const timer = window.setTimeout(() => void renderQrCode(), 120)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [ownerName, semesterId, slots])

  return (
    <div className="sheet-backdrop timetable-share-backdrop" role="presentation" onClick={onClose}>
      <section className="course-sheet timetable-share-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <button className="sheet-close" type="button" aria-label="關閉" onClick={onClose}>
          <X size={21} />
        </button>
        <div className="timetable-sheet-heading">
          <div className="timetable-sheet-icon"><QrCode size={24} /></div>
          <div><span>課表快照</span><h2>顯示我的 QR Code</h2></div>
        </div>

        <label className="timetable-name-field">
          <span>給同學看到的名稱</span>
          <input maxLength={30} value={ownerName} onChange={(event) => setOwnerName(event.target.value)} />
        </label>

        <div className="timetable-qr-ticket">
          <div className="timetable-qr-ticket-top">
            <span>海大 TAT</span>
            <strong>{semesterId}</strong>
          </div>
          <div className="timetable-qr-canvas">
            {qrDataUrl ? <img src={qrDataUrl} alt={`${ownerName}的課表 QR Code`} /> : <Loader2 className="spin" size={34} />}
          </div>
          <strong className="timetable-qr-name">{ownerName || '請輸入名稱'}</strong>
          <span className="timetable-qr-meta">{coursesFromTimetable(slots).length} 門課 · 掃描後匯入唯讀快照</span>
        </div>

        {error ? <div className="timetable-share-error"><AlertCircle size={17} />{error}</div> : null}
        <p className="timetable-privacy-note">
          <ShieldCheck size={16} />QR Code 只包含這學期的課表內容與上方名稱，不含學號、帳密或 Mail 資料。
        </p>
      </section>
    </div>
  )
}

function TimetableScanSheet({
  onClose,
  onImport,
}: {
  onClose: () => void
  onImport: (preview: TimetableSharePreview, displayName: string) => boolean
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<TimetableSharePreview | null>(null)
  const [displayName, setDisplayName] = useState('')

  const ensureAndroidScannerModule = async () => {
    if (Capacitor.getPlatform() !== 'android') return
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
    if (available) return

    setStatus('第一次使用，正在準備掃描元件…')
    await new Promise<void>((resolve, reject) => {
      let settled = false
      let removeListener: () => void = () => undefined
      const finish = (errorMessage?: string) => {
        if (settled) return
        settled = true
        window.clearTimeout(timeout)
        void removeListener()
        if (errorMessage) reject(new Error(errorMessage))
        else resolve()
      }
      const timeout = window.setTimeout(() => finish('掃描元件下載逾時，請確認網路後再試一次'), 60_000)
      void BarcodeScanner.addListener('googleBarcodeScannerModuleInstallProgress', (event) => {
        if (event.state === GoogleBarcodeScannerModuleInstallState.DOWNLOADING && event.progress !== undefined) {
          setStatus(`正在準備掃描元件 ${event.progress}%`)
        } else if (event.state === GoogleBarcodeScannerModuleInstallState.COMPLETED) {
          finish()
        } else if (
          event.state === GoogleBarcodeScannerModuleInstallState.FAILED ||
          event.state === GoogleBarcodeScannerModuleInstallState.CANCELED
        ) {
          finish('掃描元件準備失敗，請確認 Google Play 服務與網路連線')
        }
      }).then((listener) => {
        removeListener = () => { void listener.remove() }
        return BarcodeScanner.installGoogleBarcodeScannerModule()
      }).catch((installError) => finish(messageFromError(installError)))
    })
  }

  const startScan = async () => {
    if (!Capacitor.isNativePlatform()) {
      setError('請在 Android 手機版海大 TAT 使用相機掃描')
      return
    }
    setBusy(true)
    setError('')
    setStatus('正在開啟相機…')
    try {
      const { supported } = await BarcodeScanner.isSupported()
      if (!supported) throw new Error('這台裝置沒有可用的相機掃描功能')
      await ensureAndroidScannerModule()
      setStatus('')
      const result = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode], autoZoom: true })
      const rawValue = result.barcodes[0]?.rawValue || result.barcodes[0]?.displayValue
      if (!rawValue) throw new Error('沒有讀到 QR Code 內容，請再試一次')
      const decoded = decodeTimetableShare(rawValue)
      setPreview(decoded)
      setDisplayName(decoded.ownerName)
    } catch (scanError) {
      const message = messageFromError(scanError)
      if (!/cancel|取消/i.test(message)) setError(message)
    } finally {
      setBusy(false)
      setStatus('')
    }
  }

  return (
    <div className="sheet-backdrop timetable-share-backdrop" role="presentation" onClick={onClose}>
      <section className="course-sheet timetable-scan-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <button className="sheet-close" type="button" aria-label="關閉" onClick={onClose}>
          <X size={21} />
        </button>
        <div className="timetable-sheet-heading">
          <div className="timetable-sheet-icon"><ScanLine size={24} /></div>
          <div><span>同學課表</span><h2>掃描課表 QR Code</h2></div>
        </div>

        {preview ? (
          <>
            <div className="timetable-import-preview">
              <div><Users size={21} /><span>掃描成功</span></div>
              <strong>{preview.ownerName}</strong>
              <dl>
                <div><dt>學期</dt><dd>{preview.semesterId}</dd></div>
                <div><dt>課程</dt><dd>{coursesFromTimetable(preview.slots).length} 門</dd></div>
                <div><dt>快照時間</dt><dd>{new Date(preview.generatedAt).toLocaleString('zh-TW', { hour12: false })}</dd></div>
              </dl>
            </div>
            <label className="timetable-name-field">
              <span>儲存在 App 裡的名稱</span>
              <input maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
            </label>
            <button
              className="timetable-primary-action"
              type="button"
              disabled={!displayName.trim()}
              onClick={() => onImport(preview, displayName.trim())}
            >
              <Users size={19} />新增同學課表
            </button>
            <button className="timetable-secondary-action" type="button" onClick={() => void startScan()}>
              重新掃描
            </button>
          </>
        ) : (
          <>
            <div className="timetable-scan-illustration" aria-hidden="true">
              <div className="scan-corner scan-corner-a" />
              <div className="scan-corner scan-corner-b" />
              <QrCode size={72} strokeWidth={1.35} />
              <div className="scan-line" />
            </div>
            <p className="timetable-scan-copy">請對準同學手機上的「海大 TAT 課表 QR Code」。掃描後會先讓你確認名稱、學期和課程數量。</p>
            <button className="timetable-primary-action" type="button" disabled={busy} onClick={() => void startScan()}>
              {busy ? <Loader2 className="spin" size={19} /> : <Camera size={19} />}
              {status || '開啟相機掃描'}
            </button>
          </>
        )}
        {error ? <div className="timetable-share-error"><AlertCircle size={17} />{error}</div> : null}
        <p className="timetable-privacy-note"><ShieldCheck size={16} />匯入內容只會儲存在這台手機，不會上傳到伺服器。</p>
      </section>
    </div>
  )
}

function RenameTimetableSheet({
  initialName,
  onClose,
  onSave,
}: {
  initialName: string
  onClose: () => void
  onSave: (displayName: string) => void
}) {
  const [displayName, setDisplayName] = useState(initialName)
  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="course-sheet timetable-rename-sheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <button className="sheet-close" type="button" aria-label="關閉" onClick={onClose}><X size={21} /></button>
        <div className="timetable-sheet-heading">
          <div className="timetable-sheet-icon"><Pencil size={22} /></div>
          <div><span>同學課表</span><h2>重新命名</h2></div>
        </div>
        <label className="timetable-name-field">
          <span>課表名稱</span>
          <input autoFocus maxLength={40} value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
        <button className="timetable-primary-action" type="button" disabled={!displayName.trim()} onClick={() => onSave(displayName.trim())}>
          儲存名稱
        </button>
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
    departments: '各系系網',
    industry: '海大產學中心',
    competitions: '校外競賽',
    calendar: '重要日期',
    campus: '海大連結',
    traffic: '交通與地圖',
    emergency: '緊急聯絡',
    settings: '帳號與設定',
  }
  return titles[view]
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
