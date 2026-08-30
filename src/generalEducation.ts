import { hasPassingResult } from './gpa'
import type { Grade } from './types'

export const FOUR_DOMAIN_KEYS = [
  'humanities',
  'society',
  'technology',
  'sustainability',
] as const

export const EIGHT_DOMAIN_KEYS = [
  'personality',
  'democracy',
  'globalization',
  'classics',
  'aesthetics',
  'technologyAndSociety',
  'naturalScience',
  'history',
] as const

export type FourDomainKey = (typeof FOUR_DOMAIN_KEYS)[number]
export type EightDomainKey = (typeof EIGHT_DOMAIN_KEYS)[number]
export type GeneralEducationDomainKey = FourDomainKey | EightDomainKey
export type GeneralEducationOverride = GeneralEducationDomainKey | 'ignore'
export type GeneralEducationOverrides = Record<string, GeneralEducationOverride>

export const GENERAL_EDUCATION_DOMAIN_DEFINITIONS: Record<GeneralEducationDomainKey, {
  label: string
  shortLabel: string
  color: string
}> = {
  humanities: {
    label: '人文探索',
    shortLabel: '人文',
    color: '#f0a95a',
  },
  society: {
    label: '社會脈動',
    shortLabel: '社會',
    color: '#5fc6b6',
  },
  technology: {
    label: '科技創新',
    shortLabel: '科技',
    color: '#67aef5',
  },
  sustainability: {
    label: '跨域永續',
    shortLabel: '跨域',
    color: '#c8d968',
  },
  personality: {
    label: '人格培育與多元文化',
    shortLabel: '人格',
    color: '#f0a95a',
  },
  democracy: {
    label: '民主法治與公民意識',
    shortLabel: '民主',
    color: '#e98073',
  },
  globalization: {
    label: '全球化與社經結構',
    shortLabel: '全球',
    color: '#5fc6b6',
  },
  classics: {
    label: '中外經典',
    shortLabel: '經典',
    color: '#9ab86b',
  },
  aesthetics: {
    label: '美學與美感表達',
    shortLabel: '美學',
    color: '#c991d4',
  },
  technologyAndSociety: {
    label: '科技與社會',
    shortLabel: '科技',
    color: '#67aef5',
  },
  naturalScience: {
    label: '自然科學',
    shortLabel: '自然',
    color: '#58b6ce',
  },
  history: {
    label: '歷史分析與詮釋',
    shortLabel: '歷史',
    color: '#d8b767',
  },
}

type CourseClassification =
  | {
      kind: 'domain'
      domain: GeneralEducationDomainKey
      evidence: 'official-title-suffix' | 'official-old-marker' | 'manual'
    }
  | {
      kind: 'required'
      requirement: 'ocean' | 'ai'
      evidence: 'exact-title'
    }
  | {
      kind: 'unknown'
      reason: 'old-domain-only' | 'unverified-bracket-variant' | 'no-official-domain-suffix' | 'conflicting-domain-markers' | 'unexpected-required-credits' | 'invalid-credit-value'
      suggestedDomain?: FourDomainKey
    }
  | {
      kind: 'not-general'
    }

export type GeneralEducationCourse = {
  key: string
  title: string
  semester: string
  credits: number
  category: string
  duplicateCount: number
  classification: CourseClassification
}

export type GeneralEducationDomainProgress = {
  key: GeneralEducationDomainKey
  label: string
  shortLabel: string
  color: string
  earned: number
  recognized: number
  cap: number
  courses: GeneralEducationCourse[]
}

export type GeneralEducationProgress = {
  supported: boolean
  cohortYear: number
  domainSystem: 'four' | 'eight'
  domainRequired: number
  domainRecognized: number
  domainRemaining: number
  sustainabilityRemaining: number
  flexibleRemaining: number
  oceanEarned: number
  oceanRemaining: number
  aiEarned: number
  aiRemaining: number
  serviceLearningRequiredTerms: number
  serviceLearningCompletedTerms: number
  serviceLearningRemainingTerms: number
  recognizedTotal: number
  requiredTotal: number
  remainingTotal: number
  domains: GeneralEducationDomainProgress[]
  unknownCourses: GeneralEducationCourse[]
  countedCourses: GeneralEducationCourse[]
  eligibleDomains: GeneralEducationDomainKey[]
}

const OFFICIAL_DOMAIN_LABELS: Record<string, FourDomainKey> = {
  人文探索: 'humanities',
  社會脈動: 'society',
  科技創新: 'technology',
  跨域永續: 'sustainability',
}

