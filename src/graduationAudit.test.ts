import { describe, expect, it } from 'vitest'
import type { GraduationCurriculum } from './api/graduationRequirements'
import { analyzeGraduationAudit } from './graduationAudit'
import type { Grade } from './types'

const curriculum: GraduationCurriculum = {
  departmentId: 'cse', departmentCode: '0507', departmentName: '資訊工程學系', requestedYear: 114,
  sourceYear: 114, fallbackUsed: false, enrollmentIdentity: '一般生', durationYears: 4,
  commonRequiredCredits: 28, departmentRequiredCredits: 50, requiredCredits: 78,
  departmentElectiveMinimumCredits: null, outsideElectiveMaximumCredits: null,
  electiveMinimumCredits: 57, graduationMinimumCredits: 135,
  requirements: [
    { id: 'programming', category: '系訂專業必修', title: '程式設計', codes: ['B5701M33'], credits: 3, notes: '', kind: 'course' },
    { id: 'calculus', category: '系訂專業必修', title: '微積分', codes: ['B5711M97', 'B5721M97'], credits: 6, notes: '', kind: 'course' },
    { id: 'project', category: '系訂專業必修', title: '資工系專題(一)', codes: [], credits: 3, notes: '', kind: 'course' },
    { id: 'swim', category: '共同教育課程', title: '游泳畢業門檻', codes: ['B92A12P5'], credits: 0, notes: '', kind: 'threshold' },
  ],
  electiveNotes: '', graduationNotes: '', generalNotes: '', fetchedAt: '2026-08-29T00:00:00.000Z', sourceUrl: 'https://www.ntou.edu.tw/threshold',
}

const grade = (courseId: string, courseTitle: string, credits: number, score = 80, category = '必修'): Grade => ({
  id: `${courseId}-${courseTitle}`, courseId, courseTitle, semester: '114-1', credits, score,
  required: true, category,
})

describe('graduation audit', () => {
  it('matches by course code first and title when the official row has no code', () => {
    const result = analyzeGraduationAudit(curriculum, [
      grade('B5701M33', '程式設計新版名稱', 3),
      grade('B5711M97', '微積分(一)', 3),
      grade('B5721M97', '微積分(二)', 3),
      grade('', '資工系專題(一)', 3),
    ])
    expect(result.completedRequiredCredits).toBe(12)
    expect(result.missingCourses).toHaveLength(0)
    expect(result.reviewRequirements).toHaveLength(1)
  })

  it('does not count failed, duplicate, military or physical-education credits', () => {
    const result = analyzeGraduationAudit(curriculum, [
      grade('B5701M33', '程式設計', 3, 80),
      { ...grade('B5701M33', '程式設計', 3, 90), id: 'retake' },
      grade('B5711M97', '微積分(一)', 3, 50),
      grade('PE01', '體育', 1, 90, '體育'),
      grade('EL01', '一般選修', 2, 90, '選修'),
    ])
    expect(result.totalEarnedCredits).toBe(5)
    expect(result.completedRequiredCredits).toBe(3)
    expect(result.missingRequiredCredits).toBe(9)
  })
})
