// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import graduationCurriculaSnapshot from '../data/graduationCurricula.json'
import { DEPARTMENT_SITES } from './departmentSites'
import {
  buildGraduationCurriculumQueryBody,
  getBundledGraduationCurriculum,
  getBundledGraduationCurriculumOptions,
  GRADUATION_DEPARTMENT_CODES,
  parseGraduationElectiveConstraints,
  parseGraduationCurriculum,
} from './graduationRequirements'

const fixture = `
  <html><body>
    <form>
      <input type="hidden" name="__VIEWSTATE" value="state-token">
      <input type="hidden" name="__EVENTVALIDATION" value="event-token">
      <select name="Q_ENROLL_AYEAR"><option selected value="115">115</option></select>
    </form>
    <div>國立臺灣海洋大學 資訊工程學系 必修科目表( 114 學年度入學生適用)</div>
    <div>本系修業學年為 4 年;入學身份: 一般生</div>
    <table id="DataGrid1">
      <tr><th>科目類別</th><th>科目名稱</th><th>學分數</th><th>跨領域數</th><th colspan="10">學年</th><th>備註</th></tr>
      <tr><td rowspan="2">共同教育課程</td><td>人工智慧概論<br>B9M01024</td><td>2</td><td>不限</td>${'<td></td>'.repeat(10)}<td>共同必修</td></tr>
      <tr><td>游泳畢業門檻<br>B92A12P5</td><td>0</td><td>不限</td>${'<td></td>'.repeat(10)}<td>完成五十公尺</td></tr>
      <tr><td colspan="2">共同教育課程學分小計</td><td>28</td>${'<td></td>'.repeat(12)}</tr>
      <tr><td rowspan="2">系訂專業必修</td><td>程式設計<br>B5701M33</td><td>3</td><td>不限</td>${'<td></td>'.repeat(10)}<td></td></tr>
      <tr><td>28-資工系專題(一)<br></td><td>3</td><td>不限</td>${'<td></td>'.repeat(10)}<td></td></tr>
      <tr><td colspan="2">系訂專業必修學分小計</td><td>50</td>${'<td></td>'.repeat(12)}</tr>
      <tr><td rowspan="1">系訂主領域必修及選修</td><td>23-機械系主領域<br></td><td>12</td><td>不限</td>${'<td></td>'.repeat(10)}<td>主領域至少12學分</td></tr>
      <tr><td colspan="2">必修總學分數</td><td colspan="13">78</td></tr>
      <tr><td colspan="2">選修最低學分數</td><td colspan="13">57</td></tr>
      <tr><td colspan="2">畢業最低學分數</td><td colspan="13">135</td></tr>
      <tr><td colspan="2">選修最低學分數備註</td><td colspan="13">系內選修至少 46 學分。</td></tr>
      <tr><td colspan="2">備註</td><td colspan="13">體育不列入畢業學分。</td></tr>
    </table>
  </body></html>
`

