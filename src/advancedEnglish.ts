import type { Grade } from './types'
import { hasPassingResult } from './gpa'
export type AdvancedEnglishStatus = 'unconfirmed' | 'course' | 'completed' | 'eligible' | 'approved-exemption'
// English-test approval grants credits through cohort 114; cohort 115 onward
// receives a course waiver only. Actual passed/transfer courses remain credits.
export const isNonCreditAdvancedEnglishExemption = (status: AdvancedEnglishStatus, cohortYear: number) =>
  status === 'approved-exemption' && cohortYear >= 115
export const advancedEnglishCreditAdjustment = (grades: Grade[], status: AdvancedEnglishStatus, required = 2, cohortYear = 114) => {
  if (status !== 'approved-exemption' && status !== 'completed') return 0
  if (isNonCreditAdvancedEnglishExemption(status, cohortYear)) return 0
  const recognized = new Map<string, number>()
  for (const grade of grades) if (/進階英文/u.test(grade.courseTitle + grade.category) && (hasPassingResult(grade.score, grade.letter) || /^(抵免|已抵免|抵免通過|核准抵免)$/u.test(grade.letter?.trim() || ''))) recognized.set(grade.courseId || grade.courseTitle, Math.max(grade.credits, recognized.get(grade.courseId || grade.courseTitle) || 0))
  return Math.max(0, Math.min(2, required) - [...recognized.values()].reduce((total, credits) => total + credits, 0))
}
export const readAdvancedEnglish = (key: string): AdvancedEnglishStatus => { try { const value = localStorage.getItem(key); return value === 'course' || value === 'completed' || value === 'eligible' || value === 'approved-exemption' ? value : 'unconfirmed' } catch { return 'unconfirmed' } }