const OLD_DOMAIN_LABELS: Record<string, EightDomainKey> = {
  人格: 'personality',
  民主: 'democracy',
  全球: 'globalization',
  經典: 'classics',
  美學: 'aesthetics',
  科技: 'technologyAndSociety',
  自然: 'naturalScience',
  歷史: 'history',
}

const OFFICIAL_DOMAIN_PATTERN = /〖\s*(人文探索|社會脈動|科技創新|跨域永續)\s*〗/gu
const OFFICIAL_DOMAIN_SUFFIX_PATTERN = /〖\s*(人文探索|社會脈動|科技創新|跨域永續)\s*〗(?:\s*[A-Z])?\s*$/iu
const OFFICIAL_DOMAIN_CLASS_SUFFIX_PATTERN = /(〖\s*(?:人文探索|社會脈動|科技創新|跨域永續)\s*〗)\s*[A-Z]\s*$/iu
const ALTERNATE_DOMAIN_SUFFIX_PATTERN = /(?:【\s*(人文探索|社會脈動|科技創新|跨域永續)\s*】|（\s*(人文探索|社會脈動|科技創新|跨域永續)\s*）|\(\s*(人文探索|社會脈動|科技創新|跨域永續)\s*\)|\[\s*(人文探索|社會脈動|科技創新|跨域永續)\s*\])\s*$/u
const OLD_DOMAIN_PATTERN = /(?:（|\()\s*(人格|民主|全球|經典|美學|科技|自然|歷史)\s*(?:）|\))/gu
const OLD_DOMAIN_TEST_PATTERN = /(?:（|\()\s*(?:人格|民主|全球|經典|美學|科技|自然|歷史)\s*(?:）|\))/u
const normalizeText = (value: string) => value
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/gu, '')
  .replace(/\s+/gu, ' ')
  .trim()

const normalizedTitleForMatching = (value: string) => value
  .normalize('NFC')
  .replace(/[\u200B-\u200D\uFEFF]/gu, '')
  .replace(/\s+/gu, ' ')
  .trim()

const academicSemesterRank = (semester: string) => {
  const match = semester.match(/(\d{2,3})\D*([1-4])/u)
  if (!match) return 0
  return Number(match[1]) * 10 + Number(match[2])
}

const normalizedCourseIdentity = (title: string) => normalizeText(title)
  .replace(OFFICIAL_DOMAIN_CLASS_SUFFIX_PATTERN, '$1')
  .replace(OLD_DOMAIN_PATTERN, '')
  .replace(OFFICIAL_DOMAIN_PATTERN, '')
  .replace(ALTERNATE_DOMAIN_SUFFIX_PATTERN, '')
  .trim()

// Course numbers were merged again in 113-1, so the transcript title marker is
// the stable evidence across cohorts. courseId remains useful to the grade cache,
// but is not safe enough to decide a domain by itself.
export const generalEducationCourseKey = (grade: Grade) =>
  normalizedCourseIdentity(grade.courseTitle)

const courseDedupKey = (grade: Grade) => normalizedCourseIdentity(grade.courseTitle)

const completedTranscriptGrade = (grade: Grade) => {
  if (hasPassingResult(grade.score, grade.letter)) return true
  const transferResult = normalizeText(grade.letter ?? '').replace(/[：:]/gu, '')
  return /^(?:抵免|已抵免|抵免通過|核准抵免)$/u.test(transferResult)
}

const isServiceLearningCourse = (grade: Grade) => {
  const title = normalizeText(grade.courseTitle)
  const category = normalizeText(grade.category)
  return /服務學習.*愛校服務|愛校服務.*服務學習|^服務學習$/u.test(title)
    || category === '服務學習'
}

const completedServiceLearningTerms = (grades: Grade[]) => new Set(
  grades
    .filter((grade) => completedTranscriptGrade(grade) && isServiceLearningCourse(grade))
    .map((grade) => normalizeText(grade.semester))
    .filter(Boolean),
).size

