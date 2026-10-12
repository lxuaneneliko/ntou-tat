import { ungzip } from 'pako'
import type { CourseCatalogDetail, CourseCatalogOffering } from './api/courseCatalog'
import {
  MIDTERM_WITHDRAWAL_ESTIMATE_LABEL,
  type MidtermWithdrawalCourseAggregate,
  type MidtermWithdrawalParseResult,
} from './api/midtermWithdrawal'

// Keep the gzip payload under a non-.gz final suffix. Android's asset packager
// otherwise expands the archive and strips `.gz`, so the WebView path no longer
// matches even though the source asset exists.
export const OFFLINE_COURSE_CATALOG_ASSET = 'data/course-catalog-113plus.json.gz.bin'

export const OFFLINE_COURSE_CATALOG_SEMESTERS = [
  '115-1',
  '114-4',
  '114-3',
  '114-2',
  '114-1',
  '113-4',
  '113-3',
  '113-2',
  '113-1',
] as const

export const OFFLINE_COURSE_WITHDRAWAL_REQUIRED_SUCCESS_SEMESTERS = [
  '113-1',
  '113-2',
  '114-1',
  '114-2',
] as const

export type OfflineCourseDegree = '0' | '1' | '2' | '3'

export type OfflineCourseCatalogOffering = CourseCatalogOffering & {
  degree?: OfflineCourseDegree
  degrees?: OfflineCourseDegree[]
}

export type OfflineCourseDetailShardMetadata = {
  id: string
  path: string
  detailCount: number
  rawBytes?: number
  gzipBytes?: number
  rawSha256?: string
  gzipSha256?: string
}

export type OfflineCourseDetailShards = {
  algorithm: 'fnv1a32'
  shardCount: number
  shards: OfflineCourseDetailShardMetadata[]
}

export type OfflineCourseWithdrawalSemester = {
  querySucceeded: boolean
  status: 'success' | 'unavailable'
  courses: MidtermWithdrawalCourseAggregate[]
  ignoredRowCount: number
  reason?: 'invalid_semester' | 'query_not_confirmed'
}

export type OfflineCourseWithdrawals = {
  version: 1
  semesters: Record<string, OfflineCourseWithdrawalSemester>
}

export type OfflineCourseCatalog = {
  version: 1 | 2
  generatedAt: string
  /** Version 2 snapshots are published only after every requested crawl finishes. */
  complete?: boolean
  range?: {
    from: string
    to: string
  }
  semesters: string[]
  items: OfflineCourseCatalogOffering[]
  /** Full syllabi are separate gzip shards so searching does not inflate them all in RAM. */
  detailShards?: OfflineCourseDetailShards
  /** Anonymous course-level counts only; never contains student names or ids. */
  withdrawals?: OfflineCourseWithdrawals
}

export type OfflineCourseDetailShard = {
  version: 1
  shardId: string
  details: Record<string, CourseCatalogDetail>
}

export type OfflineCourseCatalogSummary = {
  generatedAt: string
  from: string
  to: string
  semesterCount: number
  itemCount: number
}

export const summarizeOfflineCourseCatalog = (
  catalog: OfflineCourseCatalog,
): OfflineCourseCatalogSummary => ({
  generatedAt: catalog.generatedAt,
  from: catalog.range?.from ?? catalog.semesters.at(-1) ?? '',
  to: catalog.range?.to ?? catalog.semesters[0] ?? '',
  semesterCount: catalog.semesters.length,
  itemCount: catalog.items.length,
})

const stringFields: Array<keyof CourseCatalogOffering> = [
  'id',
  'pkno',
  'detailPostback',
  'semesterId',
  'courseCode',
  'title',
  'department',
  'className',
  'instructor',
  'instructorDepartment',
  'requirement',
  'term',
  'detailUrl',
]

const nullableNumber = (value: unknown) => value === null || typeof value === 'number' && Number.isFinite(value)

const nullableBoolean = (value: unknown) => value === null || typeof value === 'boolean'

const validSemester = (value: unknown) => typeof value === 'string' && /^\d{3}-[1-4]$/.test(value)

