import { describe, expect, it } from 'vitest'
import { admissionYearFromStudentId, currentSemesters, semestersForStudent } from './semester'

const semesters = ['115-1', '114-2', '114-1', '113-2'].map((id, index) => ({
  id,
  title: id,
  current: index === 0,
}))

describe('student semester range', () => {
  it('builds the current semester list for the PWA local mode', () => {
    expect(currentSemesters(new Date(2026, 7, 23)).map(({ id }) => id)).toEqual([
      '115-1',
      '114-2',
      '114-1',
      '113-2',
    ])
  })

  it('reads a 114 admission year from an NTOU student id', () => {
    expect(admissionYearFromStudentId('01400000')).toBe(114)
  })

  it('does not show semesters before admission', () => {
    expect(semestersForStudent(semesters, '01400000').map(({ id }) => id)).toEqual([
      '115-1',
      '114-2',
      '114-1',
    ])
  })

  it('shows every semester from 113-1 onward for a 113 admission student', () => {
    const extendedSemesters = [
      '115-1',
      '114-2',
      '114-1',
      '113-2',
      '113-1',
      '112-2',
    ].map((id, index) => ({
      id,
      title: id,
      current: index === 0,
    }))

    expect(semestersForStudent(extendedSemesters, '01300000').map(({ id }) => id)).toEqual([
      '115-1',
      '114-2',
      '114-1',
      '113-2',
      '113-1',
    ])
  })

  it('keeps the server list when the id format is unknown', () => {
    expect(semestersForStudent(semesters, 'student').map(({ id }) => id)).toEqual(
      semesters.map(({ id }) => id),
    )
  })
})