const classifyCourseTitle = (grade: Grade, cohortYear: number): CourseClassification => {
  const title = normalizedTitleForMatching(grade.courseTitle)
  const normalizedForExactMatch = normalizeText(grade.courseTitle)
  const category = normalizeText(grade.category)
  const transcriptRelevant = normalizedForExactMatch === '海洋科學概論'
    || normalizedForExactMatch === '人工智慧概論'
    || OFFICIAL_DOMAIN_SUFFIX_PATTERN.test(title)
    || ALTERNATE_DOMAIN_SUFFIX_PATTERN.test(title)
    || OLD_DOMAIN_TEST_PATTERN.test(title)
    || /博雅|通識|共同教育|^通$/u.test(category)

  if (transcriptRelevant && (!Number.isFinite(grade.credits) || grade.credits <= 0)) {
    return { kind: 'unknown', reason: 'invalid-credit-value' }
  }

  if (normalizedForExactMatch === '海洋科學概論') {
    return grade.credits === 2
      ? { kind: 'required', requirement: 'ocean', evidence: 'exact-title' }
      : { kind: 'unknown', reason: 'unexpected-required-credits' }
  }
  if (normalizedForExactMatch === '人工智慧概論') {
    return grade.credits === 2
      ? { kind: 'required', requirement: 'ai', evidence: 'exact-title' }
      : { kind: 'unknown', reason: 'unexpected-required-credits' }
  }

  const allOfficialDomains = [...title.matchAll(OFFICIAL_DOMAIN_PATTERN)]
    .map((match) => OFFICIAL_DOMAIN_LABELS[match[1]])
  const uniqueOfficialDomains = [...new Set(allOfficialDomains)]
  if (uniqueOfficialDomains.length > 1) {
    return { kind: 'unknown', reason: 'conflicting-domain-markers' }
  }

  const allOldDomains = [...title.matchAll(OLD_DOMAIN_PATTERN)]
    .map((match) => OLD_DOMAIN_LABELS[match[1]])
  const uniqueOldDomains = [...new Set(allOldDomains)]
  if (uniqueOldDomains.length > 1) {
    return { kind: 'unknown', reason: 'conflicting-domain-markers' }
  }

  if (cohortYear <= 111 && uniqueOldDomains.length === 1) {
    return {
      kind: 'domain',
      domain: uniqueOldDomains[0],
      evidence: 'official-old-marker',
    }
  }

  const officialSuffix = title.match(OFFICIAL_DOMAIN_SUFFIX_PATTERN)
  if (cohortYear >= 112 && officialSuffix) {
    return {
      kind: 'domain',
      domain: OFFICIAL_DOMAIN_LABELS[officialSuffix[1]],
      evidence: 'official-title-suffix',
    }
  }

  const alternateSuffix = title.match(ALTERNATE_DOMAIN_SUFFIX_PATTERN)
  if (alternateSuffix) {
    const label = alternateSuffix.slice(1).find(Boolean)
    if (cohortYear >= 112 && label) {
      return {
        kind: 'domain',
        domain: OFFICIAL_DOMAIN_LABELS[label],
        evidence: 'official-title-suffix',
      }
    }
    return {
      kind: 'unknown',
      reason: 'unverified-bracket-variant',
      suggestedDomain: label ? OFFICIAL_DOMAIN_LABELS[label] : undefined,
    }
  }

  if (uniqueOldDomains.length) {
    return { kind: 'unknown', reason: 'old-domain-only' }
  }

  if (/博雅|通識|共同教育|^通$/u.test(category)) {
    return { kind: 'unknown', reason: 'no-official-domain-suffix' }
  }

  return { kind: 'not-general' }
}

const classificationStrength = (classification: CourseClassification) => {
  if (classification.kind === 'required') return 4
  if (classification.kind === 'domain' && classification.evidence === 'official-title-suffix') return 3
  if (classification.kind === 'domain') return 2
  if (classification.kind === 'unknown') return 1
  return 0
}

const classifiedCompletedCourses = (
  grades: Grade[],
  cohortYear: number,
  overrides: GeneralEducationOverrides,
): GeneralEducationCourse[] => {
  const grouped = new Map<string, GeneralEducationCourse[]>()

  grades.filter(completedTranscriptGrade).forEach((grade) => {
    const key = generalEducationCourseKey(grade)
    const override = overrides[key]
    const automatic = classifyCourseTitle(grade, cohortYear)
    const classification: CourseClassification = override === 'ignore'
      ? { kind: 'not-general' }
      : override
        ? { kind: 'domain', domain: override, evidence: 'manual' }
        : automatic

    const course: GeneralEducationCourse = {
      key,
      title: grade.courseTitle.trim(),
      semester: grade.semester,
      credits: Number.isFinite(grade.credits) ? Math.max(0, grade.credits) : 0,
      category: grade.category,
      duplicateCount: 1,
      classification,
    }
    const dedupKey = courseDedupKey(grade)
    grouped.set(dedupKey, [...(grouped.get(dedupKey) ?? []), course])
  })

  return [...grouped.values()].map((matches) => {
    const sorted = [...matches].sort((left, right) => {
      const strength = classificationStrength(right.classification) - classificationStrength(left.classification)
      if (strength) return strength
      return academicSemesterRank(right.semester) - academicSemesterRank(left.semester)
    })
    return { ...sorted[0], duplicateCount: matches.length }
  })
}

