// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courseSyllabusCacheKey, readCourseSyllabusCache, writeCourseSyllabusCache } from './courseSyllabusStorage'
import type { CourseSyllabus } from '../types'

const syllabus: CourseSyllabus = {
  semesterId: '115-1', courseCode: 'ME1001', title: '工程數學', englishTitle: '',
  instructor: '王老師', department: '機械系', className: '機械一A', objectiveZh: '', objectiveEn: '',
  prerequisitesZh: '', prerequisitesEn: '', contentZh: '', contentEn: '', teachingMethodZh: '',
  teachingMethodEn: '', referencesZh: '', referencesEn: '', scheduleZh: '', scheduleEn: '',
  evaluationZh: '', evaluationEn: '', referenceUrl: '',
}

beforeEach(() => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
})

describe('course syllabus cache', () => {
  it('separates the same course code across semesters and classes', () => {
    const identity = { courseId: 'ME1001', courseCode: 'ME1001', courseTitle: '工程數學', instructor: '王老師', department: '機械系', className: '機械一A' }
    expect(courseSyllabusCacheKey('115-1', identity)).not.toBe(courseSyllabusCacheKey('114-2', identity))
    expect(courseSyllabusCacheKey('115-1', identity)).not.toBe(courseSyllabusCacheKey('115-1', { ...identity, className: '機械一B' }))
  })

  it('persists recent values and drops expired values', () => {
    const key = '115-1::ME1001'
    writeCourseSyllabusCache({}, key, syllabus, 1_000)
    expect(readCourseSyllabusCache(2_000)[key]?.syllabus.title).toBe('工程數學')
    expect(readCourseSyllabusCache(8 * 24 * 60 * 60 * 1000)).toEqual({})
  })
})
