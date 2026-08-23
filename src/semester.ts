import type { Semester } from './types'

export const currentSemesters = (now = new Date()): Semester[] => {
  const rocYear = now.getFullYear() - 1911
  const month = now.getMonth()
  const currentYear = month >= 5 ? rocYear : rocYear - 1
  const currentSemester = month >= 5 || month === 0 ? 1 : 2
  const semesters: Semester[] = []
  let year = currentYear
  let semester = currentSemester

  for (let index = 0; index < 4; index += 1) {
    semesters.push({
      id: `${year}-${semester}`,
      title: `${year}-${semester}`,
      current: index === 0,
    })
    if (semester === 1) {
      semester = 2
      year -= 1
    } else {
      semester = 1
    }
  }

  return semesters
}

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
