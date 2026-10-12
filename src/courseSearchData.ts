import type {
  CourseSearchDetail,
  CourseSearchItem,
  CourseSearchPage,
  CourseSearchRequest,
  CourseSearchSource,
  CourseSearchWeek,
  CourseWithdrawalEstimate,
} from './CourseSearchScreen'
import {
  appendWebFormsControls,
  buildCourseCatalogQueryBody,
  COURSE_CURRENT_ENTRY_URL,
  COURSE_CURRENT_QUERY_URL,
  COURSE_DETAIL_URL,
  COURSE_HISTORY_ENTRY_URL,
  COURSE_HISTORY_QUERY_URL,
  decodeCourseCatalogHtml,
  parseCourseCatalogDetail,
  parseCourseCatalogResults,
  type CourseCatalogDetail,
  type CourseCatalogOffering,
  type CourseCatalogQuery,
  type CourseCatalogSearchResult,
} from './api/courseCatalog'
import {
  buildMidtermWithdrawalQueryBody,
  estimateMidtermWithdrawalRate,
  lookupMidtermWithdrawal,
  NTOU_MIDTERM_WITHDRAWAL_URL,
  parseMidtermWithdrawalHtml,
  type MidtermWithdrawalParseResult,
} from './api/midtermWithdrawal'
import { assertOk, portalRequest, publicPageRequest, type PortalResponse } from './api/portalHttp'
import {
  cacheCourseCatalogDetail,
  cacheCourseCatalogSearch,
  readCachedCourseCatalogDetail,
  readCachedCourseCatalogSearch,
  readCourseCatalogCacheStore,
} from './storage/courseCatalogStorage'
import {
  loadBundledCourseDetail,
  loadBundledCourseCatalog,
  offlineWithdrawalSemester,
  type OfflineCourseCatalog,
  type OfflineCourseCatalogOffering,
} from './offlineCourseCatalog'

const COURSE_HISTORY_OUTSIDE_URL =
  'https://ais.ntou.edu.tw/outside.aspx?mainPage=LwBBAHAAcABsAGkAYwBhAHQAaQBvAG4ALwBUAEsARQAvAFQASwBFADIAMgAvAFQASwBFADIAMgAxADQAXwAuAGEAcwBwAHgAPwBwAHIAbwBnAGMAZAA9AFQASwBFADIAMgAxADQA'
const COURSE_CURRENT_OUTSIDE_URL =
  'https://ais.ntou.edu.tw/outside.aspx?mainPage=LwBBAHAAcABsAGkAYwBhAHQAaQBvAG4ALwBUAEsARQAvAFQASwBFADIAMgAvAFQASwBFADIAMgAxADUAXwAuAGEAcwBwAHgAPwBwAHIAbwBnAGMAZAA9AFQASwBFADIAMgAxADUA'

const COURSE_REQUEST_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7',
}

const coursePostHeaders = (referer: string) => ({
  ...COURSE_REQUEST_HEADERS,
  'Content-Type': 'application/x-www-form-urlencoded',
  Origin: 'https://ais.ntou.edu.tw',
  Referer: referer,
})

const MIDTERM_POST_HEADERS = {
  ...COURSE_REQUEST_HEADERS,
  'Content-Type': 'application/x-www-form-urlencoded',
  Origin: 'https://academics.ntou.edu.tw',
  Referer: NTOU_MIDTERM_WITHDRAWAL_URL,
}

type SpecialCourseUnit = { code: string; degree: '0' | '1' | '2' | '3' }
const TAIPEI_ALLIANCE_UNITS: readonly SpecialCourseUnit[] = [
  { code: '0909', degree: '0' },
  { code: '0929', degree: '1' },
  { code: '0939', degree: '2' },
]
const OTHER_EXCHANGE_UNITS: readonly SpecialCourseUnit[] = [
  { code: '0907', degree: '0' },
  { code: '0908', degree: '0' },
  { code: '0927', degree: '1' },
  { code: '0928', degree: '1' },
  { code: '0937', degree: '2' },
  { code: '0938', degree: '2' },
  { code: '040U', degree: '3' },
  { code: '0910', degree: '0' },
  { code: '0911', degree: '0' },
  { code: '0912', degree: '0' },
]
const MAX_UNIT_MATCHES = 8
const SERVER_PAGE_SIZE = 200

export type CourseSearchDataDependencies = {
  courseRequest?: typeof portalRequest
  publicRequest?: typeof publicPageRequest
  now?: () => number
  offlineCatalogLoader?: () => Promise<OfflineCourseCatalog | null>
  offlineDetailLoader?: typeof loadBundledCourseDetail
  /** Explicit test/development escape hatch. Production course search is offline-only. */
  allowNetworkCatalogFallback?: boolean
}

export type CourseSearchDataSource = {
  searchCourses: (
    request: CourseSearchRequest,
    signal?: AbortSignal,
  ) => Promise<CourseSearchPage>
  getCourseDetail: (
    course: CourseSearchItem,
    signal?: AbortSignal,
  ) => Promise<CourseSearchDetail>
  getWithdrawalEstimate: (
    course: CourseSearchItem,
    signal?: AbortSignal,
  ) => Promise<CourseWithdrawalEstimate | null>
}

type FacultyOption = {
  value: string
  label: string
}

type CourseSearchContext = {
  offering: CourseCatalogOffering
  html: string
  queryUrl: string
}

type CourseEndpoint = {
  kind: 'current' | 'history'
  outsideUrl: string
  entryUrl: string
  queryUrl: string
}

const COURSE_HISTORY_ENDPOINT: CourseEndpoint = {
  kind: 'history',
  outsideUrl: COURSE_HISTORY_OUTSIDE_URL,
  entryUrl: COURSE_HISTORY_ENTRY_URL,
  queryUrl: COURSE_HISTORY_QUERY_URL,
}

const COURSE_CURRENT_ENDPOINT: CourseEndpoint = {
  kind: 'current',
  outsideUrl: COURSE_CURRENT_OUTSIDE_URL,
  entryUrl: COURSE_CURRENT_ENTRY_URL,
  queryUrl: COURSE_CURRENT_QUERY_URL,
}

const normalizeText = (value: string | null | undefined) => (value ?? '')
  .normalize('NFKC')
  .replace(/\u00a0/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const normalizedKey = (value: string | null | undefined) => normalizeText(value).toLocaleLowerCase('zh-TW')

const decodeEntities = (value: string) => value
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))

const stripTags = (value: string) => normalizeText(decodeEntities(value.replace(/<[^>]+>/g, ' ')))

const readAttribute = (attributes: string, name: string) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = attributes.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, 'i'))
  return decodeEntities(match?.[1] ?? match?.[2] ?? '')
}

