// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  buildMidtermWithdrawalQueryBody,
  estimateMidtermWithdrawalRate,
  lookupMidtermWithdrawal,
  normalizeMidtermWithdrawalCourseTitle,
  normalizeMidtermWithdrawalInstructor,
  parseMidtermWithdrawalHtml,
  parseMidtermWithdrawalSemesterOptions,
} from './midtermWithdrawal'

const semesterPickerHtml = `
  <form method="post" action="./course.aspx?u=13">
    <input type="hidden" name="__EVENTTARGET" value="" />
    <input type="hidden" name="__EVENTARGUMENT" value="" />
    <input type="hidden" name="__VIEWSTATE" value="view-state" />
    <input type="hidden" name="__EVENTVALIDATION" value="event-validation" />
    <table id="DataList1">
      <tr>
        <td><a title="1142" href="javascript:__doPostBack(&#39;DataList1$ctl00$LinkButton1&#39;,&#39;&#39;)">114學年度第2學期</a></td>
        <td><a title="1141" href="javascript:__doPostBack(&#39;DataList1$ctl01$LinkButton1&#39;,&#39;&#39;)">114學年度第1學期</a></td>
      </tr>
    </table>
    <span id="Label4"></span>
  </form>
`

const individualWithdrawalRowsHtml = `
  <main>
    <h1>114學年度第1學期期中退選名單</h1>
    <table id="WithdrawalGrid">
      <tr><th>系所名稱</th><th>學號</th><th>姓名</th><th>退選課號</th><th>退選課名</th><th>學分數</th></tr>
      <tr><td>機械與機電工程學系</td><td>00123456</td><td>私密學生甲</td><td>B1001</td><td>工程數學</td><td>3</td></tr>
      <tr><td>機械與機電工程學系</td><td>00987654</td><td>私密學生乙</td><td>B1001</td><td>工程數學</td><td>3</td></tr>
      <tr><td>海洋環境資訊系</td><td>00112233</td><td>私密學生丙</td><td>C2002</td><td>海洋資料分析</td><td>2</td></tr>
      <tr><td>機械與機電工程學系</td><td>00778899</td><td>私密學生戊</td><td></td><td>資料不完整</td><td>3</td></tr>
    </table>
  </main>
`

const fallbackWithdrawalRowsHtml = `
  <table>
    <tr><th>退選課名</th><th>授課教師</th></tr>
    <tr><td>材料 力學（一）</td><td>李美玲 老師</td></tr>
  </table>
`

