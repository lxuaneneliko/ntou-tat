import { classesForDate, semesterWeek } from './calendarCourses'
import type { CalendarEvent, TimetableSlot } from './types'
export type CalendarItem = { id: string; title: string; time?: string; color: string; event?: CalendarEvent; course?: TimetableSlot }
export function calendarItemsForDate(events: CalendarEvent[], slots: TimetableSlot[], date: string, semesterStart: string): CalendarItem[] {
  const items: CalendarItem[] = events.filter((event) => date >= event.startsOn && date <= (event.endsOn || event.startsOn)).map((event) => ({ id: `event-${event.id}`, title: event.title, time: event.time, color: event.source === 'personal' ? '#8560bc' : '#167b4b', event }))
  const week = semesterWeek(date, semesterStart)
  if (week >= 1 && week <= 18) items.push(...classesForDate(slots, date).map((course) => ({ id: `course-${course.id}`, title: course.courseTitle, time: course.startsAt, color: course.color || '#8dcced', course })))
  return items.sort((a, b) => (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title, 'zh-TW'))
}