export const parseCourseFacultyOptions = (html: string): FacultyOption[] => {
  const select = [...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)]
    .find((match) => /(?:^|\b)(?:id|name)=["']?Q_FACULTY_CODE\b/i.test(match[1]))
  if (!select) return []

  return [...select[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
    .map((match) => ({
      value: readAttribute(match[1], 'value'),
      label: stripTags(match[2]),
    }))
    .filter((option) => option.value && option.label)
}

const selectedOptionValue = (html: string, controlName: string) => {
  const select = [...html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)]
    .find((match) => readAttribute(match[1], 'id') === controlName || readAttribute(match[1], 'name') === controlName)
  if (!select) return ''
  const options = [...select[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
  const selected = options.find((option) => /\bselected(?:\s*=|\s|>)/i.test(option[1])) ?? options[0]
  return selected ? readAttribute(selected[1], 'value') || stripTags(selected[2]) : ''
}

const normalizeSemester = (value: string) => {
  const match = normalizeText(value).match(/^(\d{2,3})\s*[-_/]?\s*([1-4])$/)
  return match ? `${match[1].padStart(3, '0')}-${match[2]}` : ''
}

const semesterForUi = (value: string) => normalizeSemester(value).replace('-', '')

export const currentCourseSemesterId = (now = Date.now()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date(now))
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  if (!Number.isInteger(year) || !Number.isInteger(month)) return ''
  if (month >= 8) return `${year - 1911}-1`
  if (month === 1) return `${year - 1912}-1`
  return `${year - 1912}-2`
}

const endpointForSemester = (semesterId: string, now: number): CourseEndpoint => (
  normalizeSemester(semesterId) === currentCourseSemesterId(now)
    ? COURSE_CURRENT_ENDPOINT
    : COURSE_HISTORY_ENDPOINT
)

const containsAllianceName = (value: string) => (
  /聯盟|北聯大|臺北聯大|台北聯大|臺北聯合大學|台北聯合大學/i.test(value)
)

const sourceForOffering = (offering: CourseCatalogOffering): CourseSearchSource => {
  const haystack = normalizeText([
    offering.department,
    offering.instructorDepartment,
    offering.title,
    offering.className,
  ].join(' '))
  if (containsAllianceName(haystack) && /線上|遠距/i.test(haystack)) {
    return 'online-alliance'
  }
  if (/臺北聯合大學|台北聯合大學|北聯大/i.test(haystack)) return 'taipei-alliance'
  if (/校際|外校|跨校|國外校際/i.test(haystack) || offering.source === 'intercollegiate') {
    return 'other-exchange'
  }
  return 'ntou'
}

export const courseSearchSourceForOffering = sourceForOffering

const requirementLabel = (value: string) => {
  const normalized = normalizeText(value)
  if (/^(?:A(?:\s*-|$)|必)/i.test(normalized)) return '必修'
  if (/^(?:B(?:\s*-|$)|選)/i.test(normalized)) return '選修'
  return normalized || undefined
}

export const courseSearchRequirementLabel = requirementLabel

const degreeCode = (degree: CourseSearchRequest['degree']) => {
  if (degree === 'undergraduate') return '0'
  if (degree === 'master') return '1'
  if (degree === 'doctorate') return '2'
  return ''
}

const isCourseCodeQuery = (value: string) => (
  /^[A-Za-z]{1,6}[A-Za-z0-9._-]*\d[A-Za-z0-9._-]*$/.test(normalizeText(value))
)

const uniqueQueries = (queries: CourseCatalogQuery[]) => [...new Map(queries.map((query) => [
  JSON.stringify({
    semesterId: query.semesterId,
    courseCode: query.courseCode,
    courseTitle: query.courseTitle,
    instructor: query.instructor,
    department: query.department,
    degree: query.degree,
    mode: query.mode,
  }),
  query,
])).values()]

export const buildCourseCatalogQueries = (
  request: CourseSearchRequest,
  faculties: FacultyOption[],
): CourseCatalogQuery[] => {
  const queryText = normalizeText(request.query)
  const common: CourseCatalogQuery = {
    semesterId: normalizeSemester(request.semester),
    degree: degreeCode(request.degree),
    match: 'fuzzy',
    page: 1,
    pageSize: SERVER_PAGE_SIZE,
  }
  const unitMatches = queryText
    ? faculties
      .filter((option) => normalizedKey(option.label).includes(normalizedKey(queryText)))
      .slice(0, MAX_UNIT_MATCHES)
    : []

  const withCourseQuery = (extra: CourseCatalogQuery = {}) => ({
    ...common,
    ...(isCourseCodeQuery(queryText) ? { courseCode: queryText } : { courseTitle: queryText }),
    ...extra,
  })
  const withInstructorQuery = (extra: CourseCatalogQuery = {}) => ({
    ...common,
    instructor: queryText,
    ...extra,
  })
  const withDepartmentQuery = (department: string, extra: CourseCatalogQuery = {}) => ({
    ...common,
    department,
    mode: 'department' as const,
    ...extra,
  })
  const specialUnitQueries = (units: readonly SpecialCourseUnit[]) => {
    const requestedDegree = degreeCode(request.degree)
    return units
      .filter((unit) => !requestedDegree || unit.degree === requestedDegree)
      .map((unit) => withDepartmentQuery(unit.code, { degree: unit.degree }))
  }

  if (request.source === 'taipei-alliance') {
    return specialUnitQueries(TAIPEI_ALLIANCE_UNITS)
  }
  if (request.source === 'other-exchange') {
    return specialUnitQueries(OTHER_EXCHANGE_UNITS)
  }
  if (request.source === 'online-alliance' && !queryText) {
    return [withCourseQuery({ courseTitle: '線上' }), withCourseQuery({ courseTitle: '遠距' })]
  }

  if (!queryText) return [{ ...common, mode: 'department' }]
  if (request.scope === 'course') return [withCourseQuery()]
  if (request.scope === 'teacher') return [withInstructorQuery()]
  if (request.scope === 'unit') return unitMatches.map((unit) => withDepartmentQuery(unit.value))

  return uniqueQueries([
    withCourseQuery(),
    withInstructorQuery(),
    ...unitMatches.map((unit) => withDepartmentQuery(unit.value)),
  ])
}

const itemIdForOffering = (offering: CourseCatalogOffering) => [
  offering.semesterId,
  offering.courseCode,
  offering.className,
  offering.instructor,
  offering.id,
].map(normalizedKey).join('|')

const toCourseSearchItem = (offering: CourseCatalogOffering): CourseSearchItem => ({
  id: itemIdForOffering(offering),
  semester: semesterForUi(offering.semesterId),
  source: sourceForOffering(offering),
  code: offering.courseCode || '課號未提供',
  title: offering.title || '未命名課程',
  unit: offering.department || '開課單位未提供',
  teacher: offering.instructor || '授課教師未提供',
  credits: offering.credits ?? 0,
  enrollment: offering.enrolledCount,
  capacity: offering.maximumStudents,
  selectionType: requirementLabel(offering.requirement),
  meetings: [],
})

const includesQuery = (offering: CourseCatalogOffering, request: CourseSearchRequest) => {
  const query = normalizedKey(request.query)
  if (!query) return true
  const values = {
    course: normalizedKey(`${offering.courseCode} ${offering.title}`),
    teacher: normalizedKey(offering.instructor),
    unit: normalizedKey(offering.department),
  }
  if (request.scope === 'course') return values.course.includes(query)
  if (request.scope === 'teacher') return values.teacher.includes(query)
  if (request.scope === 'unit') return values.unit.includes(query)
  return Object.values(values).some((value) => value.includes(query))
}

const matchesSelection = (offering: CourseCatalogOffering, request: CourseSearchRequest) => {
  if (request.selection === 'all') return true
  const requirement = requirementLabel(offering.requirement)
  return request.selection === 'required' ? requirement === '必修' : requirement === '選修'
}

const matchesSource = (offering: CourseCatalogOffering, request: CourseSearchRequest) => (
  request.source === 'all' || sourceForOffering(offering) === request.source
)

const matchesDegree = (offering: OfflineCourseCatalogOffering, request: CourseSearchRequest) => {
  if (request.degree === 'all' || !offering.degree && !offering.degrees?.length) return true
  const requested = degreeCode(request.degree)
  return offering.degrees?.includes(requested as '0' | '1' | '2' | '3') ?? offering.degree === requested
}

const compactSearchKey = (value: string) => normalizedKey(value).replace(/[\s\-_/.,，。:：;；()（）[\]【】]+/g, '')

const isSubsequence = (query: string, value: string) => {
  if (query.length < 2) return false
  let at = 0
  for (const character of value) {
    if (character === query[at]) at += 1
    if (at === query.length) return true
  }
  return false
}

const fuzzyFieldScore = (field: string, token: string) => {
  const normalized = normalizedKey(field)
  const compact = compactSearchKey(field)
  const compactToken = compactSearchKey(token)
  if (!compactToken) return 0
  if (normalized === token || compact === compactToken) return 120
  if (normalized.startsWith(token) || compact.startsWith(compactToken)) return 90
  if (normalized.includes(token) || compact.includes(compactToken)) return 65
  return isSubsequence(compactToken, compact) ? 25 : 0
}

const offlineMatchScore = (offering: OfflineCourseCatalogOffering, request: CourseSearchRequest) => {
  const query = normalizedKey(request.query)
  if (!query) return 1
  const tokens = query.split(/\s+/).filter(Boolean)
  const fields = request.scope === 'course'
    ? [offering.courseCode, offering.title]
    : request.scope === 'teacher'
      ? [offering.instructor]
      : request.scope === 'unit'
        ? [offering.department, offering.instructorDepartment]
        : [offering.courseCode, offering.title, offering.instructor, offering.department, offering.instructorDepartment]
  const scores = tokens.map((token) => Math.max(...fields.map((field) => fuzzyFieldScore(field, token))))
  return scores.every((score) => score > 0) ? scores.reduce((total, score) => total + score, 0) : 0
}

export const searchOfflineCourseOfferings = (
  catalog: OfflineCourseCatalog,
  request: CourseSearchRequest,
) => {
  const requestedSemester = normalizeSemester(request.semester)
  return catalog.items
    .map((offering) => ({ offering, score: offlineMatchScore(offering, request) }))
    .filter(({ offering, score }) => (
      (!requestedSemester || offering.semesterId === requestedSemester)
      && score > 0
      && matchesSelection(offering, request)
      && matchesSource(offering, request)
      && matchesDegree(offering, request)
    ))
    .sort((left, right) => (
      right.offering.semesterId.localeCompare(left.offering.semesterId, 'zh-TW')
      || right.score - left.score
      || left.offering.courseCode.localeCompare(right.offering.courseCode, 'zh-TW')
      || left.offering.title.localeCompare(right.offering.title, 'zh-TW')
    ))
    .map(({ offering }) => offering)
}

const DAY_LABELS = ['', '週一', '週二', '週三', '週四', '週五', '週六', '週日'] as const
const PERIOD_TIMES = [
  ['06:20', '08:10'],
  ['08:20', '09:10'],
  ['09:20', '10:10'],
  ['10:20', '11:10'],
  ['11:15', '12:05'],
  ['12:10', '13:00'],
  ['13:10', '14:00'],
  ['14:10', '15:00'],
  ['15:10', '16:00'],
  ['16:05', '16:55'],
  ['17:30', '18:20'],
  ['18:30', '19:20'],
  ['19:20', '20:10'],
  ['20:20', '21:10'],
  ['21:10', '22:00'],
] as const

type MeetingSlot = {
  day: number
  period: number
  classroom: string
}

const meetingSlot = (value: string, classroom: string): MeetingSlot | null => {
  const compact = normalizeText(value).replace(/\D/g, '')
  if (compact.length < 2) return null
  const day = Number(compact.slice(0, 1))
  const period = Number(compact.slice(1))
  if (!DAY_LABELS[day] || !PERIOD_TIMES[period]) return null
  return { day, period, classroom: normalizeText(classroom) }
}

export const formatCourseDetailMeetings = (
  meetingTimes: string[],
  classrooms: string[],
): CourseSearchItem['meetings'] => {
  const slots = meetingTimes
    .map((value, index) => meetingSlot(value, classrooms[index] ?? classrooms[0] ?? ''))
    .filter((slot): slot is MeetingSlot => Boolean(slot))
    .sort((left, right) => left.day - right.day || left.period - right.period)
  if (!slots.length) return []

  const groups: MeetingSlot[][] = []
  slots.forEach((slot) => {
    const previous = groups.at(-1)
    const last = previous?.at(-1)
    if (last && last.day === slot.day && last.classroom === slot.classroom && last.period + 1 === slot.period) {
      previous!.push(slot)
    } else {
      groups.push([slot])
    }
  })

  return groups.map((group) => {
    const first = group[0]
    const last = group[group.length - 1]
    return {
      time: `${DAY_LABELS[first.day]} ${PERIOD_TIMES[first.period][0]}–${PERIOD_TIMES[last.period][1]}`,
      ...(first.classroom ? { classroom: first.classroom } : {}),
    }
  })
}

export const parseCourseScheduleWeeks = (value: string): CourseSearchWeek[] => {
  const chineseWeekNumber = (token: string) => {
    const digits: Record<string, number> = {
      一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
    }
    if (token === '十') return 10
    const [tens, ones = ''] = token.split('十')
    if (token.includes('十')) {
      return (tens ? digits[tens] ?? 0 : 1) * 10 + (ones ? digits[ones] ?? 0 : 0)
    }
    return digits[token] ?? Number(token)
  }
  const normalized = value
    .replace(
      /([一二三四五六七八九十]{1,3})(?=\s*(?:週|[-–~～至]\s*[一二三四五六七八九十]{1,3}\s*週))/g,
      (token) => String(chineseWeekNumber(token)),
    )
    .replace(/\r/g, '')
    .replace(/\s+(?=(?:第\s*)?(?:week\s*)?\d{1,2}(?:\s*[-–~～至]\s*\d{1,2})?\s*(?:週|[.、:：)）]))/gi, '\n')
    .trim()
  if (!normalized) return []
  const rows = normalized
    .split(/\n+/)
    .map((row) => row.trim())
    .filter(Boolean)
  const weeks: CourseSearchWeek[] = []
  rows.forEach((row) => {
    const match = row.match(
      /^(?:第\s*)?(?:week\s*)?(\d{1,2})(?:\s*[-–~～至]\s*(\d{1,2}))?(?:\s*週)?\s*[.、:：)）-]?\s*(.+)$/i,
    )
    if (match) {
      weeks.push({
        week: match[2] ? `${Number(match[1])}–${Number(match[2])}` : Number(match[1]),
        topic: match[3].trim(),
      })
    }
  })
  return weeks
}

const mergeCatalogDetail = (
  offering: CourseCatalogOffering,
  detail: CourseCatalogDetail,
): CourseCatalogDetail => ({
  ...detail,
  id: offering.id || detail.id,
  semesterId: detail.semesterId || offering.semesterId,
  courseCode: detail.courseCode || offering.courseCode,
  title: detail.title || offering.title,
  department: detail.department || offering.department,
  className: detail.className || offering.className,
  instructor: detail.instructor || offering.instructor,
  instructorDepartment: detail.instructorDepartment || offering.instructorDepartment,
  credits: detail.credits ?? offering.credits,
  requirement: detail.requirement || offering.requirement,
  enrolledCount: detail.enrolledCount ?? offering.enrolledCount,
  maximumStudents: detail.maximumStudents ?? offering.maximumStudents,
  minimumStudents: detail.minimumStudents ?? offering.minimumStudents,
  internship: detail.internship ?? offering.internship,
  hours: detail.hours ?? offering.hours,
  crossListed: detail.crossListed ?? offering.crossListed,
  term: detail.term || offering.term,
  source: offering.source,
  detailUrl: detail.detailUrl || offering.detailUrl,
  detailPostback: offering.detailPostback || detail.detailPostback,
})

const toCourseSearchDetail = (detail: CourseCatalogDetail): CourseSearchDetail => {
  const item = toCourseSearchItem(detail)
  const delivery = normalizeText(detail.deliveryMode)
  const identity = normalizeText(`${detail.department} ${detail.title}`)
  if (/線上|遠距/.test(delivery) && containsAllianceName(identity)) {
    item.source = 'online-alliance'
  }
  return {
    ...item,
    meetings: formatCourseDetailMeetings(detail.meetingTimes, detail.classrooms),
    englishTitle: detail.englishTitle || undefined,
    description: detail.contentZh || undefined,
    descriptionEn: detail.contentEn || undefined,
    objective: detail.objectiveZh || undefined,
    objectiveEn: detail.objectiveEn || undefined,
    outline: detail.scheduleZh || undefined,
    outlineEn: detail.scheduleEn || undefined,
    teachingMethod: detail.teachingMethodZh || undefined,
    teachingMethodEn: detail.teachingMethodEn || undefined,
    evaluation: detail.evaluationZh || undefined,
    evaluationEn: detail.evaluationEn || undefined,
    prerequisites: detail.prerequisitesZh || undefined,
    prerequisitesEn: detail.prerequisitesEn || undefined,
    references: detail.referencesZh || undefined,
    referencesEn: detail.referencesEn || undefined,
    sustainableDevelopmentGoals: detail.sustainableDevelopmentGoals || undefined,
    referenceUrl: detail.referenceUrl || detail.downloadUrl || undefined,
    className: detail.className || undefined,
    instructorDepartment: detail.instructorDepartment || undefined,
    requirement: detail.requirement || undefined,
    hours: detail.hours,
    minimumStudents: detail.minimumStudents,
    internship: detail.internship,
    crossListed: detail.crossListed,
    masterDoctorCombined: detail.masterDoctorCombined,
    term: detail.term || undefined,
    allEnglish: detail.allEnglish,
    deliveryMode: detail.deliveryMode || undefined,
    audience: detail.audience || undefined,
    mainField: detail.mainField || undefined,
    subField: detail.subField || undefined,
    coInstructors: detail.coInstructors || undefined,
    coreCompetencies: detail.coreCompetencies || undefined,
    characteristicField: detail.characteristicField || undefined,
    downloadUrl: detail.downloadUrl || undefined,
    notes: detail.notes || undefined,
    weeks: parseCourseScheduleWeeks(detail.scheduleZh || detail.scheduleEn),
  }
}

export const courseDetailMatchesOffering = (
  detail: CourseCatalogDetail,
  offering: CourseCatalogOffering,
) => (
  detail.semesterId === offering.semesterId
  && normalizedKey(detail.courseCode) === normalizedKey(offering.courseCode)
  && normalizedKey(detail.instructor) === normalizedKey(offering.instructor)
  && normalizedKey(detail.className) === normalizedKey(offering.className)
  && normalizedKey(detail.department) === normalizedKey(offering.department)
)

export const selectMatchingCourseOffering = (
  candidates: CourseCatalogOffering[],
  expected: CourseCatalogOffering,
) => {
  const sameCode = candidates.filter((candidate) => (
    normalizedKey(candidate.courseCode) === normalizedKey(expected.courseCode)
  ))
  const exact = sameCode.find((candidate) => (
    (!expected.instructor || normalizedKey(candidate.instructor) === normalizedKey(expected.instructor))
    && (!expected.className || normalizedKey(candidate.className) === normalizedKey(expected.className))
    && (!expected.department || normalizedKey(candidate.department) === normalizedKey(expected.department))
  ))
  if (exact) return exact
  if (!expected.instructor && !expected.className && sameCode.length === 1) return sameCode[0]
  return undefined
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (!signal?.aborted) return
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The operation was aborted.', 'AbortError')
}

const responseHtml = (response: PortalResponse, message: string) => {
  assertOk(response, message)
  return decodeCourseCatalogHtml(response.data, String(response.headers['content-type'] ?? ''))
}

const deleteSubmitControls = (body: URLSearchParams) => {
  ;['QUERY_BTN1', 'QUERY_BTN3', 'QUERY_BTN4', 'QUERY_BTN5', 'QUERY_BTN6', 'QUERY_BTN7', 'QUERY_BTN8']
    .forEach((name) => body.delete(name))
}

const buildDegreeChangeBody = (html: string, degree: string) => {
  const body = appendWebFormsControls(new URLSearchParams(), html)
  deleteSubmitControls(body)
  body.set('__EVENTTARGET', 'Q_DEGREE_CODE')
  body.set('__EVENTARGUMENT', '')
  body.set('Q_DEGREE_CODE', degree)
  return body.toString()
}

const decodeRepeatedly = (value: string) => {
  let decoded = decodeEntities(value)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded)
      if (next === decoded) break
      decoded = next
    } catch {
      break
    }
  }
  return decoded
}

