import { describe, expect, it } from 'vitest'
import {
  buildAisGradeDetailPostbackBody,
  buildAisGradeDetailRequest,
  parseAisGrades,
} from './gradesParser'

describe('AIS grade parser', () => {
  it('maps an AIS semester-grade table', () => {
    const html = `
      <table>
        <tr><td>課號</td><td>課名</td><td>學分</td><td>選別</td><td>學期成績</td></tr>
        <tr><td>CODE2001</td><td>海洋學</td><td>3</td><td>必修</td><td>86</td></tr>
        <tr><td>CODE2002</td><td>游泳</td><td>1</td><td>選修</td><td>通過</td></tr>
      </table>
    `
    expect(parseAisGrades(html, '114-2')).toEqual([
      expect.objectContaining({
        courseId: 'CODE2001',
        courseTitle: '海洋學',
        credits: 3,
        score: 86,
        required: true,
      }),
      expect.objectContaining({
        courseId: 'CODE2002',
        letter: '通過',
        score: null,
      }),
    ])
  })

  it('returns empty data when no grade table exists', () => {
    expect(parseAisGrades('<main>查無資料</main>', '114-2')).toEqual([])
  })

  it('parses a grade table without a course code column', () => {
    const html = `
      <table>
        <tr><th>科目</th><th>學分數</th><th>修別</th><th>分數</th></tr>
        <tr><td>海洋科學</td><td>2</td><td>必</td><td>88</td></tr>
      </table>
    `

    expect(parseAisGrades(html, '114-2')).toEqual([
      expect.objectContaining({
        courseTitle: '海洋科學',
        credits: 2,
        required: true,
        score: 88,
      }),
    ])
  })

  it('builds the AIS detail request from the student result row', () => {
    const html = `
      <script>var viewpage = "GRD5010_02.aspx";</script>
      <table id="DataGrid">
        <tr><th></th><th>學號</th></tr>
        <tr>
          <td>
            <a href="#this" onclick="doEdit1_2(this, 'STNO|S0000001', 'Detail')">詳</a>
          </td>
          <td>S0000001</td>
        </tr>
      </table>
    `

    const detail = buildAisGradeDetailRequest(
      html,
      'https://ais.ntou.edu.tw/Application/GRD/GRD50/GRD5010_01.aspx',
    )
    expect(detail?.url).toBe(
      'https://ais.ntou.edu.tw/Application/GRD/GRD50/GRD5010_02.aspx',
    )
    expect(new URLSearchParams(detail?.body).get('Mode')).toBe('DETAIL')
    expect(new URLSearchParams(detail?.body).get('STNO')).toBe('S0000001')
  })

  it('builds the automatic ReQuery postback for the detail page', () => {
    const html = `
      <form action="./GRD5010_02.aspx" method="post">
        <input type="hidden" name="__VIEWSTATE" value="state-value">
        <input type="hidden" name="__EVENTTARGET" value="">
        <input type="hidden" name="__EVENTARGUMENT" value="">
      </form>
      <script>__doPostBack('ReQuery','');</script>
    `

    const body = new URLSearchParams(buildAisGradeDetailPostbackBody(html))
    expect(body.get('__VIEWSTATE')).toBe('state-value')
    expect(body.get('__EVENTTARGET')).toBe('ReQuery')
    expect(body.get('__EVENTARGUMENT')).toBe('')
  })

  it('keeps only rows from the selected academic semester', () => {
    const html = `
      <table id="DataGrid">
        <tr><th>學年期</th><th>課號</th><th>課程名稱</th><th>學分數</th><th>選別</th><th>學期總成績</th></tr>
        <tr><td>1141</td><td>A001</td><td>第一學期課程</td><td>2</td><td>必修</td><td>82</td></tr>
        <tr><td>1142</td><td>A002</td><td>第二學期課程</td><td>3</td><td>選修</td><td>91</td></tr>
      </table>
    `

    expect(parseAisGrades(html, '114-1')).toEqual([
      expect.objectContaining({
        courseId: 'A001',
        semester: '114-1',
      }),
    ])
    expect(parseAisGrades(html, '114-2')).toEqual([
      expect.objectContaining({
        courseId: 'A002',
        semester: '114-2',
      }),
    ])
    expect(parseAisGrades(html, '115-1')).toEqual([])
  })

  it('does not treat enrolled courses with blank marks as released grades', () => {
    const html = `
      <table id="DataGrid">
        <tr><th>學年期</th><th>課程名稱</th><th>學分數</th><th>學期總成績</th></tr>
        <tr><td>1151</td><td>尚未結算課程</td><td>3</td><td></td></tr>
      </table>
    `

    expect(parseAisGrades(html, '115-1')).toEqual([])
  })
})
