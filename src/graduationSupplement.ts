import type { GraduationCurriculum } from './api/graduationRequirements'
import {
  analyzeGeneralEducationProgress,
  type GeneralEducationOverrides,
} from './generalEducation'
import { hasPassingResult } from './gpa'
import type { Grade } from './types'

export type GraduationManualSelections = Record<string, string[]>

export type SwimmingConfirmationStatus =
  | 'unconfirmed'
  | 'course'
  | 'ability-test'
  | 'competition'
  | 'not-applicable'
  | 'not-met'

export type SwimmingConfirmation = {
  status: SwimmingConfirmationStatus
  courseKeys: string[]
}

export type EnglishConfirmationStatus =
  | 'unconfirmed'
  | 'proficiency-test'
  | 'approved-course'
  | 'exemption'
  | 'not-applicable'
  | 'not-met'

export type EnglishConfirmation = {
  status: EnglishConfirmationStatus
  courseKeys: string[]
}

export type GraduationSelectableCourse = {
  key: string
  title: string
  semester: string
  credits: number
  category: string
  required: boolean
}

export type GraduationSupplementRule = {
  id: string
  title: string
  description: string
  required: number
  earned: number
  remaining: number
  unit: '學分' | '門'
  status: 'complete' | 'missing'
  method: 'automatic' | 'mixed' | 'manual'
  selectableCourses: GraduationSelectableCourse[]
  selectedCourseKeys: string[]
  automaticCourseKeys: string[]
  lockedCourseKeys: string[]
}

export type GraduationSupplement = {
  rules: GraduationSupplementRule[]
  completedCount: number
  remainingCount: number
}

const normalize = (value: string) => value
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/gu, '')
  .replace(/\s+/gu, '')
  .toUpperCase()

const semesterRank = (semester: string) => {
  const match = semester.match(/(\d{2,3})\D*([1-4])/u)
  return match ? Number(match[1]) * 10 + Number(match[2]) : 0
}

const completed = (grade: Grade) => {
  if (hasPassingResult(grade.score, grade.letter)) return true
  return /^(?:抵免|已抵免|抵免通過|核准抵免)$/u.test(normalize(grade.letter ?? '').replace(/[：:]/gu, ''))
}

const identity = (grade: Grade) => normalize(grade.courseId) || normalize(grade.courseTitle)

export const graduationSelectionKey = (grade: Grade, perSemester = false) =>
  `${perSemester ? `${normalize(grade.semester)}|` : ''}${identity(grade)}`

const toSelectable = (grade: Grade, perSemester = false): GraduationSelectableCourse => ({
  key: graduationSelectionKey(grade, perSemester),
  title: grade.courseTitle.trim(),
  semester: grade.semester,
  credits: Math.max(0, Number.isFinite(grade.credits) ? grade.credits : 0),
  category: grade.category.trim(),
  required: grade.required,
})

const completedCreditCourses = (grades: Grade[]) => {
  const courses = new Map<string, Grade>()
  grades.filter(completed).forEach((grade) => {
    const key = graduationSelectionKey(grade)
    const current = courses.get(key)
    if (
      !current ||
      grade.credits > current.credits ||
      (grade.credits === current.credits && semesterRank(grade.semester) > semesterRank(current.semester))
    ) courses.set(key, grade)
  })
  return [...courses.values()]
    .sort((left, right) => semesterRank(right.semester) - semesterRank(left.semester))
    .map((grade) => toSelectable(grade))
}

export const completedGraduationCourses = (grades: Grade[], perSemester = false) => {
  const courses = new Map<string, Grade>()
  grades.filter(completed).forEach((grade) => {
    const key = graduationSelectionKey(grade, perSemester)
    const current = courses.get(key)
    if (
      !current ||
      grade.credits > current.credits ||
      (grade.credits === current.credits && semesterRank(grade.semester) > semesterRank(current.semester))
    ) courses.set(key, grade)
  })
  return [...courses.values()]
    .sort((left, right) => semesterRank(right.semester) - semesterRank(left.semester))
    .map((grade) => toSelectable(grade, perSemester))
}

const completedPhysicalEducationCourses = (grades: Grade[]) => {
  const courses = new Map<string, Grade>()
  grades.filter((grade) => {
    if (!completed(grade)) return false
    const text = `${grade.category}${grade.courseTitle}`
    const looksLikePhysicalEducation = /體育|游泳|體適能|身體活動|運動|籃球|排球|桌球|羽球|網球|足球|壘球|瑜珈|有氧|韻律|舞蹈|武術|太極|重訓|重量訓練/u.test(text)
    return grade.credits === 0 && looksLikePhysicalEducation && !/游泳畢業門檻/u.test(text)
  }).forEach((grade) => {
    const semesterKey = normalize(grade.semester)
    const current = courses.get(semesterKey)
    // The requirement is four different semesters, not four classes taken in
    // the same semester. Prefer the zero-credit required PE record when both
    // required and elective PE appear in one term.
    if (!current || (current.credits > 0 && grade.credits === 0)) courses.set(semesterKey, grade)
  })
  return [...courses.values()]
    .sort((left, right) => semesterRank(right.semester) - semesterRank(left.semester))
    .map((grade) => toSelectable(grade, true))
}

