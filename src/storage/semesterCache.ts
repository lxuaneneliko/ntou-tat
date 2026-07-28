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
}

const cacheKey = (studentId: string, semesterId: string) =>
  `ntou_tat_semester_v3_${studentId}_${semesterId}`

const isCacheEntry = (value: unknown): value is SemesterCacheEntry => {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<SemesterCacheEntry>
  return (
    typeof entry.savedAt === 'string' &&
    Array.isArray(entry.grades) &&
    Array.isArray(entry.timetable?.slots) &&
    typeof entry.credits?.totalEarned === 'number'
  )
}

export const readSemesterCache = async (studentId: string, semesterId: string) => {
  const value = await readEncryptedPortalCache(cacheKey(studentId, semesterId))
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    return isCacheEntry(parsed) ? parsed : null
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
