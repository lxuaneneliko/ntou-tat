import type { TimetableSlot } from './types'
export const isoLocalDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
export const semesterWeek = (date: string, start: string) => Math.floor((new Date(date + 'T12:00:00').getTime() - new Date(start + 'T12:00:00').getTime()) / 604800000) + 1
export const classesForDate = (slots: TimetableSlot[], date: string) => {
  const day = new Date(date + 'T12:00:00').getDay() || 7
  // Merge adjacent period slots as one class block, while retaining separate morning/afternoon meetings.
  const grouped = new Map<string, TimetableSlot[]>()
  for (const slot of slots.filter((item) => item.day === day).sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const key = slot.courseId + '|' + slot.classroom
    const blocks = grouped.get(key) || []
    const previous = blocks.at(-1)
    const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
    if (previous && previous.courseId === slot.courseId && previous.classroom === slot.classroom && minutes(slot.startsAt) - minutes(previous.endsAt) <= 15) previous.endsAt = slot.endsAt > previous.endsAt ? slot.endsAt : previous.endsAt
    else blocks.push({ ...slot })
    grouped.set(key, blocks)
  }
  return [...grouped.values()].flat().sort((a, b) => a.startsAt.localeCompare(b.startsAt))
}