const selectedKeys = (
  id: string,
  automaticCourseKeys: string[],
  selections: GraduationManualSelections,
) => selections[id] ?? automaticCourseKeys

const buildCourseRule = ({
  id,
  title,
  description,
  required,
  unit = '學分',
  method,
  selectableCourses,
  automaticCourseKeys,
  selections,
  countUniqueSemesters = false,
  defaultCourseKeys = automaticCourseKeys,
  lockedCourseKeys = [],
}: {
  id: string
  title: string
  description: string
  required: number
  unit?: '學分' | '門'
  method: GraduationSupplementRule['method']
  selectableCourses: GraduationSelectableCourse[]
  automaticCourseKeys: string[]
  selections: GraduationManualSelections
  countUniqueSemesters?: boolean
  defaultCourseKeys?: string[]
  lockedCourseKeys?: string[]
}): GraduationSupplementRule => {
  const allowedKeys = new Set(selectableCourses.map((course) => course.key))
  const effectiveKeys = [...new Set([
    ...selectedKeys(id, defaultCourseKeys, selections),
    ...lockedCourseKeys,
  ])].filter((key) => allowedKeys.has(key))
  const selected = new Set(effectiveKeys)
  const selectedCourses = selectableCourses.filter((course) => selected.has(course.key))
  const earnedRaw = unit === '門'
    ? countUniqueSemesters
      ? new Set(selectedCourses.map((course) => normalize(course.semester))).size
      : effectiveKeys.length
    : selectableCourses
      .filter((course) => selected.has(course.key))
      .reduce((total, course) => total + course.credits, 0)
  const earned = Math.min(required, earnedRaw)
  return {
    id,
    title,
    description,
    required,
    earned,
    remaining: Math.max(0, required - earned),
    unit,
    status: earned >= required ? 'complete' : 'missing',
    method,
    selectableCourses,
    selectedCourseKeys: effectiveKeys,
    automaticCourseKeys,
    lockedCourseKeys: lockedCourseKeys.filter((key) => allowedKeys.has(key)),
  }
}

const isExcludedElective = (course: GraduationSelectableCourse) =>
  /軍訓|國防教育|體育/u.test(`${course.category}${course.title}`)

const isChineseCourse = (course: GraduationSelectableCourse) =>
  /國文/u.test(course.category) || /^(?:國文|中文閱讀與寫作)/u.test(course.title)

const isAdvancedEnglishCourse = (course: GraduationSelectableCourse) =>
  /進階英文/u.test(`${course.category}${course.title}`)

