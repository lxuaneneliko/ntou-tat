import { describe, expect, it } from 'vitest'
import type { GraduationCurriculum } from './api/graduationRequirements'
import {
  analyzeGraduationSupplement,
  completedGraduationCourses,
  englishConfirmationSatisfied,
  graduationSelectionKey,
  suggestedEnglishCourseKeys,
  suggestedSwimmingCourseKeys,
  swimmingConfirmationSatisfied,
} from './graduationSupplement'
import type { Grade } from './types'

const curriculum: GraduationCurriculum = {
  departmentId: 'me', departmentCode: '0702', departmentName: '機械與機電工程學系',
  requestedYear: 114, sourceYear: 114, fallbackUsed: false, enrollmentIdentity: '一般生',
  durationYears: 4, commonRequiredCredits: 28, departmentRequiredCredits: 74,
  requiredCredits: 114, electiveMinimumCredits: 18, graduationMinimumCredits: 132,
  departmentElectiveMinimumCredits: 12, outsideElectiveMaximumCredits: 6,
  requirements: [
    { id: 'chinese', category: '共同教育課程', title: '國文領域', codes: [], credits: 4, notes: '', kind: 'group' },
    { id: 'general', category: '共同教育課程', title: '博雅課程', codes: [], credits: 14, notes: '', kind: 'group' },
    { id: 'pe', category: '共同教育課程', title: '體育課程', codes: [], credits: 0, notes: '每週上課2小時', kind: 'group' },
    { id: 'advanced-english', category: '共同教育課程', title: '進階英文', codes: [], credits: 2, notes: '', kind: 'group' },
    { id: 'main-domain', category: '系訂主領域必修及選修', title: '機械系主領域', codes: [], credits: 12, notes: '至少12學分', kind: 'group' },
  ],
  electiveNotes: '須含本系選修課程至少12學分', graduationNotes: '', generalNotes: '',
  fetchedAt: '2026-08-30T00:00:00.000Z', sourceUrl: 'https://www.ntou.edu.tw/threshold',
}

const grade = (
  id: string,
  title: string,
  credits: number,
  semester: string,
  category: string,
  required = false,
): Grade => ({
  id, courseId: id, courseTitle: title, credits, semester, category, required,
  score: 80, letter: 'B',
})

