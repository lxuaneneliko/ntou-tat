import type { TimetableSlot } from './types'
export function restoreSemesterOverrides(courses: Record<string, TimetableSlot[]>, deleted: Record<string, string[]>, semester: string) {
  const nextCourses = { ...courses }; delete nextCourses[semester]
  const nextDeleted = { ...deleted }; delete nextDeleted[semester]
  return { courses: nextCourses, deleted: nextDeleted }
}
