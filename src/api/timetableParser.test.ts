import { describe, expect, it } from 'vitest'
import { buildAisCourseQueryBody, parseAisPersonalTimetable } from './timetableParser'

const queryHtml = `
  <form id="QUERY">
    <input type="hidden" name="__VIEWSTATE" value="state" />
    <input type="hidden" name="M_STNO" value="private-student-id" />
    <input name="PC$PageSize" value="10" />
    <select name="Q_AYEAR"><option value="113" selected>113</option></select>
    <select name="Q_SMS"><option value="1" selected>1</option></select>
  </form>
`

const courseListHtml = `
  <table id="DataGrid">
    <tr><td>序號</td><td>學期</td><td>課號</td><td>課名</td><td>開課單位</td><td>班別</td><td>授課老師</td><td>老師單位</td><td>學分</td></tr>
    <tr><td>1</td><td>1142</td><td>CODE1001</td><td>海洋資料分析</td><td>海洋系</td><td>一A</td><td>林老師</td><td>海洋系</td><td>3</td></tr>
  </table>
`

const timetableHtml = `
  <table id="table2">
    <tr><td></td><td>星期一</td><td>星期二</td><td>星期三</td><td>星期四</td><td>星期五</td><td>星期六</td><td>星期日</td></tr>
    <tr><td>第0節 06:20~08:10</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td>第一節 08:20~09:10</td><td></td><td><a>海洋資料分析<br>CODE1001<br>海洋系<br>3<br>INS101</a></td><td></td><td></td><td></td><td></td><td></td></tr>
    <tr><td>第二節 09:20~10:10</td><td></td><td><a>海洋資料分析<br>CODE1001<br>海洋系<br>3<br>INS101</a></td><td></td><td></td><td></td><td></td><td></td></tr>
  </table>
`

describe('AIS personal timetable parser', () => {
  it('builds the selected semester query without changing private form state', () => {
    const body = new URLSearchParams(buildAisCourseQueryBody(queryHtml, '114-2', 'timetable'))

    expect(body.get('__VIEWSTATE')).toBe('state')
    expect(body.get('M_STNO')).toBe('private-student-id')
    expect(body.get('Q_AYEAR')).toBe('114')
    expect(body.get('Q_SMS')).toBe('2')
    expect(body.get('PC$PageSize')).toBe('200')
    expect(body.get('QUERY_BTN3')).toBe('選課課表')
    expect(body.has('QUERY_BTN1')).toBe(false)
  })

  it('maps weekday, period, course metadata, teacher and classroom', () => {
    const slots = parseAisPersonalTimetable(timetableHtml, courseListHtml)

    expect(slots).toHaveLength(2)
    expect(slots[0]).toMatchObject({
      courseCode: 'CODE1001',
      courseTitle: '海洋資料分析',
      instructor: '林老師',
      classroom: 'INS101',
      credits: 3,
      day: 2,
      section: '1',
      startsAt: '08:20',
      endsAt: '09:10',
    })
    expect(slots[1].section).toBe('2')
  })

  it('returns an empty result when AIS has no timetable table', () => {
    expect(parseAisPersonalTimetable('<main>目前無資料</main>', courseListHtml)).toEqual([])
  })
})
