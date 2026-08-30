import type { Semester } from './types'

const SEMESTER_HISTORY_COUNT = 12
const PRIOR_DEGREE_YEARS = 4

export const isSummerSemesterId = (semesterId: string) => /-(?:3|4)$/u.test(semesterId)

export const semesterDisplayLabel = (semesterId: string) => {
  const match = semesterId.match(/^(\d{2,3})-([1-4])$/u)
  if (!match) return semesterId
  if (match[2] === '3') return `${match[1]}-暑一`
  if (match[2] === '4') return `${match[1]}-暑二`
  return semesterId
}

const semesterRank = (semesterId: string) => {
  const match = semesterId.match(/^(\d{2,3})-([1-4])$/u)
  return match ? Number(match[1]) * 4 + Number(match[2]) - 1 : 0
}

export const currentSemesters = (now = new Date()): Semester[] => {
  const rocYear = now.getFullYear() - 1911
  const month = now.getMonth()
  const currentYear = month >= 5 ? rocYear : rocYear - 1
  const currentSemester = month >= 5 || month === 0 ? 1 : 2
  const semesters: Semester[] = []
  let year = currentYear
  let semester = currentSemester

  for (let index = 0; index < SEMESTER_HISTORY_COUNT; index += 1) {
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

  const newestAcademicYear = Number(semesters[0]?.id.split('-')[0])
  const completedAcademicYears = new Set(
    semesters
      .map(({ id }) => Number(id.split('-')[0]))
      .filter((year) => Number.isFinite(year) && year < newestAcademicYear),
  )

  completedAcademicYears.forEach((academicYear) => {
    semesters.push(
      { id: `${academicYear}-3`, title: `${academicYear} 學年度暑修第一期`, current: false },
      { id: `${academicYear}-4`, title: `${academicYear} 學年度暑修第二期`, current: false },
    )
  })

  return semesters.sort((left, right) => semesterRank(right.id) - semesterRank(left.id))
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

export const isGraduateStudentId = (studentId: string) => {
  const normalized = studentId.trim()
  if (!/^\d{8}$/.test(normalized)) return false
  const prefix = Number(normalized.slice(0, 3))
  return prefix >= 90 && prefix <= 199
}

export const semestersForStudent = (semesters: Semester[], studentId: string) => {
  const admissionYear = admissionYearFromStudentId(studentId)
  if (admissionYear === null) return semesters

  const firstVisibleYear = isGraduateStudentId(studentId)
    ? admissionYear - PRIOR_DEGREE_YEARS
    : admissionYear

  const available = semesters.filter((semester) => {
    const academicYear = Number(semester.id.split('-')[0])
    return Number.isFinite(academicYear) && academicYear >= firstVisibleYear
  })
  return available.length ? available : semesters
}
