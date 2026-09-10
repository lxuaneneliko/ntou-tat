import { describe, expect, it } from 'vitest'
import type { CourseCatalogOffering } from './courseCatalog'
import { currentCourseSemesterId, selectSyllabusOffering } from './courseSyllabus'

const offering = (overrides: Partial<CourseCatalogOffering> = {}): CourseCatalogOffering => ({
  id: 'one', pkno: 'PK1', detailPostback: '', semesterId: '115-1', courseCode: 'ME1001',
  title: '工程數學', department: '機械與機電工程學系', className: '機械一A', instructor: '王老師',
  instructorDepartment: '', credits: 3, requirement: '必修', enrolledCount: 30,
  maximumStudents: 50, minimumStudents: 5, internship: false, hours: 3, crossListed: false,
  term: '', source: 'ntou', detailUrl: '',
  ...overrides,
})

describe('official course syllabus identity matching', () => {
  it('uses the Taipei academic semester boundary', () => {
    expect(currentCourseSemesterId(Date.parse('2026-09-11T00:00:00+08:00'))).toBe('115-1')
    expect(currentCourseSemesterId(Date.parse('2027-03-01T00:00:00+08:00'))).toBe('115-2')
  })

  it('selects by semester, code, class and teacher', () => {
    const expected = {
      courseId: 'ME1001', courseCode: 'ME1001', courseTitle: '工程數學',
      instructor: '王老師', department: '機械與機電工程學系', className: '機械一A',
    }
    expect(selectSyllabusOffering([
      offering(),
      offering({ id: 'other-class', pkno: 'PK2', className: '機械一B' }),
    ], '115-1', expected)?.pkno).toBe('PK1')
  })

  it('refuses to guess when an old cached timetable lacks class identity', () => {
    const expected = {
      courseId: 'ME1001', courseCode: 'ME1001', courseTitle: '工程數學',
      instructor: '王老師', department: '', className: '',
    }
    expect(selectSyllabusOffering([
      offering(),
      offering({ id: 'other-class', pkno: 'PK2', className: '機械一B' }),
    ], '115-1', expected)).toBeNull()
  })
})