describe('graduation requirements', () => {
  it('covers every one of the 22 undergraduate departments', () => {
    expect(DEPARTMENT_SITES).toHaveLength(22)
    expect(Object.keys(GRADUATION_DEPARTMENT_CODES).sort())
      .toEqual(DEPARTMENT_SITES.map((site) => site.id).sort())
  })

  it('ships official curriculum snapshots for all departments and uses only prior-year fallback', () => {
    const mechanical = getBundledGraduationCurriculum('me', 114)
    expect(mechanical).toMatchObject({ requestedYear: 114, sourceYear: 114, fallbackUsed: false })
    expect(mechanical?.requirements.length).toBeGreaterThan(20)

    const tourism115 = getBundledGraduationCurriculum('dotm', 115)
    expect(tourism115).toMatchObject({ requestedYear: 115, sourceYear: 114, fallbackUsed: true })

    expect(getBundledGraduationCurriculum('dme', 110)).toBeNull()
    expect(getBundledGraduationCurriculumOptions('dme', 110).map((option) => option.programVariantName))
      .toEqual(['能源應用組', '動力工程組'])
    expect(getBundledGraduationCurriculum('dme', 110, '060A'))
      .toMatchObject({ requestedYear: 110, sourceYear: 110, programVariantName: '能源應用組' })
    expect(DEPARTMENT_SITES.every((department) =>
      getBundledGraduationCurriculum(department.id as keyof typeof GRADUATION_DEPARTMENT_CODES, 114),
    )).toBe(true)
  })

  it('validates every stored official curriculum snapshot', () => {
    expect(graduationCurriculaSnapshot.metadata).toMatchObject({
      departmentCount: 22,
      requestedCombinationCount: 242,
      storedCombinationCount: 234,
      missingCombinationCount: 8,
    })
    const curricula = [
      ...Object.values(graduationCurriculaSnapshot.curricula),
      ...Object.values(graduationCurriculaSnapshot.curriculumVariants).flat(),
    ]
    expect(curricula).toHaveLength(246)
    curricula.forEach((curriculum) => {
      expect(curriculum.sourceYear).toBe(curriculum.requestedYear)
      expect(curriculum.graduationMinimumCredits).toBeGreaterThan(0)
      expect(curriculum.requirements.length).toBeGreaterThan(20)
    })
  })

  it('builds the official AIS curriculum query', () => {
    const body = new URLSearchParams(buildGraduationCurriculumQueryBody(fixture, 'cse', 114))
    expect(body.get('__VIEWSTATE')).toBe('state-token')
    expect(body.get('Q_ENROLL_AYEAR')).toBe('114')
    expect(body.get('Q_FACULTY_CODE')).toBe('0507')
    expect(body.get('Q_DEGREE_CODE')).toBe('0')
    expect(body.get('Q_ENROLL_ID')).toBe('01')
  })

  it('parses totals, course codes, categories, thresholds and notes', () => {
    const curriculum = parseGraduationCurriculum(fixture, 'cse', 115)!
    expect(curriculum.sourceYear).toBe(114)
    expect(curriculum.fallbackUsed).toBe(true)
    expect(curriculum.departmentName).toBe('資訊工程學系')
    expect(curriculum.durationYears).toBe(4)
    expect(curriculum.requiredCredits).toBe(78)
    expect(curriculum.electiveMinimumCredits).toBe(57)
    expect(curriculum.departmentElectiveMinimumCredits).toBe(46)
    expect(curriculum.outsideElectiveMaximumCredits).toBe(11)
    expect(curriculum.graduationMinimumCredits).toBe(135)
    expect(curriculum.commonRequiredCredits).toBe(28)
    expect(curriculum.departmentRequiredCredits).toBe(50)
    expect(curriculum.requirements.find((item) => item.title === '程式設計'))
      .toMatchObject({ category: '系訂專業必修', codes: ['B5701M33'], credits: 3, kind: 'course' })
    expect(curriculum.requirements.find((item) => item.title === '游泳畢業門檻')?.kind)
      .toBe('threshold')
    expect(curriculum.requirements.find((item) => item.title === '資工系專題(一)')?.codes)
      .toEqual([])
    expect(curriculum.requirements.find((item) => item.title === '機械系主領域')?.kind)
      .toBe('group')
    expect(curriculum.electiveNotes).toContain('46')
  })

  it('parses department and outside elective limits from different departments official-note wording', () => {
    expect(parseGraduationElectiveConstraints(
      18,
      '須含本系選修課程至少12學分',
      '需修習本系所開設之課程至少98學分，本系其他選修12學分。',
    )).toEqual({ departmentMinimumCredits: 12, outsideMaximumCredits: 6 })
    expect(parseGraduationElectiveConstraints(
      57,
      '系內選修至少 46 學分。',
      '',
    )).toEqual({ departmentMinimumCredits: 46, outsideMaximumCredits: 11 })
    expect(parseGraduationElectiveConstraints(
      30,
      '本系選修課程不得少於24學分，系外選修以6學分為限。',
      '',
    )).toEqual({ departmentMinimumCredits: 24, outsideMaximumCredits: 6 })
    expect(parseGraduationElectiveConstraints(20, '依系規辦理', ''))
      .toEqual({ departmentMinimumCredits: null, outsideMaximumCredits: null })
  })

  it('rejects a response without a curriculum table', () => {
    expect(parseGraduationCurriculum('<html>查無資料</html>', 'cse', 114)).toBeNull()
  })
})