describe('NTOU midterm-withdrawal parser', () => {
  it('extracts official ASP.NET semester postback targets and preserves hidden state', () => {
    expect(parseMidtermWithdrawalSemesterOptions(semesterPickerHtml)).toEqual([
      {
        semester: '114-2',
        label: '114學年度第2學期',
        eventTarget: 'DataList1$ctl00$LinkButton1',
      },
      {
        semester: '114-1',
        label: '114學年度第1學期',
        eventTarget: 'DataList1$ctl01$LinkButton1',
      },
    ])

    const body = new URLSearchParams(buildMidtermWithdrawalQueryBody(semesterPickerHtml, '114-1'))
    expect(body.get('__VIEWSTATE')).toBe('view-state')
    expect(body.get('__EVENTVALIDATION')).toBe('event-validation')
    expect(body.get('__EVENTTARGET')).toBe('DataList1$ctl01$LinkButton1')
    expect(body.get('__EVENTARGUMENT')).toBe('')
  })

  it('does not mistake the initial semester picker for a successful withdrawal query', () => {
    expect(parseMidtermWithdrawalHtml(semesterPickerHtml, '114-1')).toMatchObject({
      status: 'unavailable',
      querySucceeded: false,
      courses: [],
      reason: 'query_not_confirmed',
    })
  })

  it('aggregates individual withdrawal rows without retaining student names or IDs', () => {
    const result = parseMidtermWithdrawalHtml(individualWithdrawalRowsHtml, '1141')

    expect(result).toMatchObject({
      status: 'success',
      querySucceeded: true,
      semester: '114-1',
      ignoredRowCount: 1,
    })
    expect(result.courses).toHaveLength(2)
    expect(result.courses.find((course) => course.courseCode === 'B1001')).toMatchObject({
      key: '114-1:code:B1001',
      withdrawnCount: 2,
      matchStrategy: 'semester_course_code',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('00123456')
    expect(serialized).not.toContain('私密學生甲')
    expect(serialized).not.toContain('00987654')
  })

  it('accepts an already aggregated official withdrawal-count column', () => {
    const result = parseMidtermWithdrawalHtml(
      `
        <table>
          <tr><th>課程代碼</th><th>科目名稱</th><th>授課老師</th><th>退選人數</th></tr>
          <tr><td>D3003</td><td>流體力學</td><td>陳老師</td><td>4 人</td></tr>
        </table>
      `,
      '114-2',
    )

    expect(result.courses).toEqual([
      expect.objectContaining({ courseCode: 'D3003', withdrawnCount: 4 }),
    ])
  })

  it('uses course code first and only falls back to a normalized title plus instructor', () => {
    const result = parseMidtermWithdrawalHtml(individualWithdrawalRowsHtml, '114-1')

    expect(
      lookupMidtermWithdrawal(result, {
        semester: '114-1',
        courseCode: ' b1001 ',
        courseTitle: '完全不同的課',
        instructor: '不同教師',
      }),
    ).toMatchObject({ status: 'matched', withdrawnCount: 2, matchStrategy: 'semester_course_code' })

    const fallbackResult = parseMidtermWithdrawalHtml(fallbackWithdrawalRowsHtml, '114-1')
    expect(
      lookupMidtermWithdrawal(fallbackResult, {
        semester: '1141',
        courseTitle: '材料力學(一)',
        instructor: '李美玲',
      }),
    ).toMatchObject({
      status: 'matched',
      withdrawnCount: 1,
      matchStrategy: 'semester_course_title_instructor',
    })

    expect(
      lookupMidtermWithdrawal(result, {
        semester: '114-1',
        courseTitle: '工程數學',
      }),
    ).toMatchObject({ status: 'unavailable', reason: 'insufficient_course_identity' })
  })

  it('normalizes harmless title, spacing, teacher suffix, and teacher-order differences', () => {
    expect(normalizeMidtermWithdrawalCourseTitle(' 材料 力學（一） ')).toBe(
      normalizeMidtermWithdrawalCourseTitle('材料力學(一)'),
    )
    expect(normalizeMidtermWithdrawalInstructor('陳大華老師、王小明')).toBe(
      normalizeMidtermWithdrawalInstructor('王小明, 陳大華'),
    )
  })

  it('treats an explicit no-data response as a successful query, allowing a confirmed 0', () => {
    const result = parseMidtermWithdrawalHtml(
      '<main><h1>114學年度第2學期期中退選名單</h1><span id="Label4">查無退選資料</span></main>',
      '114-2',
    )
    const lookup = lookupMidtermWithdrawal(result, {
      semester: '114-2',
      courseCode: 'B1001',
    })

    expect(result.querySucceeded).toBe(true)
    expect(lookup).toEqual({
      status: 'confirmed_none',
      withdrawnCount: 0,
      matchStrategy: 'successful_query_no_match',
    })
    expect(estimateMidtermWithdrawalRate(lookup, 30)).toMatchObject({
      status: 'estimated',
      label: '退選率',
      rate: 0,
      ratePercent: 0,
    })
  })

  it('does not turn a partially parsed official table into a false 0%', () => {
    const partial = parseMidtermWithdrawalHtml(`
      <h1>114學年度第2學期期中退選名單</h1>
      <table>
        <tr><th>課號</th><th>課名</th><th>授課教師</th><th>退選人數</th></tr>
        <tr><td>B1001</td><td>工程數學</td><td>王老師</td><td>2</td></tr>
        <tr><td></td><td></td><td></td><td>格式異常</td></tr>
      </table>
    `, '114-2')

    expect(partial.ignoredRowCount).toBe(1)
    expect(lookupMidtermWithdrawal(partial, {
      semester: '114-2',
      courseCode: 'B1001',
    })).toMatchObject({ status: 'matched', withdrawnCount: 2 })
    expect(lookupMidtermWithdrawal(partial, {
      semester: '114-2',
      courseCode: 'B9999',
    })).toEqual({
      status: 'unavailable',
      withdrawnCount: null,
      reason: 'query_not_confirmed',
    })
  })

  it('calculates only the documented midterm-withdrawal estimate formula', () => {
    const estimate = estimateMidtermWithdrawalRate(
      { status: 'matched', withdrawnCount: 4, matchStrategy: 'semester_course_code' },
      36,
    )

    expect(estimate).toEqual({
      status: 'estimated',
      label: '退選率',
      withdrawnCount: 4,
      finalOrCurrentEnrollmentCount: 36,
      estimatedEnrollmentBeforeMidtermWithdrawal: 40,
      rate: 0.1,
      ratePercent: 10,
      formula: 'withdrawn/(final_or_current+withdrawn)',
      caveat: '依官方退選紀錄與退選後課程人數計算。',
    })
  })

  it('returns unavailable instead of inventing 0% when either data source is missing', () => {
    const unconfirmedLookup = lookupMidtermWithdrawal(
      parseMidtermWithdrawalHtml(semesterPickerHtml, '114-1'),
      { semester: '114-1', courseCode: 'B1001' },
    )

    expect(estimateMidtermWithdrawalRate(unconfirmedLookup, 30)).toEqual({
      status: 'unavailable',
      label: '退選率',
      reason: 'query_not_confirmed',
    })
    expect(
      estimateMidtermWithdrawalRate(
        { status: 'matched', withdrawnCount: 4, matchStrategy: 'semester_course_code' },
        null,
      ),
    ).toEqual({
      status: 'unavailable',
      label: '退選率',
      reason: 'missing_final_or_current_enrollment',
    })
  })

  it('does not report 0% for an empty denominator', () => {
    expect(
      estimateMidtermWithdrawalRate(
        { status: 'confirmed_none', withdrawnCount: 0, matchStrategy: 'successful_query_no_match' },
        0,
      ),
    ).toEqual({
      status: 'unavailable',
      label: '退選率',
      reason: 'empty_denominator',
    })

    expect(
      estimateMidtermWithdrawalRate(
        { status: 'matched', withdrawnCount: 0, matchStrategy: 'semester_course_code' },
        30,
      ),
    ).toEqual({
      status: 'unavailable',
      label: '退選率',
      reason: 'invalid_withdrawal_count',
    })
  })
})
