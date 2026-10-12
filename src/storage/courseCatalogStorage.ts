import type {
  CourseCatalogDetail,
  CourseCatalogOffering,
  CourseCatalogQuery,
  CourseCatalogSearchResult,
} from '../api/courseCatalog'

const STORAGE_KEY = 'ntou_course_catalog_v1'

export const COURSE_SEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000
export const COURSE_DETAIL_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const COURSE_SEARCH_CACHE_LIMIT = 12
export const COURSE_DETAIL_CACHE_LIMIT = 60

export type CourseCatalogSearchCacheEntry = {
  key: string
  savedAt: number
  result: CourseCatalogSearchResult
}

export type CourseCatalogDetailCacheEntry = {
  key: string
  savedAt: number
  detail: CourseCatalogDetail
}

export type CourseCatalogCacheStore = {
  version: 1
  searches: CourseCatalogSearchCacheEntry[]
  details: CourseCatalogDetailCacheEntry[]
}

const emptyStore = (): CourseCatalogCacheStore => ({ version: 1, searches: [], details: [] })

const normalized = (value: string | undefined) => (value ?? '').trim().toLowerCase()

export const courseCatalogQueryKey = (query: CourseCatalogQuery) => JSON.stringify({
  academicYear: normalized(query.academicYear),
  semester: normalized(query.semester),
  semesterId: normalized(query.semesterId),
  courseCode: normalized(query.courseCode),
  courseTitle: normalized(query.courseTitle),
  keyword: normalized(query.keyword),
  instructor: normalized(query.instructor),
  instructorDepartment: normalized(query.instructorDepartment),
  department: normalized(query.department),
  degree: normalized(query.degree),
  grade: normalized(query.grade),
  className: normalized(query.className),
  source: query.source ?? 'all',
  match: query.match ?? 'fuzzy',
  mode: query.mode ?? '',
  page: Number.isFinite(query.page) ? Math.max(1, Math.trunc(query.page!)) : 1,
  pageSize: Number.isFinite(query.pageSize) ? Math.max(1, Math.trunc(query.pageSize!)) : 30,
})

export const courseCatalogDetailKey = (detail: Pick<CourseCatalogDetail, 'id' | 'pkno' | 'semesterId'>) =>
  `${normalized(detail.semesterId)}:${normalized(detail.id || detail.pkno)}`

const finiteOrNull = (value: unknown) => value === null || typeof value === 'number' && Number.isFinite(value)

const validOffering = (value: unknown): value is CourseCatalogOffering => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CourseCatalogOffering>
  return (
    typeof item.id === 'string' &&
    typeof item.pkno === 'string' &&
    typeof item.detailPostback === 'string' &&
    typeof item.semesterId === 'string' &&
    typeof item.courseCode === 'string' &&
    typeof item.title === 'string' &&
    typeof item.department === 'string' &&
    typeof item.className === 'string' &&
    typeof item.instructor === 'string' &&
    typeof item.instructorDepartment === 'string' &&
    finiteOrNull(item.credits) &&
    typeof item.requirement === 'string' &&
    finiteOrNull(item.enrolledCount) &&
    finiteOrNull(item.maximumStudents) &&
    finiteOrNull(item.minimumStudents) &&
    (item.internship === null || typeof item.internship === 'boolean') &&
    finiteOrNull(item.hours) &&
    (item.crossListed === null || typeof item.crossListed === 'boolean') &&
    typeof item.term === 'string' &&
    (item.source === 'ntou' || item.source === 'intercollegiate') &&
    typeof item.detailUrl === 'string'
  )
}

const validSearchResult = (value: unknown): value is CourseCatalogSearchResult => {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<CourseCatalogSearchResult>
  return (
    Array.isArray(result.items) &&
    result.items.every(validOffering) &&
    typeof result.page === 'number' && Number.isFinite(result.page) &&
    typeof result.pageSize === 'number' && Number.isFinite(result.pageSize) &&
    typeof result.totalPages === 'number' && Number.isFinite(result.totalPages) &&
    typeof result.totalItems === 'number' && Number.isFinite(result.totalItems)
  )
}

const detailStringFields: Array<keyof CourseCatalogDetail> = [
  'englishTitle',
  'deliveryMode',
  'audience',
  'mainField',
  'subField',
  'coInstructors',
  'coreCompetencies',
  'characteristicField',
  'notes',
  'objectiveZh',
  'objectiveEn',
  'prerequisitesZh',
  'prerequisitesEn',
  'contentZh',
  'contentEn',
  'teachingMethodZh',
  'teachingMethodEn',
  'referencesZh',
  'referencesEn',
  'scheduleZh',
  'scheduleEn',
  'evaluationZh',
  'evaluationEn',
  'sustainableDevelopmentGoals',
  'referenceUrl',
  'downloadUrl',
]