describe('graduation supplement rules', () => {
  it('automatically counts Chinese courses, general-education domains and four PE terms', () => {
    const grades = [
      grade('CH1', '國文：閱讀與書寫', 2, '114-1', '國文', true),
      grade('CH2', '國文：經典閱讀', 2, '114-2', '國文', true),
      grade('GE1', '海洋文化【人文探索】', 2, '114-1', '博雅'),
      grade('GE2', '永續海洋【跨域永續】', 2, '114-2', '博雅'),
      grade('PE1', '體育：游泳', 0, '114-1', '體育', true),
      grade('PE1B', '體育：羽球選修', 1, '114-1', '體育'),
      grade('PE2', '體育：羽球', 0, '114-2', '體育', true),
      grade('PE3', '體育：籃球', 0, '115-1', '體育', true),
      grade('PE4', '體育：桌球', 0, '115-2', '體育', true),
    ]
    const result = analyzeGraduationSupplement(curriculum, grades, 114)
    expect(result.rules.find((rule) => rule.id === 'chinese')).toMatchObject({ earned: 4, status: 'complete' })
    expect(result.rules.find((rule) => rule.id === 'general')).toMatchObject({ earned: 4, remaining: 10 })
    expect(result.rules.find((rule) => rule.id === 'pe')).toMatchObject({ earned: 4, required: 4, unit: '門', status: 'complete' })
  })

  it('lets the student assign a transcript course to advanced English and a main field', () => {
    const english = grade('EN201', '英文閱讀與表達', 2, '114-2', '外文')
    const fieldCourses = [1, 2, 3, 4].map((index) =>
      grade(`ME${index}`, `主領域課程${index}`, 3, `11${3 + Math.ceil(index / 2)}-${index % 2 || 2}`, '選修'),
    )
    const selections = {
      'advanced-english': [graduationSelectionKey(english)],
      'main-domain': fieldCourses.map((course) => graduationSelectionKey(course)),
    }
    const result = analyzeGraduationSupplement(curriculum, [english, ...fieldCourses], 114, selections)
    expect(result.rules.find((rule) => rule.id === 'advanced-english')).toMatchObject({ earned: 2, status: 'complete' })
    expect(result.rules.find((rule) => rule.id === 'main-domain')).toMatchObject({ earned: 12, status: 'complete' })
  })

  it('shows elective suggestions without counting them until the student classifies them', () => {
    const grades = [
      grade('REQ', '必修課程', 3, '114-1', '必修', true),
      grade('EL1', '選修甲', 3, '114-1', '選修'),
      grade('EL2', '選修乙', 2, '114-2', '選修'),
      grade('PE', '體育：羽球', 1, '114-2', '體育'),
    ]
    const result = analyzeGraduationSupplement(curriculum, grades, 114)
    const elective = result.rules.find((rule) => rule.title === '選修總學分')!
    const departmentElective = result.rules.find((rule) => rule.title === '本系其他選修')!
    expect(elective.earned).toBe(0)
    expect(elective.selectedCourseKeys).toHaveLength(0)
    expect(elective.automaticCourseKeys).toHaveLength(2)
    expect(departmentElective.earned).toBe(0)
    expect(elective.selectableCourses.map((course) => course.title)).toEqual(
      expect.arrayContaining(['必修課程', '選修甲', '選修乙', '體育：羽球']),
    )
  })

  it('keeps main-domain, department electives and outside electives separate for mechanical engineering', () => {
    const main = grade('MAIN', '主領域課程', 3, '114-1', '選修')
    const departmentCourses = [1, 2, 3, 4].map((index) =>
      grade(`ME-E${index}`, `本系選修${index}`, 3, `11${3 + Math.ceil(index / 2)}-${index % 2 || 2}`, '選修'),
    )
    const outsideCourses = [
      grade('OUT1', '系外選修甲', 3, '114-1', '選修'),
      grade('OUT2', '系外選修乙', 3, '114-2', '選修'),
    ]
    const selections = {
      'main-domain': [graduationSelectionKey(main)],
      'me-114-department-elective-minimum': departmentCourses.map((course) => graduationSelectionKey(course)),
      'me-114-elective-minimum': outsideCourses.map((course) => graduationSelectionKey(course)),
    }
    const result = analyzeGraduationSupplement(
      curriculum,
      [main, ...departmentCourses, ...outsideCourses],
      114,
      selections,
    )
    const departmentElective = result.rules.find((rule) => rule.title === '本系其他選修')!
    const totalElective = result.rules.find((rule) => rule.title === '選修總學分')!
    expect(departmentElective).toMatchObject({ earned: 12, required: 12, status: 'complete' })
    expect(totalElective).toMatchObject({ earned: 18, required: 18, status: 'complete' })
    expect(totalElective.lockedCourseKeys).toHaveLength(4)
    expect(totalElective.selectableCourses.some((course) => course.key === graduationSelectionKey(main))).toBe(false)
  })

  it('shows every passed transcript course in the PE picker while only suggesting likely PE courses', () => {
    const grades = [
      grade('REQ', '工程數學', 3, '114-1', '必修', true),
      grade('SPORT', '身體活動與健康', 0, '114-1', '體育', true),
      grade('SPORT-CREDIT', '體育選修：羽球', 1, '114-2', '體育'),
      grade('BASKETBALL', '籃球', 0, '113-2', '必修', true),
      grade('SERVICE', '服務學習', 0, '113-1', '必修', true),
      grade('FREE', '羽球專題', 1, '114-2', '一般選修'),
    ]
    const result = analyzeGraduationSupplement(curriculum, grades, 114)
    const pe = result.rules.find((rule) => rule.id === 'pe')!
    expect(pe.selectableCourses.map((course) => course.title)).toEqual(
      expect.arrayContaining(['工程數學', '身體活動與健康', '體育選修：羽球', '籃球', '服務學習', '羽球專題']),
    )
    expect(pe.automaticCourseKeys).toEqual(expect.arrayContaining([
      pe.selectableCourses.find((course) => course.title === '身體活動與健康')!.key,
      pe.selectableCourses.find((course) => course.title === '籃球')!.key,
    ]))
    expect(pe.automaticCourseKeys).not.toContain(
      pe.selectableCourses.find((course) => course.title === '體育選修：羽球')!.key,
    )
    expect(pe.automaticCourseKeys).not.toContain(
      pe.selectableCourses.find((course) => course.title === '服務學習')!.key,
    )
  })

  it('counts manually selected PE by distinct semesters rather than credits or number of checkboxes', () => {
    const grades = [
      grade('A', '課程甲', 3, '114-1', '必修', true),
      grade('B', '課程乙', 2, '114-1', '選修'),
      grade('C', '課程丙', 1, '114-2', '選修'),
    ]
    const selectable = completedGraduationCourses(grades, true)
    const result = analyzeGraduationSupplement(curriculum, grades, 114, {
      pe: selectable.map((course) => course.key),
    })
    expect(result.rules.find((rule) => rule.id === 'pe')).toMatchObject({ earned: 2, unit: '門' })
  })

  it('supports manual swimming confirmation and course suggestions', () => {
    const courses = completedGraduationCourses([
      grade('SWIM', '體育：游泳', 0, '114-1', '體育', true),
      grade('MATH', '微積分', 3, '114-1', '必修', true),
    ], true)
    expect(suggestedSwimmingCourseKeys(courses)).toEqual([
      courses.find((course) => course.title === '體育：游泳')!.key,
    ])
    expect(swimmingConfirmationSatisfied({ status: 'course', courseKeys: [] })).toBe(false)
    expect(swimmingConfirmationSatisfied({ status: 'course', courseKeys: [courses[0].key] })).toBe(true)
    expect(swimmingConfirmationSatisfied({ status: 'ability-test', courseKeys: [] })).toBe(true)
    expect(swimmingConfirmationSatisfied({ status: 'not-met', courseKeys: [] })).toBe(false)
  })

  it('supports manual English-threshold confirmation without confusing it with automatic credits', () => {
    const courses = completedGraduationCourses([
      grade('ENGLISH', '進階英文', 2, '114-1', '外文', true),
      grade('MATH', '微積分', 3, '114-1', '必修', true),
    ], true)
    expect(suggestedEnglishCourseKeys(courses)).toEqual([
      courses.find((course) => course.title === '進階英文')!.key,
    ])
    expect(englishConfirmationSatisfied({ status: 'approved-course', courseKeys: [] })).toBe(false)
    expect(englishConfirmationSatisfied({ status: 'approved-course', courseKeys: [courses[0].key] })).toBe(true)
    expect(englishConfirmationSatisfied({ status: 'proficiency-test', courseKeys: [] })).toBe(true)
    expect(englishConfirmationSatisfied({ status: 'exemption', courseKeys: [] })).toBe(true)
    expect(englishConfirmationSatisfied({ status: 'not-met', courseKeys: [] })).toBe(false)
  })
})
