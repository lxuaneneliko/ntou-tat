import {
  clearEncryptedPortalCache,
  readEncryptedPortalCache,
  writeEncryptedPortalCache,
} from '../api/portalHttp'
import type { CreditSummary, Grade, TimetableResponse } from '../types'

export type SemesterCacheEntry = {
  savedAt: string
  timetable: TimetableResponse
  grades: Grade[]
  credits: CreditSummary
  timetableCached: boolean
  gradesCached: boolean
  timetableSavedAt?: string
  gradesSavedAt?: string
  timetableEmptyVerifiedAt?: string
}

type StoredSemesterCacheEntry = Omit<
  SemesterCacheEntry,
  'timetableCached' | 'gradesCached'
> & {
  timetableCached?: boolean
  gradesCached?: boolean
}

const cacheKey = (studentId: string, semesterId: string) =>
  `ntou_tat_semester_v3_${studentId}_${semesterId}`

export const normalizeSemesterCacheEntry = (value: unknown): SemesterCacheEntry | null => {
  if (!value || typeof value !== 'object') return null
  const entry = value as Partial<StoredSemesterCacheEntry>
  const valid = (
    typeof entry.savedAt === 'string' &&
    Array.isArray(entry.grades) &&
    Array.isArray(entry.timetable?.slots) &&
    typeof entry.credits?.totalEarned === 'number'
  )
  if (!valid) return null

  return {
    ...(entry as StoredSemesterCacheEntry),
    // Older v3 entries did not record completion independently. Non-empty
    // data is safe to reuse; empty legacy data is refreshed once so a
    // previous network failure cannot become a permanent empty cache.
    timetableCached: entry.timetableCached ?? Boolean(entry.timetable?.slots.length),
    gradesCached: entry.gradesCached ?? Boolean(entry.grades?.length),
  }
}

export const withCachedTimetable = (
  existing: SemesterCacheEntry,
  timetable: TimetableResponse,
  savedAt = new Date().toISOString(),
): SemesterCacheEntry => ({
  ...existing,
  savedAt,
  timetable,
  timetableCached: true,
  timetableSavedAt: savedAt,
  timetableEmptyVerifiedAt: timetable.slots.length
    ? undefined
    : existing.timetableEmptyVerifiedAt,
})

export const withCachedGrades = (
  existing: SemesterCacheEntry,
  grades: Grade[],
  credits: CreditSummary,
  savedAt = new Date().toISOString(),
): SemesterCacheEntry => ({
  ...existing,
  savedAt,
  grades,
  credits,
  gradesCached: true,
  gradesSavedAt: savedAt,
})

export const shouldRecoverEmptyTimetable = (entry: SemesterCacheEntry) =>
  entry.timetableCached &&
  entry.timetable.slots.length === 0 &&
  entry.gradesCached &&
  entry.grades.length > 0 &&
  !entry.timetableEmptyVerifiedAt

export const semesterCacheProgress = (entry: SemesterCacheEntry) => {
  const timetableReady = entry.timetableCached && !shouldRecoverEmptyTimetable(entry)
  return (timetableReady ? 50 : 0) + (entry.gradesCached ? 50 : 0)
}

export const markEmptyTimetableVerified = (
  entry: SemesterCacheEntry,
  verifiedAt = new Date().toISOString(),
): SemesterCacheEntry => ({
  ...entry,
  savedAt: verifiedAt,
  timetableEmptyVerifiedAt: verifiedAt,
})

export const readSemesterCache = async (studentId: string, semesterId: string) => {
  const value = await readEncryptedPortalCache(cacheKey(studentId, semesterId))
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return normalizeSemesterCacheEntry(parsed)
  } catch {
    return null
  }
}

export const writeSemesterCache = async (
  studentId: string,
  semesterId: string,
  entry: SemesterCacheEntry,
) => {
  await writeEncryptedPortalCache(cacheKey(studentId, semesterId), JSON.stringify(entry))
}

export const clearSemesterCache = clearEncryptedPortalCache