const validOffering = (value: unknown): value is OfflineCourseCatalogOffering => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<OfflineCourseCatalogOffering>
  return (
    stringFields.every((field) => typeof item[field] === 'string')
    && validSemester(item.semesterId)
    && nullableNumber(item.credits)
    && nullableNumber(item.enrolledCount)
    && nullableNumber(item.maximumStudents)
    && nullableNumber(item.minimumStudents)
    && nullableNumber(item.hours)
    && nullableBoolean(item.internship)
    && nullableBoolean(item.crossListed)
    && (item.source === 'ntou' || item.source === 'intercollegiate')
    && (item.degree === undefined || ['0', '1', '2', '3'].includes(item.degree))
    && (item.degrees === undefined || (
      Array.isArray(item.degrees)
      && item.degrees.length > 0
      && item.degrees.every((degree) => ['0', '1', '2', '3'].includes(degree))
    ))
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
    nullableBoolean(detail.allEnglish)
    && (detail.masterDoctorCombined === undefined || nullableBoolean(detail.masterDoctorCombined))
    && Array.isArray(detail.meetingTimes)
    && detail.meetingTimes.every((item) => typeof item === 'string')
    && Array.isArray(detail.classrooms)
    && detail.classrooms.every((item) => typeof item === 'string')
    && detailStringFields.every((field) => typeof detail[field] === 'string')
  )
}

const normalizedIdentity = (value: string | undefined) => (value ?? '')
  .normalize('NFKC')
  .trim()
  .toLocaleLowerCase('zh-TW')

export const offlineCourseDetailKey = (
  identity: Pick<CourseCatalogOffering, 'semesterId' | 'id' | 'pkno'>,
) => `${normalizedIdentity(identity.semesterId)}:${normalizedIdentity(identity.id || identity.pkno)}`

export const fnv1a32Utf8 = (value: string) => {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(value)) {
    hash = Math.imul(hash ^ byte, 0x01000193) >>> 0
  }
  return hash
}

export const offlineCourseDetailShardId = (detailKey: string, shardCount: number) => (
  (fnv1a32Utf8(detailKey) % shardCount).toString(16).padStart(2, '0')
)

const safeAssetPath = (value: unknown): value is string => (
  typeof value === 'string'
  && value.startsWith('data/')
  && !value.startsWith('/')
  && !value.includes('..')
  && !value.includes('://')
  && /^[a-z0-9._/-]+$/i.test(value)
)

const validOptionalSize = (value: unknown) => value === undefined
  || typeof value === 'number' && Number.isInteger(value) && value >= 0

const validOptionalSha256 = (value: unknown) => value === undefined
  || typeof value === 'string' && /^[a-f\d]{64}$/i.test(value)

const validWithdrawalAggregate = (value: unknown): value is MidtermWithdrawalCourseAggregate => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const course = value as Partial<MidtermWithdrawalCourseAggregate>
  return (
    typeof course.key === 'string'
    && validSemester(course.semester)
    && (course.courseCode === null || typeof course.courseCode === 'string')
    && (course.courseTitle === null || typeof course.courseTitle === 'string')
    && (course.instructor === null || typeof course.instructor === 'string')
    && typeof course.withdrawnCount === 'number'
    && Number.isSafeInteger(course.withdrawnCount)
    && course.withdrawnCount > 0
    && (course.matchStrategy === 'semester_course_code'
      || course.matchStrategy === 'semester_course_title_instructor')
  )
}

const parseWithdrawals = (
  value: unknown,
  semesterSet: Set<string>,
): OfflineCourseWithdrawals | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const withdrawals = value as Partial<OfflineCourseWithdrawals>
  if (
    withdrawals.version !== 1
    || !withdrawals.semesters
    || typeof withdrawals.semesters !== 'object'
    || Array.isArray(withdrawals.semesters)
  ) return null
  const entries = Object.entries(withdrawals.semesters)
  if (entries.length !== semesterSet.size || !entries.every(([semester, result]) => (
    semesterSet.has(semester)
    && result
    && typeof result === 'object'
    && typeof result.querySucceeded === 'boolean'
    && (result.status === 'success' || result.status === 'unavailable')
    && Array.isArray(result.courses)
    && result.courses.every((course) => validWithdrawalAggregate(course) && course.semester === semester)
    && typeof result.ignoredRowCount === 'number'
    && Number.isSafeInteger(result.ignoredRowCount)
    && result.ignoredRowCount >= 0
    && (result.querySucceeded
      ? result.status === 'success' && result.reason === undefined
      : result.status === 'unavailable' && result.reason !== undefined)
    && (result.reason === undefined || result.reason === 'invalid_semester' || result.reason === 'query_not_confirmed')
  ))) return null
  return { version: 1, semesters: Object.fromEntries(entries) }
}

export const offlineWithdrawalSemester = (
  catalog: OfflineCourseCatalog,
  semester: string,
): MidtermWithdrawalParseResult | null => {
  const stored = catalog.withdrawals?.semesters[semester]
  if (!stored) return null
  return {
    label: MIDTERM_WITHDRAWAL_ESTIMATE_LABEL,
    semester,
    ...stored,
  }
}

