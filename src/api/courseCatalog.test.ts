import { describe, expect, it } from 'vitest'
import {
  buildCourseCatalogQueryBody,
  decodeCourseCatalogHtml,
  filterCourseCatalogOfferings,
  parseCourseCatalogDetail,
  parseCourseCatalogResults,
  parseWebFormsHiddenFields,
} from './courseCatalog'

const searchHtml = `
  <form>
    <input name="__VIEWSTATE" type="hidden" value="state&amp;token">
    <input type="hidden" value="validation" name="__EVENTVALIDATION">
    <input type="hidden" name="QUERY_TYPE" value="1">
    <input type="radio" name="radioButtonQuery" value="0" checked>
    <input type="radio" name="radioButtonQuery" value="1">
    <select name="Q_AYEAR"><option value="114" selected>114</option></select>
    <select name="Q_SMS"><option value="1" selected>1</option></select>
    <input name="PC$PageSize" id="PC_PageSize" value="20">
    <input name="PC$PageNo" id="PC_PageNo" value="2">
    <span id="PC_TotalPage">4</span>
    <span id="PC_TotalRow">61</span>
    <table id="DataGrid">
      <tr>
        <th>序號</th><th>學期</th><th>課號</th><th>課名</th><th>開課單位</th>
        <th>年級班別</th><th>授課老師</th><th>老師單位</th><th>學分</th><th>選別</th>
        <th>人數</th><th>人數限制上/下限</th><th>實習</th><th>時數</th><th>合開</th><th>期限</th>
      </tr>
      <tr>
        <td>1</td><td>1141</td><td>ME123</td>
        <td><a href="javascript:fn_open('90001')">流體&nbsp;力學 &amp; 實務</a></td>
        <td>機械與機電工程學系</td><td>2A</td><td>王老師</td><td>機械系</td>
        <td>3</td><td>必修</td><td>42</td><td>60 / 5</td><td>否</td><td>3</td><td>否</td><td>單學期</td>
      </tr>
      <tr>
        <td>2</td><td>114-1</td><td>NTUT001</td>
        <td><a href="javascript:__doPostBack(&quot;DataGrid$ctl03$COSID&quot;,&quot;&quot;)">跨校設計</a></td>
        <td>校際選課（臺北聯合大學系統）</td><td></td><td>陳老師</td><td>外校</td>
        <td>2</td><td>選修</td><td>—</td><td>30／0</td><td>V</td><td>2</td><td>是</td><td></td>
      </tr>
    </table>
  </form>
`

const detailHtml = `
  <form>
    <span id="M_AYEARSMS">1042</span>
    <span id="M_COSID">M3701CAG</span>
    <span id="CH_LESSON">海洋休閒與管理</span>
    <span id="M_ENG_LESSON">Marine Recreation &amp; Management</span>
    <span id="M_FACULTY_NAME">海洋事務與資源管理研究所碩士班</span>
    <span id="M_LECTR_TCH_CH">邱文彥</span>
    <span id="M_GRADE">1A</span>
    <span id="M_CRD">3</span><span id="M_LECTR_HOUR">3</span>
    <span id="M_MAX_ST">10</span><span id="M_MIN_ST">1</span>
    <span id="M_CHOICE_QTY">6</span><span id="M_MUST">選修</span>
    <span id="M_COSTERM">單學期</span><span id="M_CLASS_LAB">否</span>
    <span id="M_IS_CROSS_FACULTY_MERGE">否</span><span id="M_COS_ENGLISH_FG">否</span>
    <span id="M_IS_MAST_DOCTOR_MERGE">是</span>
    <span id="M_IS_LONGDIST_CURRI">否</span>
    <span id="M_MAIN_NAME">海洋管理</span><span id="M_CHILD_NAME">海洋觀光</span>
    <span id="TCH_NAME_LIST">林老師、陳老師</span>
    <span id="L_CORE_ABILITY">海洋政策分析</span>
    <span id="M_SEG">302,303,304</span><span id="M_CLSSRM_ID">GH1209, GH1209, GH1209</span>
    <span id="M_DESCRIPTION">課程正式說明</span><span id="M_RMK">限一年級</span>
    <span id="M_CH_TARGET">認識海洋觀光，並思考規劃&amp;管理。</span>
    <span id="M_ENG_TARGET">Learn marine recreation.</span>
    <span id="M_CH_PREOBJ">無</span>
    <span id="M_CH_OBJECT">第一週<br>第二週 &mdash; 案例</span>
    <span id="M_CH_TEACH">講授與討論</span>
    <span id="M_CH_REF">參考書一<br>參考書二</span>
    <span id="M_CH_TEACHSCH">Week 1 總論<br>Week 2 戶外教學</span>
    <span id="M_CH_TYPE">出席 20%<br>期末報告 80%</span>
    <span id="L_SUSTAINABLE_DEVE_GOAL">SDG 4 優質教育、SDG 14 保育海洋生態</span>
    <span id="L_TRAIT_DOMAIN">海洋永續</span>
    <span id="M_DOWNLOAD_ADDR">https://ais.ntou.edu.tw/syllabus.pdf?a=1&amp;b=2</span>
  </form>
`

