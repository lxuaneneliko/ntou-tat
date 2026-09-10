// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courseNoteKey, notesForDay, readCourseNotes, timetableDay, writeCourseNote } from './courseNoteStorage'
import type { TimetableSlot } from '../types'

const slot = (overrides: Partial<TimetableSlot> = {}): TimetableSlot => ({
  id: 'ai-1-3',
  courseId: 'B57001',
  courseCode: 'B57001',
  courseTitle: '人工智慧',
  instructor: '王老師',
  classroom: 'INS203',
  day: 1,
  startsAt: '10:20',
  endsAt: '11:10',
  section: '3',
  credits: 3,
  color: '#176db9',
  ...overrides,
})

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

describe('course note storage', () => {
  it('isolates notes by student, semester and course', () => {
    expect(courseNoteKey(' 01472014 ', '115-1', slot())).toBe('01472014::115-1::B57001')
    expect(courseNoteKey('01472015', '115-1', slot())).not.toBe(courseNoteKey('01472014', '115-1', slot()))
    expect(courseNoteKey('01472014', '114-2', slot())).not.toBe(courseNoteKey('01472014', '115-1', slot()))
  })

  it('persists non-empty notes and removes blank notes', () => {
    const key = courseNoteKey('01472014', '115-1', slot())
    const saved = writeCourseNote({}, key, '  記得帶課本  ')
    expect(readCourseNotes()).toEqual({ [key]: '記得帶課本' })
    expect(writeCourseNote(saved, key, '   ')).toEqual({})
    expect(readCourseNotes()).toEqual({})
  })

  it('uses 7 for Sunday to match timetable slot weekdays', () => {
    expect(timetableDay(new Date('2026-09-13T12:00:00+08:00'))).toBe(7)
  })

  it('shows only distinct non-empty notes for the selected day in time order', () => {
    const secondCourse = slot({ courseId: 'ME1002', courseCode: 'ME1002', courseTitle: '工程數學', startsAt: '08:20' })
    const repeat = slot({ startsAt: '11:15', section: '4' })
    const otherDay = slot({ courseId: 'FRI', courseCode: 'FRI', day: 5 })
    const notes = {
      [courseNoteKey('01472014', '115-1', slot())]: '帶課本',
      [courseNoteKey('01472014', '115-1', secondCourse)]: '交作業',
      [courseNoteKey('01472014', '115-1', otherDay)]: '不應顯示',
    }

    expect(notesForDay([slot(), secondCourse, repeat, otherDay], notes, '01472014', '115-1', 1)).toEqual([
      { courseId: 'ME1002', courseTitle: '工程數學', startsAt: '08:20', note: '交作業' },
      { courseId: 'B57001', courseTitle: '人工智慧', startsAt: '10:20', note: '帶課本' },
    ])
  })
})