const validDetail = (value: unknown): value is CourseCatalogDetail => {
  if (!validOffering(value)) return false
  const detail = value as Partial<CourseCatalogDetail>
  return (
    (detail.allEnglish === null || typeof detail.allEnglish === 'boolean') &&
    Array.isArray(detail.meetingTimes) && detail.meetingTimes.every((item) => typeof item === 'string') &&
    Array.isArray(detail.classrooms) && detail.classrooms.every((item) => typeof item === 'string') &&
    detailStringFields.every((field) => typeof detail[field] === 'string')
  )
}

const validSavedAt = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0

const newestFirst = <T extends { savedAt: number }>(items: T[]) => [...items]
  .sort((left, right) => right.savedAt - left.savedAt)

export const parseCourseCatalogCacheStore = (
  value: string | null,
  now = Date.now(),
): CourseCatalogCacheStore => {
  if (!value) return emptyStore()
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return emptyStore()
    const candidate = parsed as Partial<CourseCatalogCacheStore>
    const searches = Array.isArray(candidate.searches)
      ? candidate.searches.filter((entry): entry is CourseCatalogSearchCacheEntry => (
        Boolean(entry) &&
        typeof entry.key === 'string' &&
        validSavedAt(entry.savedAt) &&
        now - entry.savedAt <= COURSE_SEARCH_CACHE_TTL_MS &&
        validSearchResult(entry.result)
      ))
      : []
    const details = Array.isArray(candidate.details)
      ? candidate.details.filter((entry): entry is CourseCatalogDetailCacheEntry => (
        Boolean(entry) &&
        typeof entry.key === 'string' &&
        validSavedAt(entry.savedAt) &&
        now - entry.savedAt <= COURSE_DETAIL_CACHE_TTL_MS &&
        validDetail(entry.detail)
      ))
      : []

    return {
      version: 1,
      searches: newestFirst(searches).slice(0, COURSE_SEARCH_CACHE_LIMIT),
      details: newestFirst(details).slice(0, COURSE_DETAIL_CACHE_LIMIT),
    }
  } catch {
    return emptyStore()
  }
}

export const withCourseCatalogSearch = (
  store: CourseCatalogCacheStore,
  query: CourseCatalogQuery,
  result: CourseCatalogSearchResult,
  savedAt = Date.now(),
): CourseCatalogCacheStore => {
  const key = courseCatalogQueryKey(query)
  return {
    version: 1,
    searches: newestFirst([
      { key, savedAt, result },
      ...store.searches.filter((entry) => entry.key !== key),
    ]).slice(0, COURSE_SEARCH_CACHE_LIMIT),
    details: store.details,
  }
}

export const withCourseCatalogDetail = (
  store: CourseCatalogCacheStore,
  detail: CourseCatalogDetail,
  savedAt = Date.now(),
): CourseCatalogCacheStore => {
  const key = courseCatalogDetailKey(detail)
  return {
    version: 1,
    searches: store.searches,
    details: newestFirst([
      { key, savedAt, detail },
      ...store.details.filter((entry) => entry.key !== key),
    ]).slice(0, COURSE_DETAIL_CACHE_LIMIT),
  }
}

const availableStorage = () => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export const readCourseCatalogCacheStore = (now = Date.now()) => {
  const storage = availableStorage()
  if (!storage) return emptyStore()
  try {
    return parseCourseCatalogCacheStore(storage.getItem(STORAGE_KEY), now)
  } catch {
    return emptyStore()
  }
}

export const writeCourseCatalogCacheStore = (store: CourseCatalogCacheStore) => {
  const storage = availableStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Keep the in-memory result usable when storage quota is unavailable.
  }
}

export const readCachedCourseCatalogSearch = (
  query: CourseCatalogQuery,
  now = Date.now(),
) => readCourseCatalogCacheStore(now).searches
  .find((entry) => entry.key === courseCatalogQueryKey(query))?.result ?? null

export const readCachedCourseCatalogDetail = (
  identity: Pick<CourseCatalogDetail, 'id' | 'pkno' | 'semesterId'>,
  now = Date.now(),
) => readCourseCatalogCacheStore(now).details
  .find((entry) => entry.key === courseCatalogDetailKey(identity))?.detail ?? null

export const cacheCourseCatalogSearch = (
  query: CourseCatalogQuery,
  result: CourseCatalogSearchResult,
  savedAt = Date.now(),
) => {
  const next = withCourseCatalogSearch(readCourseCatalogCacheStore(savedAt), query, result, savedAt)
  writeCourseCatalogCacheStore(next)
  return next
}

export const cacheCourseCatalogDetail = (
  detail: CourseCatalogDetail,
  savedAt = Date.now(),
) => {
  const next = withCourseCatalogDetail(readCourseCatalogCacheStore(savedAt), detail, savedAt)
  writeCourseCatalogCacheStore(next)
  return next
}

export const clearCourseCatalogCache = () => {
  const storage = availableStorage()
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing else needs to be cleared when local storage is unavailable.
  }
}
