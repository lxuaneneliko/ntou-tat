import { describe, expect, it } from 'vitest'
import {
  createCustomCourseSlots,
  mergeTimetableSlots,
  removeCustomCourse,
} from './customTimetable'
import { decodeTimetableShare, encodeTimetableShare } from './timetableShare'

const details = {
  name: '  工程數學  ',
  code: '  ME123  ',
  teacher: '  王老師  ',
  room: '  MEB429  ',
}

describe('multi-day custom timetable courses', () => {
  it('saves Monday one period and Friday two periods as one course with shared metadata', () => {
    const slots = createCustomCourseSlots(details, [
      { day: 5, periods: [4, 3] },
      { day: 1, periods: [2] },
    ], 'custom-math')

    expect(slots.map(({ day, section }) => [day, section])).toEqual([
      [1, '2'], [5, '3'], [5, '4'],
    ])
    expect(new Set(slots.map((slot) => slot.id)).size).toBe(3)
    expect(new Set(slots.map((slot) => slot.color)).size).toBe(1)
    for (const slot of slots) {
      expect(slot).toMatchObject({
        courseId: 'custom-math',
        courseCode: 'ME123',
        courseTitle: '工程數學',
        instructor: '王老師',
        classroom: 'MEB429',
        credits: 2,
      })
    }
    expect(slots[0]).toMatchObject({ startsAt: '09:20', endsAt: '10:10' })
  })

  it('deduplicates overlapping groups without filling gaps or conflating weekdays', () => {
    const slots = createCustomCourseSlots(details, [
      { day: 5, periods: [6, 2, 2] },
      { day: 1, periods: [2] },
      { day: 5, periods: [2, 8] },
    ], 'custom-disjoint')

    expect(slots.map(({ day, section }) => [day, section])).toEqual([
      [1, '2'], [5, '2'], [5, '6'], [5, '8'],
    ])
    expect(new Set(slots.map((slot) => slot.id)).size).toBe(4)
  })

  it('keeps weekend and A-D evening times exact', () => {
    const slots = createCustomCourseSlots({ ...details, code: ' ' }, [
      { day: 6, periods: [11, 12] },
      { day: 7, periods: [13, 14] },
    ], 'custom-night')

    expect(slots.map(({ day, startsAt, endsAt }) => [day, startsAt, endsAt])).toEqual([
      [6, '18:30', '19:20'],
      [6, '19:20', '20:10'],
      [7, '20:20', '21:10'],
      [7, '21:10', '22:00'],
    ])
    expect(slots.every((slot) => slot.courseCode === 'CUSTOM')).toBe(true)
  })

  it.each([
    [],
    [{ day: 1, periods: [] }],
    [{ day: 1, periods: [2] }, { day: 5, periods: [] }],
    [{ day: 0, periods: [2] }],
    [{ day: 8, periods: [2] }],
    [{ day: 1.5, periods: [2] }],
    [{ day: 1, periods: [-1] }],
    [{ day: 1, periods: [15] }],
    [{ day: 1, periods: [1.5] }],
  ])('rejects invalid or incomplete groups (%j)', (...groups) => {
    expect(() => createCustomCourseSlots(details, groups, 'custom-invalid')).toThrow()
  })

  it('deletes the entire multi-day identity and allows readding its title despite legacy tombstones', () => {
    const schedules = [{ day: 1, periods: [2] }, { day: 5, periods: [3, 4] }]
    const original = createCustomCourseSlots(details, schedules, 'custom-original')
    const unrelated = createCustomCourseSlots(details, [{ day: 2, periods: [3] }], 'custom-another')
    const remaining = removeCustomCourse([...original, ...unrelated], 'custom-original')
    expect(remaining).toEqual(unrelated)

    const readded = createCustomCourseSlots(details, schedules, 'custom-readded')
    const preset = { ...original[0], id: 'ais-slot', courseId: 'ais-course' }
    const deletedKeys = original.map((slot) => `${slot.day}_${slot.section}_${slot.courseTitle}`)
    const merged = mergeTimetableSlots([preset], [...remaining, ...readded], deletedKeys)
    expect(merged).toEqual([...unrelated, ...readded])
    expect(merged).not.toContainEqual(preset)
  })

  it('preserves all days, periods, and shared course identity through QR sharing', () => {
    const slots = createCustomCourseSlots(details, [
      { day: 1, periods: [2] },
      { day: 5, periods: [3, 4] },
    ], 'custom-share')
    const decoded = decodeTimetableShare(encodeTimetableShare({
      ownerName: '同學的課表',
      semesterId: '115-1',
      sourceId: 'anonymous-test-device',
      slots,
    })).slots

    expect(decoded.map(({ day, section, startsAt, endsAt }) => ({ day, section, startsAt, endsAt })))
      .toEqual(slots.map(({ day, section, startsAt, endsAt }) => ({ day, section, startsAt, endsAt })))
    expect(new Set(decoded.map((slot) => slot.courseId)).size).toBe(1)
    expect(new Set(decoded.map((slot) => slot.id)).size).toBe(3)
    expect(decoded.every((slot) => slot.courseTitle === '工程數學' && slot.instructor === '王老師')).toBe(true)
  })
})
