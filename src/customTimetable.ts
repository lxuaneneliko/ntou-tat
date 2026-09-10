import type { TimetableSlot } from './types'

export type CustomCourseSchedule = {
  day: number
  periods: number[]
}

export const customCoursePeriods = [
  { value: 0, time: '06:20', endsAt: '08:10' },
  { value: 1, time: '08:20', endsAt: '09:10' },
  { value: 2, time: '09:20', endsAt: '10:10' },
  { value: 3, time: '10:20', endsAt: '11:10' },
  { value: 4, time: '11:15', endsAt: '12:05' },
  { value: 5, time: '12:10', endsAt: '13:00' },
  { value: 6, time: '13:10', endsAt: '14:00' },
  { value: 7, time: '14:10', endsAt: '15:00' },
  { value: 8, time: '15:10', endsAt: '16:00' },
  { value: 9, time: '16:05', endsAt: '16:55' },
  { value: 10, time: '17:30', endsAt: '18:20' },
  { value: 11, time: '18:30', endsAt: '19:20' },
  { value: 12, time: '19:20', endsAt: '20:10' },
  { value: 13, time: '20:20', endsAt: '21:10' },
  { value: 14, time: '21:10', endsAt: '22:00' },
]

const customCourseColors = ['#176db9', '#0a8f68', '#7c3aed', '#c45616', '#d81b4e']

export const createCustomCourseSlots = (
  details: { name: string; code: string; teacher: string; room: string },
  schedules: CustomCourseSchedule[],
  courseId: string,
): TimetableSlot[] => {
  const courseTitle = details.name.trim()
  const identity = courseId.trim()
  if (!courseTitle) throw new Error('請輸入課程名稱')
  if (!identity) throw new Error('找不到自訂課程識別碼')
  if (!schedules.length) throw new Error('請新增至少一組上課時段')

  const selected = new Map<string, { day: number; period: typeof customCoursePeriods[number] }>()
  for (const schedule of schedules) {
    if (!Number.isInteger(schedule.day) || schedule.day < 1 || schedule.day > 7) {
      throw new Error('請選擇有效的上課星期')
    }
    if (!schedule.periods.length) throw new Error('每組上課時段都需要選擇至少一個節次')
    for (const value of schedule.periods) {
      const period = customCoursePeriods.find((item) => item.value === value)
      if (!period) throw new Error('請選擇有效的上課節次')
      selected.set(`${schedule.day}-${value}`, { day: schedule.day, period })
    }
  }

  const colorIndex = Array.from(identity).reduce(
    (index, character) => (index + character.charCodeAt(0)) % customCourseColors.length,
    0,
  )

  return [...selected.values()]
    .sort((left, right) => left.day - right.day || left.period.value - right.period.value)
    .map(({ day, period }) => ({
      id: `${identity}-${day}-${period.value}`,
      courseId: identity,
      courseCode: details.code.trim() || 'CUSTOM',
      courseTitle,
      instructor: details.teacher.trim(),
      classroom: details.room.trim(),
      day,
      startsAt: period.time,
      endsAt: period.endsAt,
      section: String(period.value),
      credits: 2,
      color: customCourseColors[colorIndex],
    }))
}

export const mergeTimetableSlots = (
  presets: readonly TimetableSlot[],
  customs: readonly TimetableSlot[],
  deletedKeys: readonly string[],
): TimetableSlot[] => {
  const deleted = new Set(deletedKeys)
  return [
    ...presets.filter((slot) => !deleted.has(`${slot.day}_${slot.section}_${slot.courseTitle}`)),
    ...customs,
  ]
}

export const removeCustomCourse = (slots: readonly TimetableSlot[], courseId: string): TimetableSlot[] =>
  slots.filter((slot) => slot.courseId !== courseId)