describe('NTOU course catalog parser', () => {
  it('decodes Big5 bytes and common HTML entities', () => {
    const big5 = new Uint8Array([0xbd, 0xd2, 0xb5, 0x7b, 0xac, 0x64, 0xb8, 0xdf])
    expect(decodeCourseCatalogHtml(big5, 'text/html; charset=cp950')).toBe('課程查詢')
  })

  it('keeps WebForms state and builds keyword, teacher, and pagination requests', () => {
    expect(parseWebFormsHiddenFields(searchHtml)).toEqual({
      __VIEWSTATE: 'state&token',
      __EVENTVALIDATION: 'validation',
      QUERY_TYPE: '1',
    })

    const keyword = new URLSearchParams(buildCourseCatalogQueryBody(searchHtml, {
      semesterId: '113-2',
      courseCode: 'ME123',
      source: 'ntou',
      match: 'exact',
      pageSize: 50,
    }))
    expect(keyword.get('__VIEWSTATE')).toBe('state&token')
    expect(keyword.get('Q_AYEAR')).toBe('113')
    expect(keyword.get('Q_SMS')).toBe('2')
    expect(keyword.get('Q_CH_LESSON')).toBe('ME123')
    expect(keyword.get('radioButtonClass')).toBe('0')
    expect(keyword.get('radioButtonQuery')).toBe('0')
    expect(keyword.get('QUERY_TYPE')).toBe('2')
    expect(keyword.get('QUERY_BTN7')).toBe('查詢')
    expect(keyword.get('PC$PageSize')).toBe('50')

    const teacher = new URLSearchParams(buildCourseCatalogQueryBody(searchHtml, {
      semesterId: '1141',
      instructor: '王老師',
      instructorDepartment: '0702',
      page: 3,
    }))
    expect(teacher.get('Q_TCH_FACULTY_CODE')).toBe('0702')
    expect(teacher.get('Q_LECTR_TCH_CH')).toBe('王老師')
    expect(teacher.get('Q_CH_LESSON')).toBe('王老師')
    expect(teacher.get('radioButtonClass')).toBe('2')
    expect(teacher.get('QUERY_TYPE')).toBe('2')
    expect(teacher.get('hdnSelectedTab')).toBe('1')
    expect(teacher.get('__EVENTTARGET')).toBe('ReQuery')
    expect(teacher.get('PC$PageNo')).toBe('3')
    expect(teacher.has('QUERY_BTN4')).toBe(false)

    const title = new URLSearchParams(buildCourseCatalogQueryBody(searchHtml, {
      courseTitle: '工程數學',
    }))
    expect(title.get('Q_CH_LESSON')).toBe('工程數學')
    expect(title.get('radioButtonClass')).toBe('1')
    expect(title.get('QUERY_TYPE')).toBe('2')
    expect(title.get('QUERY_BTN7')).toBe('查詢')
  })

  it('parses historical offerings, pagination, empty counts, and intercollegiate source', () => {
    const result = parseCourseCatalogResults(searchHtml)
    expect(result).toMatchObject({ page: 2, pageSize: 20, totalPages: 4, totalItems: 61 })
    expect(result.items).toHaveLength(2)
    expect(result.items[0]).toMatchObject({
      id: '90001',
      pkno: '90001',
      detailPostback: '',
      semesterId: '114-1',
      courseCode: 'ME123',
      title: '流體 力學 & 實務',
      enrolledCount: 42,
      maximumStudents: 60,
      minimumStudents: 5,
      internship: false,
      crossListed: false,
      source: 'ntou',
    })
    expect(result.items[0].detailUrl).toContain('PKNO=90001')
    expect(result.items[1]).toMatchObject({
      pkno: '',
      detailPostback: 'DataGrid$ctl03$COSID',
      enrolledCount: null,
      maximumStudents: 30,
      minimumStudents: 0,
      internship: true,
      crossListed: true,
      source: 'intercollegiate',
    })
    expect(result.items[1].detailUrl).toBe('')

    expect(filterCourseCatalogOfferings(result.items, {
      courseCode: 'ntut',
      instructor: '陳',
      source: 'intercollegiate',
      semesterId: '1141',
    })).toEqual([result.items[1]])

    expect(filterCourseCatalogOfferings(result.items, {
      department: '0909',
      semesterId: '1141',
    })).toEqual(result.items)
  })

  it('parses course metadata and multiline syllabus content without raw markup', () => {
    const detail = parseCourseCatalogDetail(detailHtml, '121996713')
    expect(detail).toMatchObject({
      id: '121996713',
      pkno: '121996713',
      semesterId: '104-2',
      courseCode: 'M3701CAG',
      title: '海洋休閒與管理',
      englishTitle: 'Marine Recreation & Management',
      credits: 3,
      enrolledCount: 6,
      maximumStudents: 10,
      minimumStudents: 1,
      allEnglish: false,
      masterDoctorCombined: true,
      meetingTimes: ['302', '303', '304'],
      classrooms: ['GH1209', 'GH1209', 'GH1209'],
      objectiveZh: '認識海洋觀光，並思考規劃&管理。',
      contentZh: '第一週\n第二週 — 案例',
      evaluationZh: '出席 20%\n期末報告 80%',
      deliveryMode: '否',
      mainField: '海洋管理',
      subField: '海洋觀光',
      coInstructors: '林老師、陳老師',
      coreCompetencies: '海洋政策分析',
      characteristicField: '海洋永續',
      notes: '課程正式說明\n限一年級',
      sustainableDevelopmentGoals: 'SDG 4 優質教育、SDG 14 保育海洋生態',
      referenceUrl: 'https://ais.ntou.edu.tw/syllabus.pdf?a=1&b=2',
      source: 'ntou',
      detailPostback: '',
    })
    expect(detail.downloadUrl).toBe('https://ais.ntou.edu.tw/syllabus.pdf?a=1&b=2')
    expect(detail.detailUrl).toContain('PKNO=121996713')
  })

  it('uses official detail fields and ignores speculative legacy aliases', () => {
    const live = parseCourseCatalogDetail(`
      <span id="M_COSID">TEST01</span>
      <span id="CH_LESSON">測試課程</span>
      <span id="M_IS_LONGDIST_CURRI">聯盟線上課程</span>
      <span id="M_DESCRIPTION">第一段說明<br>第二段說明</span>
      <span id="M_RMK">限本系學生</span>
      <span id="M_NOTE">不應蓋過正式說明</span>
      <span id="M_AUDIENCE">不應顯示的授課對象</span>
    `)
    expect(live.deliveryMode).toBe('聯盟線上課程')
    expect(live.notes).toBe('第一段說明\n第二段說明\n限本系學生')
    expect(live.audience).toBe('')

    const legacy = parseCourseCatalogDetail(`
      <span id="M_COSID">TEST02</span>
      <span id="CH_LESSON">舊欄位課程</span>
      <span id="M_COURSE_TYPE">實體</span>
      <span id="M_NOTE">舊版說明</span>
      <span id="M_REMARK">舊版備註</span>
    `)
    expect(legacy.deliveryMode).toBe('')
    expect(legacy.notes).toBe('')
  })

  it('prefers the explicitly labelled official reference URL over a download address', () => {
    const detail = parseCourseCatalogDetail(`
      <span id="M_COSID">TEST03</span>
      <span id="CH_LESSON">參考網址測試</span>
      <span id="M_DOWNLOAD_ADDR">https://ais.ntou.edu.tw/download.pdf</span>
      <table><tr><th>參考網址</th><td><a href="https://example.edu.tw/course">課程網站</a></td></tr></table>
    `)

    expect(detail.referenceUrl).toBe('https://example.edu.tw/course')
    expect(detail.downloadUrl).toBe('https://ais.ntou.edu.tw/download.pdf')
  })
})
