import { hasPassingResult } from './gpa'
import type { GraduationCourseRequirement, GraduationCurriculum } from './api/graduationRequirements'
import type { Grade } from './types'

export type GraduationRequirementStatus = 'complete' | 'missing' | 'review'

export type GraduationRequirementAudit = GraduationCourseRequirement & {
  status: GraduationRequirementStatus
  earnedCredits: number
  matchedGrades: Grade[]
}

export type GraduationAudit = {
  totalEarnedCredits: number
  totalRemainingCredits: number
  trackableRequiredCredits: number
  completedRequiredCredits: number
  missingRequiredCredits: number
  completeCourses: GraduationRequirementAudit[]
  missingCourses: GraduationRequirementAudit[]
  reviewRequirements: GraduationRequirementAudit[]
  requirements: GraduationRequirementAudit[]
}

const normalize = (value: string) => value
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/gu, '')
  .replace(/[（]/gu, '(')
  .replace(/[）]/gu, ')')
  .replace(/\s+/gu, '')
  .replace(/^\d{1,2}[-–—]/u, '')
  .toUpperCase()

const gradeCode = (grade: Grade) => normalize(grade.courseId)
const gradeTitle = (grade: Grade) => normalize(grade.courseTitle)

const isCompleted = (grade: Grade) => {
  if (hasPassingResult(grade.score, grade.letter)) return true
  return /^(?:抵免|已抵免|抵免通過|核准抵免)$/u.test(normalize(grade.letter ?? ''))
}

const dedupePassedGrades = (grades: Grade[]) => {
  const byCourse = new Map<string, Grade>()
  grades.filter(isCompleted).forEach((grade) => {
    const key = gradeCode(grade) || gradeTitle(grade)
    const current = byCourse.get(key)
    if (!current || grade.credits > current.credits) byCourse.set(key, grade)
  })
  return [...byCourse.values()]
}

const isExcludedFromGraduationCredits = (grade: Grade) =>
  /軍訓|體育/u.test(`${grade.category}${grade.courseTitle}`)

const matchesRequirement = (grade: Grade, requirement: GraduationCourseRequirement) => {
  const code = gradeCode(grade)
  if (code && requirement.codes.some((candidate) => normalize(candidate) === code)) return true
  const title = gradeTitle(grade)
  const requiredTitle = normalize(requirement.title)
  if (!title || !requiredTitle) return false
  return title === requiredTitle || title.replace(/[一二三四五六七八九十IVX]+$/u, '') === requiredTitle
}

const auditRequirement = (
  requirement: GraduationCourseRequirement,
  grades: Grade[],
): GraduationRequirementAudit => {
  const matchedGrades = grades.filter((grade) => matchesRequirement(grade, requirement))
  const earnedCredits = Math.min(
    requirement.credits,
    matchedGrades.reduce((total, grade) => total + Math.max(0, grade.credits), 0),
  )
  const canDetermine = requirement.kind === 'course'
  const status: GraduationRequirementStatus = canDetermine
    ? earnedCredits >= requirement.credits
      ? 'complete'
      : 'missing'
    : 'review'
  return { ...requirement, status, earnedCredits, matchedGrades }
}

export const analyzeGraduationAudit = (
  curriculum: GraduationCurriculum,
  grades: Grade[],
): GraduationAudit => {
  const completedGrades = dedupePassedGrades(grades)
  const totalEarnedCredits = completedGrades
    .filter((grade) => !isExcludedFromGraduationCredits(grade))
    .reduce((total, grade) => total + Math.max(0, grade.credits), 0)
  const requirements = curriculum.requirements.map((requirement) =>
    auditRequirement(requirement, completedGrades),
  )
  const trackable = requirements.filter((requirement) => requirement.kind === 'course')
  const trackableRequiredCredits = trackable.reduce((total, requirement) => total + requirement.credits, 0)
  const completedRequiredCredits = trackable.reduce((total, requirement) => total + requirement.earnedCredits, 0)

  return {
    totalEarnedCredits,
    totalRemainingCredits: Math.max(0, curriculum.graduationMinimumCredits - totalEarnedCredits),
    trackableRequiredCredits,
    completedRequiredCredits,
    missingRequiredCredits: Math.max(0, trackableRequiredCredits - completedRequiredCredits),
    completeCourses: requirements.filter((requirement) => requirement.status === 'complete'),
    missingCourses: requirements.filter((requirement) => requirement.status === 'missing'),
    reviewRequirements: requirements.filter((requirement) =>
      requirement.status === 'review' && requirement.kind === 'threshold',
    ),
    requirements,
  }
}
