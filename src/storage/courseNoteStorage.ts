import type { TimetableSlot } from '../types'

const STORAGE_KEY = 'ntou_course_notes_v1'
export const COURSE_NOTE_MAX_LENGTH = 500

export type CourseNoteStore = Record<string, string>

const normalizedIdentityPart = (value: string) => value.trim().toUpperCase()

export const courseNoteKey = (
  studentId: string,
  semesterId: string,
  course: Pick<TimetableSlot, 'courseId' | 'courseCode'>,
) => [
  normalizedIdentityPart(studentId),
  semesterId.trim(),
  normalizedIdentityPart(course.courseId || course.courseCode),
].join('::')

export const readCourseNotes = (): CourseNoteStore => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return {}
    const parsed = JSON.parse(stored) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
        .map(([key, note]) => [key, note.trim().slice(0, COURSE_NOTE_MAX_LENGTH)])
        .filter(([, note]) => Boolean(note)),
    )
  } catch {
    return {}
  }
}

export const writeCourseNote = (
  store: CourseNoteStore,
  key: string,
  note: string,
): CourseNoteStore => {
  const next = { ...store }
  const normalized = note.trim().slice(0, COURSE_NOTE_MAX_LENGTH)
  if (normalized) next[key] = normalized
  else delete next[key]

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Keep the in-memory value usable when browser storage is unavailable.
  }
  return next
}

export type TodayCourseNote = {
  courseId: string
  courseTitle: string
  startsAt: string
  note: string
}

export const timetableDay = (date: Date) => date.getDay() || 7

export const notesForDay = (
  slots: TimetableSlot[],
  notes: CourseNoteStore,
  studentId: string,
  semesterId: string,
  day: number,
): TodayCourseNote[] => {
  const seen = new Set<string>()
  return [...slots]
    .filter((slot) => slot.day === day)
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
    .flatMap((slot) => {
      if (seen.has(slot.courseId)) return []
      seen.add(slot.courseId)
      const note = notes[courseNoteKey(studentId, semesterId, slot)]?.trim()
      if (!note) return []
      return [{
        courseId: slot.courseId,
        courseTitle: slot.courseTitle,
        startsAt: slot.startsAt,
        note,
      }]
    })
}