export const analyzeGraduationSupplement = (
  curriculum: GraduationCurriculum,
  grades: Grade[],
  cohortYear: number,
  selections: GraduationManualSelections = {},
  generalEducationOverrides: GeneralEducationOverrides = {},
): GraduationSupplement => {
  const creditCourses = completedCreditCourses(grades)
  const transcriptCoursesBySemester = completedGraduationCourses(grades, true)
  const physicalEducationCourses = completedPhysicalEducationCourses(grades)
  const generalEducation = analyzeGeneralEducationProgress(grades, cohortYear, generalEducationOverrides)
  const rules: GraduationSupplementRule[] = []

  curriculum.requirements
    .filter((requirement) => requirement.kind === 'group')
    .forEach((requirement) => {
      const title = normalize(requirement.title)
      if (/國文領域/u.test(title)) {
        const automaticCourseKeys = creditCourses.filter(isChineseCourse).map((course) => course.key)
        rules.push(buildCourseRule({
          id: requirement.id,
          title: '國文課程',
          description: '依成績單的國文選別與課名自動辨識；若課名特殊，可自行調整。',
          required: requirement.credits,
          method: 'mixed',
          selectableCourses: creditCourses,
          automaticCourseKeys,
          selections,
        }))
        return
      }

      if (/博雅課程|博雅領域/u.test(title) && generalEducation.supported) {
        const earned = Math.min(requirement.credits, generalEducation.domainRecognized)
        rules.push({
          id: requirement.id,
          title: '博雅課程',
          description: `${generalEducation.domainSystem === 'four' ? '四大領域' : '八大領域'}規則與通識分析同步；不確定課程請在通識分析中分類。`,
          required: requirement.credits,
          earned,
          remaining: Math.max(0, requirement.credits - earned),
          unit: '學分',
          status: earned >= requirement.credits ? 'complete' : 'missing',
          method: 'automatic',
          selectableCourses: [],
          selectedCourseKeys: [],
          automaticCourseKeys: [],
          lockedCourseKeys: [],
        })
        return
      }

      if (/體育課程|^體育$/u.test(title)) {
        const automaticCourseKeys = physicalEducationCourses.map((course) => course.key)
        rules.push(buildCourseRule({
          id: requirement.id,
          title: '體育必修',
          description: '須修滿四學期零學分體育，其中至少一學期為游泳；此處按通過的學期門數計算。',
          required: 4,
          unit: '門',
          method: 'mixed',
          selectableCourses: transcriptCoursesBySemester,
          automaticCourseKeys,
          selections,
          countUniqueSemesters: true,
        }))
        return
      }

      if (/進階英文|外文領域/u.test(title)) {
        const automaticCourseKeys = creditCourses.filter(isAdvancedEnglishCourse).map((course) => course.key)
        rules.push(buildCourseRule({
          id: requirement.id,
          title: requirement.title,
          description: '明確標示為進階英文的課程會先勾選；若成績單名稱不同，請自行指定採計課程。',
          required: requirement.credits,
          method: 'mixed',
          selectableCourses: creditCourses,
          automaticCourseKeys,
          selections,
        }))
        return
      }

      rules.push(buildCourseRule({
        id: requirement.id,
        title: requirement.title,
        description: requirement.notes || '官方表列為領域或課群，請自行選擇符合規定的已修課程。',
        required: requirement.credits,
        method: 'manual',
        selectableCourses: creditCourses,
        automaticCourseKeys: [],
        selections,
      }))
    })

  if (curriculum.electiveMinimumCredits > 0) {
    const reservedRequirementIds = new Set(curriculum.requirements
      .filter((requirement) =>
        requirement.kind === 'group' &&
        /系訂.*(?:主領域|副領域).*必修及選修|系訂主領域|系訂副領域/u.test(normalize(requirement.category)),
      )
      .map((requirement) => requirement.id))
    const reservedCourseKeys = new Set(rules
      .filter((rule) => reservedRequirementIds.has(rule.id))
      .flatMap((rule) => rule.selectedCourseKeys))
    const selectableElectiveCourses = creditCourses.filter((course) => !reservedCourseKeys.has(course.key))
    const suggestedElectiveKeys = selectableElectiveCourses
      .filter((course) => !isExcludedElective(course))
      .filter((course) => !course.required)
      .map((course) => course.key)
    const departmentRuleId = `${curriculum.departmentId}-${curriculum.sourceYear}-department-elective-minimum`
    let departmentElectiveKeys: string[] = []

    if (curriculum.departmentElectiveMinimumCredits !== null && curriculum.departmentElectiveMinimumCredits > 0) {
      const departmentRule = buildCourseRule({
        id: departmentRuleId,
        title: '本系其他選修',
        description: `官方規定至少 ${curriculum.departmentElectiveMinimumCredits} 學分；開課單位無法從成績單可靠判斷，請手動採計，且不得與主／副領域重複。`,
        required: curriculum.departmentElectiveMinimumCredits,
        method: 'manual',
        selectableCourses: selectableElectiveCourses,
        automaticCourseKeys: [],
        defaultCourseKeys: [],
        selections,
      })
      departmentElectiveKeys = departmentRule.selectedCourseKeys
      rules.push(departmentRule)
    }

    const outsideCopy = curriculum.outsideElectiveMaximumCredits !== null
      ? `最低畢業學分結構中，系外或其他選修最多可補 ${curriculum.outsideElectiveMaximumCredits} 學分。`
      : '官方備註未提供可可靠解析的本系／系外比例，請依原表確認。'
    rules.push(buildCourseRule({
      id: `${curriculum.departmentId}-${curriculum.sourceYear}-elective-minimum`,
      title: '選修總學分',
      description: `須修滿 ${curriculum.electiveMinimumCredits} 學分。${outsideCopy}本系其他選修會自動帶入，不重複加總。`,
      required: curriculum.electiveMinimumCredits,
      method: 'mixed',
      selectableCourses: selectableElectiveCourses,
      automaticCourseKeys: suggestedElectiveKeys,
      defaultCourseKeys: [],
      lockedCourseKeys: departmentElectiveKeys,
      selections,
    }))
  }

  return {
    rules,
    completedCount: rules.filter((rule) => rule.status === 'complete').length,
    remainingCount: rules.filter((rule) => rule.status === 'missing').length,
  }
}

export const suggestedSwimmingCourseKeys = (courses: GraduationSelectableCourse[]) =>
  courses
    .filter((course) => /游泳|體育/u.test(`${course.category}${course.title}`))
    .map((course) => course.key)

export const swimmingConfirmationSatisfied = (confirmation: SwimmingConfirmation) => {
  if (confirmation.status === 'course') return confirmation.courseKeys.length > 0
  return confirmation.status === 'ability-test' ||
    confirmation.status === 'competition' ||
    confirmation.status === 'not-applicable'
}

export const suggestedEnglishCourseKeys = (courses: GraduationSelectableCourse[]) =>
  courses
    .filter((course) => /英文|英語|外文/u.test(`${course.category}${course.title}`))
    .map((course) => course.key)

export const englishConfirmationSatisfied = (confirmation: EnglishConfirmation) => {
  if (confirmation.status === 'approved-course') return confirmation.courseKeys.length > 0
  return confirmation.status === 'proficiency-test' ||
    confirmation.status === 'exemption' ||
    confirmation.status === 'not-applicable'
}
