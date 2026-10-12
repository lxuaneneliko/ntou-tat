import { describe, expect, it } from 'vitest'
import { advancedEnglishCreditAdjustment, isNonCreditAdvancedEnglishExemption } from './advancedEnglish'
import { analyzeGraduationAudit } from './graduationAudit'
import { analyzeGraduationSupplement } from './graduationSupplement'
import type { GraduationCurriculum } from './api/graduationRequirements'
import type { Grade } from './types'

const curriculum = (year: number, kind: 'course' | 'group' = 'course'): GraduationCurriculum => ({
  departmentId: 'me', departmentCode: '0702', departmentName: '機械與機電工程學系',
  requestedYear: year, sourceYear: year, fallbackUsed: false, enrollmentIdentity: '一般生', durationYears: 4,
  commonRequiredCredits: 28, departmentRequiredCredits: 74, requiredCredits: 114,
  departmentElectiveMinimumCredits: null, outsideElectiveMaximumCredits: null,
  electiveMinimumCredits: 18, graduationMinimumCredits: 132,
  requirements: [
    { id: 'en', category: '共同教育', title: '進階英文', codes: ['EN01'], credits: 2, notes: '', kind },
    { id: 'me', category: '專業必修', title: '工程數學', codes: ['ME01'], credits: 3, notes: '', kind: 'course' },
  ],
  electiveNotes: '', graduationNotes: '', generalNotes: '', fetchedAt: '2026-10-11', sourceUrl: 'https://langiae.ntou.edu.tw/',
})
const grade = (title = '進階英文', score: number | null = 80, letter = 'B', credits = 2): Grade => ({
  id: title, courseId: title === '進階英文' ? 'EN01' : 'ME01', courseTitle: title,
  credits, score, letter, category: '必修', required: true, semester: '115-1',
})

describe('NTOU English-test exemption policy by enrollment cohort', () => {
  it('awards test-based transfer credits through 114, but only waives the course from 115', () => {
    expect(advancedEnglishCreditAdjustment([], 'approved-exemption', 2, 114)).toBe(2)
    expect(advancedEnglishCreditAdjustment([], 'approved-exemption', 2, 115)).toBe(0)
    expect(isNonCreditAdvancedEnglishExemption('approved-exemption', 114)).toBe(false)
    expect(isNonCreditAdvancedEnglishExemption('approved-exemption', 115)).toBe(true)
  })
  it('does not turn eligibility into either credits or a completed waiver', () => {
    for (const year of [114, 115]) {
      const result = analyzeGraduationAudit(curriculum(year), [], 'eligible')
      expect(result.totalEarnedCredits).toBe(0)
      expect(result.requirements[0]).toMatchObject({ status: 'missing', earnedCredits: 0 })
      expect(result.requirements[0].waived).toBeUndefined()
    }
  })
  it('keeps 115 total graduation credits and minimum unchanged while satisfying the waived requirement', () => {
    const result = analyzeGraduationAudit(curriculum(115), [grade('工程數學', 80, 'B', 3)], 'approved-exemption')
    expect(result.totalEarnedCredits).toBe(3)
    expect(result.totalRemainingCredits).toBe(129)
    expect(result.requirements[0]).toMatchObject({ status: 'complete', earnedCredits: 0, waived: true })
    expect(result.completeCourses.map((item) => item.id)).toEqual(['en', 'me'])
    expect(result.trackableRequiredCredits).toBe(3)
    expect(result.completedRequiredCredits).toBe(3)
    expect(result.missingRequiredCredits).toBe(0)
  })
  it('uses the actual enrollment year even when the official curriculum falls back to 114', () => {
    const fallback = { ...curriculum(115), sourceYear: 114, fallbackUsed: true }
    expect(analyzeGraduationAudit(fallback, [], 'approved-exemption').totalEarnedCredits).toBe(0)
    expect(analyzeGraduationAudit(fallback, [], 'approved-exemption').requirements[0].waived).toBe(true)
  })
  it('never changes freshman English credits or its requirement when advanced English is exempted', () => {
    for (const year of [114, 115]) {
      const plan = curriculum(year)
      plan.requirements.push({ id: 'freshman-en', category: '共同教育', title: '英文(大一英文)上', codes: ['EN101'], credits: 2, notes: '', kind: 'course' })
      const freshman = { ...grade('英文(大一英文)上'), courseId: 'EN101' }
      const before = analyzeGraduationAudit(plan, [freshman], 'unconfirmed')
      const after = analyzeGraduationAudit(plan, [freshman], 'approved-exemption')
      expect(after.requirements.find((item) => item.id === 'freshman-en')).toEqual(before.requirements.find((item) => item.id === 'freshman-en'))
      expect(after.totalEarnedCredits).toBe(year >= 115 ? 2 : 4)
      expect(after.requirements.find((item) => item.id === 'freshman-en')?.waived).toBeUndefined()
    }
  })
  it('keeps pre-115 approved credits, manual course completion, and genuine transcript credits', () => {
    expect(analyzeGraduationAudit(curriculum(114), [], 'approved-exemption').totalEarnedCredits).toBe(2)
    expect(analyzeGraduationAudit(curriculum(115), [], 'completed').totalEarnedCredits).toBe(2)
    for (const entry of [grade(), grade('進階英文', null, '核准抵免')]) {
      expect(analyzeGraduationAudit(curriculum(115), [entry], 'approved-exemption').totalEarnedCredits).toBe(2)
    }
    expect(analyzeGraduationAudit(curriculum(115), [grade('進階英文', null, '免修')], 'approved-exemption').totalEarnedCredits).toBe(0)
  })
  it('marks the 115 group waived with zero earned credits and no missing course, rather than a false 2/2', () => {
    const result = analyzeGraduationSupplement(curriculum(115, 'group'), [], 115, {}, {}, 'approved-exemption')
    expect(result.rules[0]).toMatchObject({ waived: true, earned: 0, required: 2, remaining: 0, status: 'complete' })
    expect(result.rules.find((rule) => rule.title === '選修總學分')).toMatchObject({ required: 18, earned: 0, remaining: 18 })
    expect(analyzeGraduationSupplement(curriculum(114, 'group'), [], 114, {}, {}, 'approved-exemption').rules[0]).toMatchObject({ earned: 2, status: 'complete' })
    expect(analyzeGraduationSupplement(curriculum(115, 'group'), [], 115, {}, {}, 'eligible').rules[0]).toMatchObject({ earned: 0, remaining: 2, status: 'missing' })
    expect(analyzeGraduationSupplement(curriculum(115, 'group'), [], 115, {}, {}, 'completed').rules[0]).toMatchObject({ earned: 2, status: 'complete' })
  })
})