const parseDetailShards = (
  value: unknown,
  expectedDetailCount: number,
): OfflineCourseDetailShards | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Partial<OfflineCourseDetailShards>
  if (
    candidate.algorithm !== 'fnv1a32'
    || typeof candidate.shardCount !== 'number'
    || !Number.isInteger(candidate.shardCount)
    || candidate.shardCount < 1
    || candidate.shardCount > 256
    || !Array.isArray(candidate.shards)
    || candidate.shards.length !== candidate.shardCount
  ) return null
  const ids = new Set<string>()
  let total = 0
  for (const shard of candidate.shards) {
    if (
      !shard
      || typeof shard !== 'object'
      || typeof shard.id !== 'string'
      || !/^[a-f\d]{2}$/i.test(shard.id)
      || ids.has(shard.id.toLowerCase())
      || !safeAssetPath(shard.path)
      || typeof shard.detailCount !== 'number'
      || !Number.isInteger(shard.detailCount)
      || shard.detailCount < 0
      || !validOptionalSize(shard.rawBytes)
      || !validOptionalSize(shard.gzipBytes)
      || !validOptionalSha256(shard.rawSha256)
      || !validOptionalSha256(shard.gzipSha256)
    ) return null
    ids.add(shard.id.toLowerCase())
    total += shard.detailCount
  }
  if (total !== expectedDetailCount) return null
  return {
    algorithm: 'fnv1a32',
    shardCount: candidate.shardCount,
    shards: candidate.shards.map((shard) => ({ ...shard, id: shard.id.toLowerCase() })),
  }
}

export const parseOfflineCourseCatalog = (value: string | unknown): OfflineCourseCatalog => {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  if (!parsed || typeof parsed !== 'object') throw new Error('離線課程資料格式錯誤')
  const catalog = parsed as Partial<OfflineCourseCatalog>
  if (
    catalog.version !== 1 && catalog.version !== 2
    || typeof catalog.generatedAt !== 'string'
    || !Array.isArray(catalog.semesters)
    || !catalog.semesters.every(validSemester)
    || !Array.isArray(catalog.items)
    || !catalog.items.every(validOffering)
  ) {
    throw new Error('離線課程資料格式錯誤')
  }
  const semesters = [...new Set(catalog.semesters)].sort((left, right) => right.localeCompare(left, 'zh-TW'))
  const semesterSet = new Set(semesters)
  if (catalog.items.some((item) => !semesterSet.has(item.semesterId))) {
    throw new Error('離線課程資料包含未標記完成的學期')
  }

  let detailShards: OfflineCourseDetailShards | undefined
  let withdrawals: OfflineCourseWithdrawals | undefined
  if (catalog.version === 2) {
    const expectedSemesters = new Set<string>(OFFLINE_COURSE_CATALOG_SEMESTERS)
    if (
      semesters.length !== expectedSemesters.size
      || semesters.some((semester) => !expectedSemesters.has(semester))
      || catalog.range?.from !== '113-1'
      || catalog.range?.to !== '115-1'
    ) throw new Error('離線課程學期範圍必須是 113-1～115-1')
    if (catalog.complete !== true) {
      throw new Error('離線課程詳細資料尚未完整建立')
    }
    detailShards = parseDetailShards(catalog.detailShards, catalog.items.length) ?? undefined
    if (!detailShards) {
      throw new Error('離線課程詳細資料不完整')
    }
    withdrawals = parseWithdrawals(catalog.withdrawals, semesterSet) ?? undefined
    if (!withdrawals) throw new Error('離線課程退選資料不完整或格式錯誤')
    if (OFFLINE_COURSE_WITHDRAWAL_REQUIRED_SUCCESS_SEMESTERS.some((semester) => {
      const result = withdrawals?.semesters[semester]
      return result?.querySucceeded !== true
        || result.status !== 'success'
        || result.ignoredRowCount !== 0
    })) throw new Error('離線課程退選資料不完整或格式錯誤')
  }
  return {
    version: catalog.version,
    generatedAt: catalog.generatedAt,
    ...(catalog.complete !== undefined ? { complete: catalog.complete } : {}),
    ...(catalog.range ? { range: catalog.range } : {}),
    semesters,
    items: catalog.items,
    ...(detailShards ? { detailShards } : {}),
    ...(withdrawals ? { withdrawals } : {}),
  }
}

const decodeAsset = (bytes: Uint8Array) => {
  const isGzip = bytes[0] === 0x1f && bytes[1] === 0x8b
  return isGzip ? ungzip(bytes, { toText: true }) : new TextDecoder().decode(bytes)
}

export const parseOfflineCourseCatalogAsset = (bytes: Uint8Array) => (
  parseOfflineCourseCatalog(decodeAsset(bytes))
)