export const findCourseDetailPkno = (html: string) => {
  const decoded = decodeRepeatedly(html)
  return decoded.match(/TKE2240_03\.aspx\?PKNO=([\w-]+)/i)?.[1]
    ?? decoded.match(/[?&]PKNO=([\w-]+)/i)?.[1]
    ?? decoded.match(/fn_open\s*\(\s*['"]?([\w-]+)/i)?.[1]
    ?? ''
}

const mockOfferings: CourseSearchItem[] = [
  {
    id: 'mock-mechanics', semester: '1151', source: 'ntou', code: 'ME3301',
    title: '機械設計', unit: '機械與機電工程學系', teacher: '林老師', credits: 3,
    enrollment: 42, capacity: 55, selectionType: '選修', meetings: [{ time: '週一 10:20–12:05', classroom: 'ME201' }],
  },
  {
    id: 'mock-alliance', semester: '1151', source: 'taipei-alliance', code: 'UA2102',
    title: '跨校永續設計', unit: '校際選課（臺北聯合大學系統）', teacher: '陳老師', credits: 2,
    enrollment: 28, capacity: 40, selectionType: '選修', meetings: [{ time: '週三 18:30–20:10', classroom: '線上' }],
  },
  {
    id: 'mock-online', semester: '1151', source: 'online-alliance', code: 'UA2206',
    title: '聯盟線上海洋資料分析', unit: '臺北聯合大學系統', teacher: '吳老師', credits: 2,
    enrollment: 51, capacity: 80, selectionType: '選修', meetings: [{ time: '週五 13:10–15:00', classroom: '線上' }],
  },
  {
    id: 'mock-exchange', semester: '1142', source: 'other-exchange', code: 'EX1001',
    title: '校際創新實作', unit: '校際選課', teacher: '許老師', credits: 2,
    enrollment: null, capacity: null, selectionType: '選修', meetings: [],
  },
]

const createMockCourseSearchDataSource = (): CourseSearchDataSource => ({
  async searchCourses(request, signal) {
    throwIfAborted(signal)
    const query = normalizedKey(request.query)
    const filtered = mockOfferings.filter((course) => (
      (!request.semester || course.semester === semesterForUi(request.semester))
      && (request.source === 'all' || course.source === request.source)
      && (request.selection === 'all'
        || request.selection === 'required' && /必/.test(course.selectionType ?? '')
        || request.selection === 'elective' && /選/.test(course.selectionType ?? ''))
      && (!query || normalizedKey(`${course.code} ${course.title} ${course.unit} ${course.teacher}`).includes(query))
    ))
    const start = (request.page - 1) * request.pageSize
    return {
      items: filtered.slice(start, start + request.pageSize),
      page: request.page,
      pageSize: request.pageSize,
      total: filtered.length,
      hasNextPage: start + request.pageSize < filtered.length,
    }
  },
  async getCourseDetail(course, signal) {
    throwIfAborted(signal)
    return {
      ...course,
      description: '從實際案例建立設計流程，並以小組實作完成專題。',
      objective: '理解設計方法、工程分析與跨域協作。',
      outline: '需求分析、概念設計、驗證與成果發表。',
      teachingMethod: '講授、案例討論與分組實作。',
      evaluation: '作業、期中報告與期末專題。',
      prerequisites: '官方課綱未列先修限制。',
      references: '以授課教師公告教材為準。',
      weeks: [{ week: 1, topic: '課程與專題說明' }, { week: 2, topic: '需求定義' }],
    }
  },
  async getWithdrawalEstimate(course, signal) {
    throwIfAborted(signal)
    if (course.source !== 'ntou') {
      return { status: 'unavailable', explanation: '校際或聯盟課程未提供可可靠比對的退選資料。' }
    }
    return {
      status: 'estimated',
      midtermWithdrawalCount: 3,
      initialEnrollment: 45,
      finalEnrollment: 42,
      ratePercent: 6.7,
      explanation: '測試資料',
    }
  },
})

export const createCourseSearchDataSource = (
  mock = false,
  dependencies: CourseSearchDataDependencies = {},
): CourseSearchDataSource => {
  if (mock) return createMockCourseSearchDataSource()

  const requestCoursePage = dependencies.courseRequest ?? portalRequest
  const requestPublicPage = dependencies.publicRequest ?? publicPageRequest
  const requestOfflineCatalog = dependencies.offlineCatalogLoader ?? loadBundledCourseCatalog
  const requestOfflineDetail = dependencies.offlineDetailLoader ?? loadBundledCourseDetail
  const allowNetworkCatalogFallback = dependencies.allowNetworkCatalogFallback === true
  let queue: Promise<void> = Promise.resolve()
  let offlineCatalogPromise: Promise<OfflineCourseCatalog | null> | null = null
  const baseHtmlByEndpoint = new Map<CourseEndpoint['kind'], string>()
  const itemContexts = new Map<string, CourseSearchContext>()
  const withdrawalResults = new Map<string, Promise<MidtermWithdrawalParseResult>>()

  const serialized = <T>(work: () => Promise<T>) => {
    const result = queue.then(work, work)
    queue = result.then(() => undefined, () => undefined)
    return result
  }

  const getOfflineCatalog = () => {
    if (!offlineCatalogPromise) {
      offlineCatalogPromise = requestOfflineCatalog().catch(() => null)
    }
    return offlineCatalogPromise
  }

  const getCoursePage = async (url: string, signal?: AbortSignal) => {
    throwIfAborted(signal)
    const response = await requestCoursePage({
      url,
      method: 'GET',
      headers: COURSE_REQUEST_HEADERS,
      timeoutMs: 35_000,
    })
    throwIfAborted(signal)
    return responseHtml(response, '海大課程查詢目前無法連線')
  }

  const postCoursePage = async (endpoint: CourseEndpoint, body: string, signal?: AbortSignal) => {
    throwIfAborted(signal)
    const response = await requestCoursePage({
      url: endpoint.queryUrl,
      method: 'POST',
      headers: coursePostHeaders(endpoint.queryUrl),
      data: body,
      timeoutMs: 45_000,
    })
    throwIfAborted(signal)
    return responseHtml(response, '海大課程查詢目前無法連線')
  }

  const loadBase = async (endpoint: CourseEndpoint, signal?: AbortSignal, force = false) => {
    const cached = baseHtmlByEndpoint.get(endpoint.kind)
    if (cached && !force) return cached
    await getCoursePage(endpoint.outsideUrl, signal)
    await getCoursePage(endpoint.entryUrl, signal)
    const html = await getCoursePage(endpoint.queryUrl, signal)
    const hasExpectedControls = endpoint.kind === 'current'
      ? /Q_AYEARSMS/i.test(html)
      : /Q_AYEAR/i.test(html)
    if (!/__VIEWSTATE/i.test(html) || !hasExpectedControls) {
      throw new Error('海大課程查詢頁格式暫時無法辨識')
    }
    baseHtmlByEndpoint.set(endpoint.kind, html)
    return html
  }

  const runCatalogQuery = async (
    query: CourseCatalogQuery,
    signal?: AbortSignal,
    forceNetwork = false,
  ): Promise<{ result: CourseCatalogSearchResult; html: string }> => {
    if (!allowNetworkCatalogFallback) {
      throw new Error('課程查詢僅使用 App 內建資料，不會連線至學校課程網站')
    }
    const now = dependencies.now?.() ?? Date.now()
    const endpoint = endpointForSemester(query.semesterId ?? '', now)
    const cached = forceNetwork
      ? null
      : readCachedCourseCatalogSearch(query, dependencies.now?.() ?? Date.now())
    if (cached) {
      cached.items.forEach((offering) => {
        itemContexts.set(itemIdForOffering(offering), { offering, html: '', queryUrl: endpoint.queryUrl })
      })
      return { result: cached, html: '' }
    }

    let formHtml = await loadBase(endpoint, signal)
    if (
      query.department
      && query.degree
      && !parseCourseFacultyOptions(formHtml).some((option) => option.value === query.department)
    ) {
      const degreeHtml = await postCoursePage(
        endpoint,
        buildDegreeChangeBody(formHtml, query.degree),
        signal,
      )
      if (!/__VIEWSTATE/i.test(degreeHtml)) {
        throw new Error('官方課程查詢無法切換到指定部別')
      }
      formHtml = degreeHtml
      baseHtmlByEndpoint.set(endpoint.kind, degreeHtml)
    }
    let html = await postCoursePage(endpoint, buildCourseCatalogQueryBody(formHtml, query), signal)
    if (!/__VIEWSTATE/i.test(html)) {
      formHtml = await loadBase(endpoint, signal, true)
      html = await postCoursePage(endpoint, buildCourseCatalogQueryBody(formHtml, query), signal)
    }
    if (!/__VIEWSTATE/i.test(html)) {
      throw new Error(/getMessage\s*\(\s*['"]403['"]\s*\)/i.test(html)
        ? '官方課程查詢拒絕了這次條件，請縮小關鍵字或稍後再試'
        : '官方課程查詢回傳了無法辨識的頁面')
    }
    baseHtmlByEndpoint.set(endpoint.kind, html)
    const result = parseCourseCatalogResults(html, query)
    cacheCourseCatalogSearch(query, result, dependencies.now?.() ?? Date.now())
    result.items.forEach((offering) => {
      itemContexts.set(itemIdForOffering(offering), { offering, html, queryUrl: endpoint.queryUrl })
    })
    return { result, html }
  }

  const searchCourses = async (
    request: CourseSearchRequest,
    signal?: AbortSignal,
  ): Promise<CourseSearchPage> => serialized(async () => {
    const semester = normalizeSemester(request.semester)
    const now = dependencies.now?.() ?? Date.now()
    const offlineCatalog = await getOfflineCatalog()
    throwIfAborted(signal)
    const hasNonSemesterFilter = request.source !== 'all'
      || request.degree !== 'all'
      || request.selection !== 'all'
    if (!semester && !normalizeText(request.query) && !hasNonSemesterFilter) {
      throw new Error('請輸入關鍵字，或至少選擇一項來源、學制或選別篩選')
    }
    if (!offlineCatalog && !allowNetworkCatalogFallback) {
      throw new Error('App 內建課程資料目前無法載入，請重新安裝完整測試版')
    }
    if (offlineCatalog && (!semester || offlineCatalog.semesters.includes(semester))) {
      const offerings = searchOfflineCourseOfferings(offlineCatalog, { ...request, semester })
      // A published snapshot is authoritative, including a zero-result search.
      // Never silently fall through to AIS: that made a local lookup take tens
      // of seconds and generated avoidable traffic against the school site.
      const endpoint = endpointForSemester(semester || offlineCatalog.semesters[0] || currentCourseSemesterId(now), now)
      offerings.forEach((offering) => {
        itemContexts.set(itemIdForOffering(offering), {
          offering,
          html: '',
          queryUrl: endpoint.queryUrl,
        })
      })
      const page = Math.max(1, request.page)
      const start = (page - 1) * request.pageSize
      return {
        items: offerings.slice(start, start + request.pageSize).map(toCourseSearchItem),
        page,
        pageSize: request.pageSize,
        total: offerings.length,
        hasNextPage: start + request.pageSize < offerings.length,
      }
    }
    if (offlineCatalog && semester && !offlineCatalog.semesters.includes(semester) && !allowNetworkCatalogFallback) {
      const from = offlineCatalog.range?.from ?? offlineCatalog.semesters.at(-1) ?? '113-1'
      const to = offlineCatalog.range?.to ?? offlineCatalog.semesters[0] ?? '115-1'
      throw new Error(`內建離線課程僅提供 ${from}～${to}`)
    }
    if (!normalizeText(request.query) && (request.source === 'all' || request.source === 'ntou')) {
      throw new Error('請輸入課名、課號、老師或開課單位；校際來源可直接瀏覽')
    }
    const endpoint = endpointForSemester(semester, now)
    let formHtml = await loadBase(endpoint, signal)
    const requestedDegree = degreeCode(request.degree)
    if (request.scope === 'unit' && requestedDegree) {
      const selectedDegree = normalizeText(selectedOptionValue(formHtml, 'Q_DEGREE_CODE'))
      if (selectedDegree !== requestedDegree) {
        const degreeHtml = await postCoursePage(
          endpoint,
          buildDegreeChangeBody(formHtml, requestedDegree),
          signal,
        )
        if (!/__VIEWSTATE/i.test(degreeHtml)) throw new Error('官方課程查詢無法切換到指定部別')
        formHtml = degreeHtml
        baseHtmlByEndpoint.set(endpoint.kind, degreeHtml)
      }
    }
    const queries = buildCourseCatalogQueries(
      { ...request, semester },
      parseCourseFacultyOptions(formHtml),
    )
    if (!queries.length && request.scope === 'unit') {
      return { items: [], page: 1, pageSize: request.pageSize, total: 0, hasNextPage: false }
    }

    const offerings: CourseCatalogOffering[] = []
    for (const query of queries) {
      throwIfAborted(signal)
      const { result } = await runCatalogQuery(query, signal)
      offerings.push(...result.items)
    }
    const unique = [...new Map(offerings.map((offering) => [itemIdForOffering(offering), offering])).values()]
      .filter((offering) => includesQuery(offering, request))
      .filter((offering) => matchesSelection(offering, request))
      .filter((offering) => matchesSource(offering, request))
      .sort((left, right) => (
        right.semesterId.localeCompare(left.semesterId, 'zh-TW')
        || left.courseCode.localeCompare(right.courseCode, 'zh-TW')
        || left.title.localeCompare(right.title, 'zh-TW')
      ))
    unique.forEach((offering) => {
      const existing = itemContexts.get(itemIdForOffering(offering))
      itemContexts.set(itemIdForOffering(offering), existing ?? {
        offering,
        html: '',
        queryUrl: endpoint.queryUrl,
      })
    })
    const page = Math.max(1, request.page)
    const start = (page - 1) * request.pageSize
    return {
      items: unique.slice(start, start + request.pageSize).map(toCourseSearchItem),
      page,
      pageSize: request.pageSize,
      total: unique.length,
      hasNextPage: start + request.pageSize < unique.length,
    }
  })

  const refreshDetailContext = async (
    course: CourseSearchItem,
    offering: CourseCatalogOffering,
    signal?: AbortSignal,
  ) => {
    const query: CourseCatalogQuery = {
      semesterId: normalizeSemester(course.semester || offering.semesterId),
      courseCode: offering.courseCode || course.code,
      match: 'exact',
      page: 1,
      pageSize: SERVER_PAGE_SIZE,
    }
    // Detail postbacks are bound to the current WebForms response. A cached
    // search result contains offerings but not that HTML state, so always
    // refresh this exact query before trying to open the selected row.
    const { result, html } = await runCatalogQuery(query, signal, true)
    const matched = selectMatchingCourseOffering(result.items, {
      ...offering,
      courseCode: offering.courseCode || course.code,
    })
    if (!matched) throw new Error('找不到這門課的官方課綱連結')
    const endpoint = endpointForSemester(query.semesterId ?? '', dependencies.now?.() ?? Date.now())
    const context = { offering: matched, html, queryUrl: endpoint.queryUrl }
    itemContexts.set(course.id, context)
    return context
  }

  const detailFromPostback = async (
    context: CourseSearchContext,
    signal?: AbortSignal,
  ) => {
    if (!context.html || !context.offering.detailPostback) return null
    const body = appendWebFormsControls(new URLSearchParams(), context.html)
    deleteSubmitControls(body)
    body.set('__EVENTTARGET', context.offering.detailPostback)
    body.set('__EVENTARGUMENT', '')
    const endpoint = context.queryUrl === COURSE_CURRENT_QUERY_URL
      ? COURSE_CURRENT_ENDPOINT
      : COURSE_HISTORY_ENDPOINT
    const responseHtmlValue = await postCoursePage(endpoint, body.toString(), signal)
    const embeddedDetail = /\bid=["']M_COSID["']/i.test(responseHtmlValue)
      ? responseHtmlValue
      : ''
    return { pkno: findCourseDetailPkno(responseHtmlValue), embeddedDetail }
  }

  const getCourseDetail = async (
    course: CourseSearchItem,
    signal?: AbortSignal,
  ): Promise<CourseSearchDetail> => serialized(async () => {
    throwIfAborted(signal)
    let context = itemContexts.get(course.id)
    if (!context) {
      throw new Error('請先重新查詢這門課，再開啟課程介紹')
    }

    const offlineCatalog = await getOfflineCatalog()
    throwIfAborted(signal)
    if (offlineCatalog?.semesters.includes(context.offering.semesterId)) {
      const offlineDetail = await requestOfflineDetail(offlineCatalog, context.offering)
      throwIfAborted(signal)
      if (!offlineDetail) {
        throw new Error('這門課的官方課綱未包含在本版離線資料中')
      }
      return toCourseSearchDetail(mergeCatalogDetail(context.offering, offlineDetail))
    }
    if (!allowNetworkCatalogFallback) {
      throw new Error('這個學期未包含在 App 的離線課程資料中')
    }

    const cachedByIdentity = readCachedCourseCatalogDetail({
      id: context.offering.id,
      pkno: context.offering.pkno,
      semesterId: context.offering.semesterId,
    }, dependencies.now?.() ?? Date.now())
    const cached = cachedByIdentity ?? readCourseCatalogCacheStore(dependencies.now?.() ?? Date.now()).details
      .map((entry) => entry.detail)
      .find((detail) => courseDetailMatchesOffering(detail, context!.offering))
    if (cached) return toCourseSearchDetail(cached)

    if ((!context.html || !context.offering.detailPostback) && !context.offering.pkno) {
      context = await refreshDetailContext(course, context.offering, signal)
    }
    const resolved = await detailFromPostback(context, signal)
    const pkno = resolved?.pkno || context.offering.pkno
    let detailHtml = resolved?.embeddedDetail ?? ''
    if (!detailHtml) {
      if (!pkno) throw new Error('官方課綱連結目前無法辨識，請稍後再試')
      const url = new URL(COURSE_DETAIL_URL)
      url.searchParams.set('PKNO', pkno)
      detailHtml = await getCoursePage(url.toString(), signal)
    }
    const detail = mergeCatalogDetail(context.offering, parseCourseCatalogDetail(detailHtml, pkno))
    cacheCourseCatalogDetail(detail, dependencies.now?.() ?? Date.now())
    return toCourseSearchDetail(detail)
  })

  const loadWithdrawalSemester = (semester: string, signal?: AbortSignal) => {
    const normalized = normalizeSemester(semester)
    const existing = withdrawalResults.get(normalized)
    if (existing) return existing
    const pending = (async () => {
      throwIfAborted(signal)
      const initialResponse = await requestPublicPage({
        url: NTOU_MIDTERM_WITHDRAWAL_URL,
        method: 'GET',
        headers: COURSE_REQUEST_HEADERS,
        timeoutMs: 45_000,
      }, '海大退選資料')
      const initialHtml = responseHtml(initialResponse, '海大退選資料目前無法連線')
      const body = buildMidtermWithdrawalQueryBody(initialHtml, normalized)
      const resultResponse = await requestPublicPage({
        url: NTOU_MIDTERM_WITHDRAWAL_URL,
        method: 'POST',
        headers: MIDTERM_POST_HEADERS,
        data: body,
        timeoutMs: 60_000,
      }, '海大退選資料')
      throwIfAborted(signal)
      return parseMidtermWithdrawalHtml(
        responseHtml(resultResponse, '海大退選資料目前無法連線'),
        normalized,
      )
    })()
    withdrawalResults.set(normalized, pending)
    pending.catch(() => withdrawalResults.delete(normalized))
    return pending
  }

  const resolveCourseCodeEnrollment = async (
    course: CourseSearchItem,
    semester: string,
    signal?: AbortSignal,
  ) => {
    if (!normalizeText(course.code) || course.code === '課號未提供') return null
    const offlineCatalog = await getOfflineCatalog()
    throwIfAborted(signal)
    let candidates: CourseCatalogOffering[]
    if (offlineCatalog?.semesters.includes(semester)) {
      candidates = offlineCatalog.items.filter((offering) => offering.semesterId === semester)
    } else {
      const { result } = await runCatalogQuery({
        semesterId: semester,
        courseCode: course.code,
        match: 'exact',
        page: 1,
        pageSize: SERVER_PAGE_SIZE,
      }, signal)
      if (result.totalPages > 1) return null
      candidates = result.items
    }
    const sections = [...new Map(candidates
      .filter((offering) => normalizedKey(offering.courseCode) === normalizedKey(course.code))
      .map((offering) => [itemIdForOffering(offering), offering])).values()]
    if (!sections.length || sections.some((offering) => offering.enrolledCount === null)) return null
    const titles = new Set(sections.map((offering) => normalizedKey(offering.title)).filter(Boolean))
    if (titles.size !== 1 || !titles.has(normalizedKey(course.title))) return null
    return {
      sectionCount: sections.length,
      enrollment: sections.reduce((total, offering) => total + (offering.enrolledCount ?? 0), 0),
      includesOtherInstructor: sections.some((offering) => (
        normalizedKey(offering.instructor) !== normalizedKey(course.teacher)
      )),
    }
  }

  const getWithdrawalEstimate = async (
    course: CourseSearchItem,
    signal?: AbortSignal,
  ): Promise<CourseWithdrawalEstimate | null> => {
    if (course.source !== 'ntou') {
      return {
        status: 'unavailable',
        explanation: '校際、北聯大與聯盟線上課程未提供可可靠比對的海大退選資料。',
      }
    }
    const semester = normalizeSemester(course.semester)
    if (!semester) return { status: 'unavailable', explanation: '無法辨識這門課的學期。' }
    const offlineCatalog = await getOfflineCatalog()
    throwIfAborted(signal)
    if (offlineCatalog?.semesters.includes(semester)) {
      const enrollment = await resolveCourseCodeEnrollment(course, semester, signal)
      if (!enrollment) {
        return {
          status: 'unavailable',
          explanation: '離線資料無法確認這個課號所有班別的人數，因此不顯示可能失真的退選率。',
        }
      }
      const result = offlineWithdrawalSemester(offlineCatalog, semester)
      if (!result || !result.querySucceeded || result.status !== 'success') {
        return {
          status: 'unavailable',
          explanation: '此學期沒有可用的官方退選資料。',
        }
      }
      const lookup = lookupMidtermWithdrawal(result, {
        semester,
        courseCode: course.code,
        courseTitle: course.title,
        instructor: course.teacher,
      })
      const estimate = estimateMidtermWithdrawalRate(lookup, enrollment.enrollment)
      if (estimate.status === 'unavailable') {
        return {
          status: 'unavailable',
          explanation: '這門課沒有可可靠對應的官方退選資料。',
        }
      }
      return {
        status: 'estimated',
        midtermWithdrawalCount: estimate.withdrawnCount,
        initialEnrollment: estimate.estimatedEnrollmentBeforeMidtermWithdrawal,
        finalEnrollment: estimate.finalOrCurrentEnrollmentCount,
        ratePercent: estimate.ratePercent,
        explanation: enrollment.sectionCount > 1
          ? `同課號 ${enrollment.sectionCount} 班合計${enrollment.includesOtherInstructor ? '，包含其他授課教師' : ''}。`
          : '依官方退選資料與單班人數計算。',
      }
    }
    if (!allowNetworkCatalogFallback) {
      return {
        status: 'unavailable',
        explanation: '這個學期未包含在 App 的離線退選資料中。',
      }
    }
    return serialized(async () => {
      try {
      const enrollment = await resolveCourseCodeEnrollment(course, semester, signal)
      if (!enrollment) {
        return {
          status: 'unavailable',
          explanation: '官方公開退選資料只到課號層級，且無法確認這個課號所有班別的人數，因此不顯示可能失真的比例。',
        }
      }
      const result = await loadWithdrawalSemester(semester, signal)
      const lookup = lookupMidtermWithdrawal(result, {
        semester,
        courseCode: course.code,
        courseTitle: course.title,
        instructor: course.teacher,
      })
      const estimate = estimateMidtermWithdrawalRate(lookup, enrollment.enrollment)
      if (estimate.status === 'unavailable') {
        const explanations: Record<string, string> = {
          invalid_semester: '官方退選頁未提供這個學期。',
          query_not_confirmed: '官方退選頁暫時無法確認查詢結果。',
          insufficient_course_identity: '課號或教師資料不足，無法可靠比對。',
          ambiguous_fallback: '有多筆相似課程，為避免誤判而不顯示退選率。',
          invalid_withdrawal_count: '官方退選筆數格式無法可靠辨識。',
          missing_final_or_current_enrollment: '官方課程資料未提供可用的課程人數。',
          empty_denominator: '課程人數為零，無法計算比例。',
        }
        return { status: 'unavailable', explanation: explanations[estimate.reason] }
      }
      return {
        status: 'estimated',
        midtermWithdrawalCount: estimate.withdrawnCount,
        initialEnrollment: estimate.estimatedEnrollmentBeforeMidtermWithdrawal,
        finalEnrollment: estimate.finalOrCurrentEnrollmentCount,
        ratePercent: estimate.ratePercent,
        explanation: enrollment.sectionCount > 1
          ? `同課號 ${enrollment.sectionCount} 班合計${enrollment.includesOtherInstructor ? '，包含其他授課教師' : ''}。`
          : '依官方退選資料與單班人數計算。',
      }
      } catch (error) {
        if (signal?.aborted) throw error
        return {
          status: 'unavailable',
          explanation: error instanceof Error && /semester is unavailable/i.test(error.message)
            ? '官方退選頁沒有提供這個學期的資料。'
            : '官方退選頁目前無法讀取，未以 0% 代替。',
        }
      }
    })
  }

  return { searchCourses, getCourseDetail, getWithdrawalEstimate }
}
