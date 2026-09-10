import type { CourseSyllabus } from '../types'
import type { SyllabusCourseIdentity } from '../api/courseSyllabus'

const STORAGE_KEY = 'ntou_course_syllabus_cache_v1'
const MAX_ENTRIES = 80
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type CourseSyllabusCacheEntry = {
  savedAt: number
  syllabus: CourseSyllabus
}

export type CourseSyllabusCache = Record<string, CourseSyllabusCacheEntry>

const normalized = (value: string | undefined) => (value ?? '')
  .normalize('NFKC')
  .trim()
  .toLocaleLowerCase('zh-TW')

export const courseSyllabusCacheKey = (
  semesterId: string,
  course: SyllabusCourseIdentity,
) => [
  normalized(semesterId),
  normalized(course.courseCode || course.courseId),
  normalized(course.className),
  normalized(course.instructor),
  normalized(course.department),
].join('::')

export const readCourseSyllabusCache = (now = Date.now()): CourseSyllabusCache => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, CourseSyllabusCacheEntry] => {
      const value = entry[1] as Partial<CourseSyllabusCacheEntry> | null
      return Boolean(
        value
        && Number.isFinite(value.savedAt)
        && now - Number(value.savedAt) <= MAX_AGE_MS
        && value.syllabus
        && typeof value.syllabus.courseCode === 'string',
      )
    }))
  } catch {
    return {}
  }
}

export const writeCourseSyllabusCache = (
  cache: CourseSyllabusCache,
  key: string,
  syllabus: CourseSyllabus,
  now = Date.now(),
) => {
  const entries = Object.entries({ ...cache, [key]: { savedAt: now, syllabus } })
    .sort((left, right) => right[1].savedAt - left[1].savedAt)
    .slice(0, MAX_ENTRIES)
  const next = Object.fromEntries(entries)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The sheet can still show the fetched value during this app session.
  }
  return next
}
