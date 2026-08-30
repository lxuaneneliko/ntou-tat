import { describe, expect, it } from 'vitest'
import {
  analyzeGeneralEducationProgress,
  generalEducationCourseKey,
  type GeneralEducationOverrides,
} from './generalEducation'
import type { Grade } from './types'

const grade = (
  courseTitle: string,
  credits = 2,
  semester = '114-1',
  category = '通',
  score: number | null = 80,
  letter?: string,
): Grade => ({
  id: `${semester}-${courseTitle}`,
  courseId: `unused-${courseTitle}`,
  courseTitle,
  semester,
  credits,
  score,
  letter,
  required: false,
  category,
})

describe('112-115 transcript-only general education progress', () => {
  it('uses the old or new official marker from a merged 113-1 course title by cohort', () => {
    const merged = [grade('漁村敘事探究（人格）〖跨域永續〗', 2, '113-1')]
    const oldSystem = analyzeGeneralEducationProgress(merged, 111)
    const newSystem = analyzeGeneralEducationProgress(merged, 112)

    expect(oldSystem.domainSystem).toBe('eight')
    expect(oldSystem.domains.find((domain) => domain.key === 'personality')?.recognized).toBe(2)
    expect(oldSystem.domains.find((domain) => domain.key === 'sustainability')).toBeUndefined()
    expect(newSystem.domainSystem).toBe('four')
    expect(newSystem.domains.find((domain) => domain.key === 'sustainability')?.recognized).toBe(2)
  })

  it('supports the eight-domain rules for 110 and 111 cohorts', () => {
    const progress = analyzeGeneralEducationProgress([
      grade('生命教育（人格）'),
      grade('法治與生活（民主）'),
      grade('全球公民（全球）'),
      grade('閱讀經典（經典）'),
      grade('藝術欣賞（美學）'),
      grade('科技倫理（科技）'),
      grade('自然探索（自然）'),
      grade('海洋史（歷史）'),
      grade('海洋科學概論'),
      grade('人工智慧概論'),
    ], 111)

    expect(progress.supported).toBe(true)
    expect(progress.domains).toHaveLength(8)
    expect(progress.domainRecognized).toBe(14)
    expect(progress.recognizedTotal).toBe(18)
    expect(progress.sustainabilityRemaining).toBe(0)
  })

  it('recognizes only the official four-domain title suffix', () => {
    const progress = analyzeGeneralEducationProgress([
      grade('台灣之美〖人文探索〗'),
      grade('基本人權專題〖社會脈動〗'),
      grade('微生物與疾病〖科技創新〗'),
      grade('漁村敘事探究（人格）〖跨域永續〗'),
    ], 114)

    expect(progress.domains.map((domain) => domain.recognized)).toEqual([2, 2, 2, 2])
    expect(progress.unknownCourses).toHaveLength(0)
  })

  it('recognizes the official marker before an A or B class suffix and deduplicates retakes', () => {
    const progress = analyzeGeneralEducationProgress([
      grade('海洋考古〖人文探索〗A', 2, '112-1'),
      grade('海洋考古〖人文探索〗B', 2, '113-1'),
    ], 112)

    const humanities = progress.domains.find((domain) => domain.key === 'humanities')!
    expect(humanities.earned).toBe(2)
    expect(humanities.courses[0].duplicateCount).toBe(2)
  })

  it('requires two passed service-learning semesters only for the 112 cohort', () => {
    const grades = [
      grade('服務學習', 0, '112-1', '服務學習', null, '通過'),
      grade('服務學習—愛校服務', 0, '112-2', '服務學習', null, '通過'),
      grade('服務學習', 0, '113-1', '服務學習', null, '未通過'),
    ]
    const cohort112 = analyzeGeneralEducationProgress(grades, 112)
    const cohort113 = analyzeGeneralEducationProgress(grades, 113)

    expect(cohort112.serviceLearningRequiredTerms).toBe(2)
    expect(cohort112.serviceLearningCompletedTerms).toBe(2)
    expect(cohort112.serviceLearningRemainingTerms).toBe(0)
    expect(cohort113.serviceLearningRequiredTerms).toBe(0)
    expect(cohort113.serviceLearningCompletedTerms).toBe(0)
  })

  it('auto-counts an explicit four-domain bracket marker without guessing from semantic words', () => {
    const progress = analyzeGeneralEducationProgress([
      grade('漁村敘事探究（人格）'),
      grade('跨域永續專題'),
      grade('某課程【人文探索】'),
    ], 115)

    expect(progress.domainRecognized).toBe(2)
    expect(progress.unknownCourses).toHaveLength(2)
    expect(progress.domains.find((domain) => domain.key === 'humanities')?.courses)
      .toHaveLength(1)
  })

  it('auto-counts the explicit domain markers shown by the AIS transcript', () => {
    const progress = analyzeGeneralEducationProgress([
      grade('藻類產業應用與永續利用【跨域永續】', 2, '114-2'),
      grade('原住民族人文與藝術【人文探索】', 2, '114-1'),
    ], 114)

    expect(progress.domainRecognized).toBe(4)
    expect(progress.sustainabilityRemaining).toBe(0)
    expect(progress.unknownCourses).toHaveLength(0)
  })

  it('keeps Ocean and AI requirements separate from the 14 domain credits', () => {
    const progress = analyzeGeneralEducationProgress([
      grade('海洋科學概論'),
      grade('人工智慧概論'),
      grade('永續發展EMI-海洋科學概論〖跨域永續〗'),
    ], 113)

    expect(progress.oceanEarned).toBe(2)
    expect(progress.aiEarned).toBe(2)
    expect(progress.domains.find((domain) => domain.key === 'sustainability')?.recognized).toBe(2)
    expect(progress.recognizedTotal).toBe(6)
  })

  it('caps each domain at four credits and reports the sustainability minimum separately', () => {
    const progress = analyzeGeneralEducationProgress([
      grade('A〖人文探索〗'),
      grade('B〖人文探索〗'),
      grade('C〖人文探索〗'),
      grade('D〖社會脈動〗', 4),
      grade('E〖科技創新〗'),
    ], 114)

    const humanities = progress.domains.find((domain) => domain.key === 'humanities')!
    expect(humanities.earned).toBe(6)
    expect(humanities.recognized).toBe(4)
    expect(progress.domainRecognized).toBe(10)
    expect(progress.domainRemaining).toBe(4)
    expect(progress.sustainabilityRemaining).toBe(2)
    expect(progress.flexibleRemaining).toBe(2)
  })

  it('ignores failed attempts and counts a repeated passed title once', () => {
    const progress = analyzeGeneralEducationProgress([
      grade('海洋故事〖人文探索〗', 2, '113-1', '通', 55),
      grade('海洋故事〖人文探索〗', 2, '113-2', '通', 82),
      grade('海洋故事〖人文探索〗', 2, '114-1', '通', 90),
    ], 113)

    const humanities = progress.domains.find((domain) => domain.key === 'humanities')!
    expect(humanities.earned).toBe(2)
    expect(humanities.courses[0].duplicateCount).toBe(2)
  })

  it('allows an ambiguous transcript title to be manually assigned or ignored', () => {
    const ambiguous = grade('海港城市與文化', 2, '114-1', '博雅')
    const key = generalEducationCourseKey(ambiguous)
    const assigned: GeneralEducationOverrides = { [key]: 'humanities' }
    const ignored: GeneralEducationOverrides = { [key]: 'ignore' }

    expect(analyzeGeneralEducationProgress([ambiguous], 114, assigned).domainRecognized).toBe(2)
    expect(analyzeGeneralEducationProgress([ambiguous], 114, ignored).unknownCourses).toHaveLength(0)
  })

  it('applies one manual decision to every repeated transcript row with the same title', () => {
    const first = grade('海港城市與文化', 2, '113-1', '博雅')
    const repeated = grade('海港城市與文化', 2, '114-1', '博雅')
    const ignored: GeneralEducationOverrides = {
      [generalEducationCourseKey(repeated)]: 'ignore',
    }

    const progress = analyzeGeneralEducationProgress([first, repeated], 114, ignored)
    expect(progress.unknownCourses).toHaveLength(0)
    expect(progress.domainRecognized).toBe(0)
  })

  it('does not treat exemption or rejected transfer labels as earned credit', () => {
    const progress = analyzeGeneralEducationProgress([
      grade('A〖人文探索〗', 2, '114-1', '通', null, '免修'),
      grade('B〖社會脈動〗', 2, '114-1', '通', null, '抵免'),
      grade('C〖科技創新〗', 2, '114-1', '通', null, '抵免未通過'),
      grade('D〖跨域永續〗', 2, '114-1', '通', null, '未抵免'),
    ], 114)

    expect(progress.domains.find((domain) => domain.key === 'humanities')?.recognized).toBe(0)
    expect(progress.domains.find((domain) => domain.key === 'society')?.recognized).toBe(2)
    expect(progress.domains.find((domain) => domain.key === 'technology')?.recognized).toBe(0)
    expect(progress.domains.find((domain) => domain.key === 'sustainability')?.recognized).toBe(0)
  })

  it('does not use courseId to infer or override a domain', () => {
    const misleadingId = {
      ...grade('沒有領域後綴的課', 2, '114-1', '通識'),
      courseId: 'HUMANITIES-OFFICIAL-LOOKING',
    }
    const sameIdDifferentTitles = [
      { ...grade('海洋文學〖人文探索〗'), courseId: 'SAME-ID' },
      { ...grade('社會創新〖社會脈動〗'), courseId: 'SAME-ID' },
    ]
    const progress = analyzeGeneralEducationProgress([
      misleadingId,
      ...sameIdDifferentTitles,
    ], 114)

    expect(progress.unknownCourses.map((course) => course.title)).toContain('沒有領域後綴的課')
    expect(progress.domains.find((domain) => domain.key === 'humanities')?.recognized).toBe(2)
    expect(progress.domains.find((domain) => domain.key === 'society')?.recognized).toBe(2)
  })

  it('requires the two named common courses to have the expected two credits', () => {
    const progress = analyzeGeneralEducationProgress([
      grade('海洋科學概論', 3),
      grade('人工智慧概論', 1),
    ], 114)

    expect(progress.oceanEarned).toBe(0)
    expect(progress.aiEarned).toBe(0)
    expect(progress.unknownCourses).toHaveLength(2)
  })

  it('keeps invalid transcript credit values out of the recognized total', () => {
    const progress = analyzeGeneralEducationProgress([
      grade('壞資料〖人文探索〗', Number.NaN),
    ], 114)

    expect(progress.domainRecognized).toBe(0)
    expect(progress.unknownCourses).toHaveLength(1)
  })
})
