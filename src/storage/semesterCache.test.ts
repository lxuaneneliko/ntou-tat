import { describe, expect, it } from 'vitest'
import { emptyCredits } from '../api/publicData'
import type { Grade, TimetableResponse } from '../types'
import {
  markEmptyTimetableVerified,
  normalizeSemesterCacheEntry,
  shouldRecoverEmptyTimetable,
  withCachedGrades,
  withCachedTimetable,
  type SemesterCacheEntry,
} from './semesterCache'

const emptyEntry = (): SemesterCacheEntry => ({
  savedAt: '',
  timetable: { semesterId: '114-2', updatedAt: '', slots: [] },
  grades: [],
  credits: emptyCredits,
  timetableCached: false,
  gradesCached: false,
})

describe('semester cache', () => {
  it('refreshes empty legacy data once instead of treating a failed load as complete', () => {
    const legacy = normalizeSemesterCacheEntry({
      savedAt: '2026-08-01T00:00:00.000Z',
      timetable: { semesterId: '114-2', updatedAt: '', slots: [] },
      grades: [],
      credits: emptyCredits,
    })

    expect(legacy?.timetableCached).toBe(false)
    expect(legacy?.gradesCached).toBe(false)
  })

  it('preserves non-empty legacy timetable and grades as reusable cache', () => {
    const legacy = normalizeSemesterCacheEntry({
      savedAt: '2026-08-01T00:00:00.000Z',
      timetable: {
        semesterId: '114-2',
        updatedAt: '2026-08-01T00:00:00.000Z',
        slots: [{
          id: 'slot-1',
          courseId: 'CS101',
          courseCode: 'CS101',
          courseTitle: '資料結構',
          instructor: '王老師',
          classroom: 'INS101',
          day: 1,
          startsAt: '08:20',
          endsAt: '10:10',
          section: '1-2',
          credits: 3,
          color: '#53b7ff',
        }],
      },
      grades: [{
        id: 'CS101',
        courseId: 'CS101',
        courseTitle: '資料結構',
        semester: '114-2',
        credits: 3,
        score: 90,
        required: true,
        category: '專業必修',
      }],
      credits: emptyCredits,
    })

    expect(legacy?.timetableCached).toBe(true)
    expect(legacy?.gradesCached).toBe(true)
  })

  it('marks timetable and grades independently so partial progress can resume', () => {
    const timetable: TimetableResponse = {
      semesterId: '114-2',
      updatedAt: '2026-08-26T01:00:00.000Z',
      slots: [],
    }
    const afterTimetable = withCachedTimetable(
      emptyEntry(),
      timetable,
      '2026-08-26T01:00:00.000Z',
    )
    expect(afterTimetable.timetableCached).toBe(true)
    expect(afterTimetable.gradesCached).toBe(false)

    const grades: Grade[] = []
    const completed = withCachedGrades(
      afterTimetable,
      grades,
      emptyCredits,
      '2026-08-26T01:01:00.000Z',
    )
    expect(completed.timetableCached).toBe(true)
    expect(completed.gradesCached).toBe(true)
    expect(completed.timetableSavedAt).toBe('2026-08-26T01:00:00.000Z')
    expect(completed.gradesSavedAt).toBe('2026-08-26T01:01:00.000Z')
  })

  it('forces one recovery crawl when grades exist but the timetable is unexpectedly empty', () => {
    const entry = withCachedGrades(
      withCachedTimetable(emptyEntry(), {
        semesterId: '114-2',
        updatedAt: '2026-08-26T01:00:00.000Z',
        slots: [],
      }),
      [{
        id: 'CS101',
        courseId: 'CS101',
        courseTitle: '資料結構',
        semester: '114-2',
        credits: 3,
        score: 90,
        required: true,
        category: '專業必修',
      }],
      emptyCredits,
    )

    expect(shouldRecoverEmptyTimetable(entry)).toBe(true)
    const verified = markEmptyTimetableVerified(entry, '2026-08-26T01:02:00.000Z')
    expect(shouldRecoverEmptyTimetable(verified)).toBe(false)
    expect(verified.timetableEmptyVerifiedAt).toBe('2026-08-26T01:02:00.000Z')
  })
})