export const inferGeneralEducationCohortYear = (grades: Grade[], fallback = 115) => {
  const years = grades
    .map((grade) => Number(grade.semester.match(/\d{2,3}/u)?.[0]))
    .filter((year) => Number.isFinite(year) && year >= 90 && year <= 199)
  return years.length ? Math.min(...years) : fallback
}

export const analyzeGeneralEducationProgress = (
  grades: Grade[],
  cohortYear: number,
  overrides: GeneralEducationOverrides = {},
): GeneralEducationProgress => {
  const supported = cohortYear >= 110 && cohortYear <= 115
  const domainSystem = cohortYear >= 112 ? 'four' : 'eight'
  const domainKeys: readonly GeneralEducationDomainKey[] = domainSystem === 'four'
    ? FOUR_DOMAIN_KEYS
    : EIGHT_DOMAIN_KEYS
  const courses = classifiedCompletedCourses(grades, cohortYear, overrides)
  const countedCourses = courses.filter((course) =>
    course.classification.kind === 'domain' || course.classification.kind === 'required',
  )
  const unknownCourses = courses
    .filter((course) => course.classification.kind === 'unknown')
    .sort((left, right) => academicSemesterRank(right.semester) - academicSemesterRank(left.semester))

  const domains = domainKeys.map((key): GeneralEducationDomainProgress => {
    const domainCourses = countedCourses.filter((course) =>
      course.classification.kind === 'domain' && course.classification.domain === key,
    )
    const earned = domainCourses.reduce((total, course) => total + course.credits, 0)
    return {
      key,
      ...GENERAL_EDUCATION_DOMAIN_DEFINITIONS[key],
      earned,
      recognized: Math.min(4, earned),
      cap: 4,
      courses: domainCourses,
    }
  })

  const requiredCredits = (requirement: 'ocean' | 'ai') => countedCourses
    .filter((course) =>
      course.classification.kind === 'required' && course.classification.requirement === requirement,
    )
    .reduce((total, course) => total + course.credits, 0)

  const oceanEarned = Math.min(2, requiredCredits('ocean'))
  const aiEarned = Math.min(2, requiredCredits('ai'))
  const domainRequired = 14
  const domainRecognized = Math.min(
    domainRequired,
    domains.reduce((total, domain) => total + domain.recognized, 0),
  )
  const domainRemaining = Math.max(0, domainRequired - domainRecognized)
  const sustainability = domains.find((domain) => domain.key === 'sustainability')
  const sustainabilityRemaining = sustainability
    ? Math.max(0, 2 - sustainability.recognized)
    : 0
  const flexibleRemaining = Math.max(0, domainRemaining - sustainabilityRemaining)
  const oceanRemaining = Math.max(0, 2 - oceanEarned)
  const aiRemaining = Math.max(0, 2 - aiEarned)
  const serviceLearningRequiredTerms = cohortYear <= 112 ? 2 : 0
  const serviceLearningCompletedTerms = Math.min(
    serviceLearningRequiredTerms,
    completedServiceLearningTerms(grades),
  )
  const serviceLearningRemainingTerms = Math.max(
    0,
    serviceLearningRequiredTerms - serviceLearningCompletedTerms,
  )
  const recognizedTotal = domainRecognized + oceanEarned + aiEarned
  const requiredTotal = 18
  const remainingTotal = domainRemaining + oceanRemaining + aiRemaining
  const eligibleDomains = domains
    .filter((domain) => domain.recognized < domain.cap)
    .map((domain) => domain.key)

  return {
    supported,
    cohortYear,
    domainSystem,
    domainRequired,
    domainRecognized,
    domainRemaining,
    sustainabilityRemaining,
    flexibleRemaining,
    oceanEarned,
    oceanRemaining,
    aiEarned,
    aiRemaining,
    serviceLearningRequiredTerms,
    serviceLearningCompletedTerms,
    serviceLearningRemainingTerms,
    recognizedTotal,
    requiredTotal,
    remainingTotal,
    domains,
    unknownCourses,
    countedCourses,
    eligibleDomains,
  }
}