export const parseOfflineCourseDetailShard = (
  value: string | unknown,
  expectedShardId: string,
  shardCount: number,
): OfflineCourseDetailShard => {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('離線課程課綱分片格式錯誤')
  }
  const shard = parsed as Partial<OfflineCourseDetailShard>
  const normalizedShardId = expectedShardId.toLowerCase()
  if (
    shard.version !== 1
    || normalizedIdentity(shard.shardId) !== normalizedShardId
    || !shard.details
    || typeof shard.details !== 'object'
    || Array.isArray(shard.details)
  ) throw new Error('離線課程課綱分片格式錯誤')
  const entries = Object.entries(shard.details)
  if (!entries.every(([key, detail]) => (
    Boolean(key)
    && validDetail(detail)
    && key === offlineCourseDetailKey(detail)
    && offlineCourseDetailShardId(key, shardCount) === normalizedShardId
  ))) throw new Error('離線課程課綱分片格式錯誤')
  return { version: 1, shardId: normalizedShardId, details: Object.fromEntries(entries) }
}

export const parseOfflineCourseDetailShardAsset = (
  bytes: Uint8Array,
  expectedShardId: string,
  shardCount: number,
) => parseOfflineCourseDetailShard(decodeAsset(bytes), expectedShardId, shardCount)

export type OfflineCourseAssetReader = (path: string) => Promise<Uint8Array | null>

const readBundledAsset: OfflineCourseAssetReader = async (path) => {
  const base = import.meta.env.BASE_URL || '/'
  const response = await fetch(`${base}${path}`)
  if (!response.ok) return null
  return new Uint8Array(await response.arrayBuffer())
}

/**
 * Creates a bounded-memory syllabus loader. Only a few decompressed shards are
 * retained, while concurrent taps on the same shard share one read/decode.
 */
export const createOfflineCourseDetailLoader = (
  readAsset: OfflineCourseAssetReader = readBundledAsset,
  maximumCachedShards = 3,
) => {
  const cache = new Map<string, OfflineCourseDetailShard>()
  const pending = new Map<string, Promise<OfflineCourseDetailShard | null>>()
  const cacheLimit = Math.max(1, Math.trunc(maximumCachedShards))

  const loadShard = async (
    metadata: OfflineCourseDetailShardMetadata,
    shardCount: number,
  ) => {
    const cached = cache.get(metadata.path)
    if (cached) {
      cache.delete(metadata.path)
      cache.set(metadata.path, cached)
      return cached
    }
    const inFlight = pending.get(metadata.path)
    if (inFlight) return inFlight
    const request = (async () => {
      const bytes = await readAsset(metadata.path)
      if (!bytes) return null
      const shard = parseOfflineCourseDetailShardAsset(bytes, metadata.id, shardCount)
      if (Object.keys(shard.details).length !== metadata.detailCount) {
        throw new Error('離線課程課綱分片筆數不符')
      }
      cache.set(metadata.path, shard)
      while (cache.size > cacheLimit) {
        const oldest = cache.keys().next().value as string | undefined
        if (!oldest) break
        cache.delete(oldest)
      }
      return shard
    })()
    pending.set(metadata.path, request)
    try {
      return await request
    } finally {
      pending.delete(metadata.path)
    }
  }

  return async (catalog: OfflineCourseCatalog, offering: CourseCatalogOffering) => {
    const descriptor = catalog.detailShards
    if (!descriptor) return null
    const detailKey = offlineCourseDetailKey(offering)
    const shardId = offlineCourseDetailShardId(detailKey, descriptor.shardCount)
    const metadata = descriptor.shards.find((shard) => shard.id === shardId)
    if (!metadata) return null
    const shard = await loadShard(metadata, descriptor.shardCount)
    return shard?.details[detailKey] ?? null
  }
}

export const loadBundledCourseDetail = createOfflineCourseDetailLoader()

let bundledCatalogPromise: Promise<OfflineCourseCatalog | null> | null = null

/**
 * Loads the bundled 113-1-and-newer snapshot. The asset lives inside the installed
 * app, so this does not contact AIS and does not consume the WebView storage
 * quota used by the smaller recent-query cache. Version 2 points to bounded,
 * lazily loaded syllabus shards, so opening a result also stays offline without
 * inflating every detailed syllabus into memory at startup.
 */
export const loadBundledCourseCatalog = () => {
  if (bundledCatalogPromise) return bundledCatalogPromise
  bundledCatalogPromise = (async () => {
    try {
      const base = import.meta.env.BASE_URL || '/'
      const response = await fetch(`${base}${OFFLINE_COURSE_CATALOG_ASSET}`)
      if (!response.ok) return null
      const bytes = new Uint8Array(await response.arrayBuffer())
      return parseOfflineCourseCatalogAsset(bytes)
    } catch {
      return null
    }
  })()
  return bundledCatalogPromise
}
