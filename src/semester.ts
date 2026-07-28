import type { Semester } from './types'

export const admissionYearFromStudentId = (studentId: string) => {
  const normalized = studentId.trim()
  if (!/^\d{8}$/.test(normalized)) return null

  const prefix = Number(normalized.slice(0, 3))
  if (!Number.isFinite(prefix)) return null
  if (prefix <= 30) return prefix + 100
  if (prefix >= 90 && prefix <= 199) return prefix
  return null
}

export const semestersForStudent = (semesters: Semester[], studentId: string) => {
  const admissionYear = admissionYearFromStudentId(studentId)
  if (admissionYear === null) return semesters

  const available = semesters.filter((semester) => {
    const academicYear = Number(semester.id.split('-')[0])
    return Number.isFinite(academicYear) && academicYear >= admissionYear
  })
  return available.length ? available : semesters
}
