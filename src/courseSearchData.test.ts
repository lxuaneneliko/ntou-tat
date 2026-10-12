import { describe, expect, it } from 'vitest'
import type { CourseSearchRequest } from './CourseSearchScreen'
import {
  COURSE_CURRENT_QUERY_URL,
  COURSE_HISTORY_QUERY_URL,
  type CourseCatalogDetail,
  type CourseCatalogOffering,
} from './api/courseCatalog'
import {
  buildCourseCatalogQueries,
  createCourseSearchDataSource,
  courseSearchRequirementLabel,
  courseSearchSourceForOffering,
  courseDetailMatchesOffering,
  currentCourseSemesterId,
  findCourseDetailPkno,
  formatCourseDetailMeetings,
  parseCourseFacultyOptions,
  parseCourseScheduleWeeks,
  searchOfflineCourseOfferings,
  selectMatchingCourseOffering,
  type CourseSearchDataDependencies,
} from './courseSearchData'
import {
  createOfflineCourseDetailLoader,
  type OfflineCourseCatalog,
} from './offlineCourseCatalog'

const offering = (overrides: Partial<CourseCatalogOffering> = {}): CourseCatalogOffering => ({
  id: 'course-1',
  pkno: '',
  semesterId: '115-1',
  courseCode: 'ME3301',
  title: '機械設計',
  department: '機械與機電工程學系',
  className: '三年級',
  instructor: '林老師',
  instructorDepartment: '機械與機電工程學系',
  credits: 3,
  requirement: '選修',
  enrolledCount: 42,
  maximumStudents: 55,
  minimumStudents: 5,
  internship: false,
  hours: 3,
  crossListed: false,
  term: '全學期',
  source: 'ntou',
  detailUrl: '',
  detailPostback: 'DataGrid$ctl02$COSID',
  ...overrides,
})

const request = (overrides: Partial<CourseSearchRequest> = {}): CourseSearchRequest => ({
  query: '機械',
  semester: '1151',
  source: 'all',
  scope: 'all',
  degree: 'all',
  selection: 'all',
  page: 1,
  pageSize: 20,
  ...overrides,
})

const detailFor = (course: CourseCatalogOffering): CourseCatalogDetail => ({
  ...course,
  englishTitle: 'Offline course detail',
  allEnglish: false,
  masterDoctorCombined: false,
  meetingTimes: ['203'],
  classrooms: ['MEB226'],
  deliveryMode: '否',
  audience: '',
  mainField: '',
  subField: '',
  coInstructors: '',
  coreCompetencies: '',
  characteristicField: '',
  notes: '',
  objectiveZh: '離線教學目標',
  objectiveEn: '',
  prerequisitesZh: '',
  prerequisitesEn: '',
  contentZh: '離線教材內容',
  contentEn: '',
  teachingMethodZh: '講授',
  teachingMethodEn: '',
  referencesZh: '',
  referencesEn: '',
  scheduleZh: '',
  scheduleEn: '',
  evaluationZh: '',
  evaluationEn: '',
  sustainableDevelopmentGoals: '',
  referenceUrl: '',
  downloadUrl: '',
})

describe('course-search data adapter', () => {
  it('does not reuse a cached detail from another class or department', () => {
    const base = offering({ className: '機械三A', department: '機械與機電工程學系' })
    const detail = {
      ...base,
      englishTitle: '', allEnglish: null, masterDoctorCombined: null,
      meetingTimes: [], classrooms: [], deliveryMode: '', audience: '', notes: '',
      mainField: '', subField: '', coInstructors: '', coreCompetencies: '', characteristicField: '',
      objectiveZh: '', objectiveEn: '', prerequisitesZh: '', prerequisitesEn: '',
      contentZh: '', contentEn: '', teachingMethodZh: '', teachingMethodEn: '',
      referencesZh: '', referencesEn: '', scheduleZh: '', scheduleEn: '',
      evaluationZh: '', evaluationEn: '', sustainableDevelopmentGoals: '', referenceUrl: '', downloadUrl: '',
    }
    expect(courseDetailMatchesOffering(detail, base)).toBe(true)
    expect(courseDetailMatchesOffering(detail, { ...base, className: '機械三B' })).toBe(false)
    expect(courseDetailMatchesOffering(detail, { ...base, department: '電機工程學系' })).toBe(false)
  })

  it('does not downgrade a detail lookup to another class with the same course code', () => {
    const expected = offering({ courseCode: 'ME3301', className: '機械三A', instructor: '林老師' })
    const anotherClass = offering({
      id: 'another', courseCode: 'ME3301', className: '機械三B', instructor: '林老師',
    })
    expect(selectMatchingCourseOffering([anotherClass], expected)).toBeUndefined()
    expect(selectMatchingCourseOffering([{ ...expected, id: 'exact' }, anotherClass], expected))
      .toMatchObject({ id: 'exact', className: '機械三A' })
  })


  it('searches a completed offline semester with fuzzy tokens and filters without AIS requests', async () => {
    const snapshotOffering = offering({
      id: 'offline-1',
      pkno: '13579',
      semesterId: '114-2',
      courseCode: 'ME360751',
      title: '智慧型控制',
      instructor: '鄭一中',
      department: '機械與機電工程學系',
    }) as CourseCatalogOffering & { degree: '0' }
    snapshotOffering.degree = '0'
    const catalog: OfflineCourseCatalog = {
      version: 1,
      generatedAt: '2026-09-10T00:00:00.000Z',
      semesters: ['114-2'],
      items: [snapshotOffering],
    }
    expect(searchOfflineCourseOfferings(catalog, request({
      semester: '1142',
      query: '智控 鄭一',
    }))).toEqual([snapshotOffering])
    expect(searchOfflineCourseOfferings(catalog, request({
      semester: '1142',
      query: '智慧',
      degree: 'master',
    }))).toEqual([])

    let networkCalls = 0
    const data = createCourseSearchDataSource(false, {
      offlineCatalogLoader: async () => catalog,
      courseRequest: async () => {
        networkCalls += 1
        throw new Error('offline search must not contact AIS')
      },
      now: () => Date.parse('2026-09-10T00:00:00Z'),
    })
    const result = await data.searchCourses(request({ semester: '1142', query: '機械 鄭一' }))
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({ title: '智慧型控制', teacher: '鄭一中' })
    expect(networkCalls).toBe(0)
  })

  it.each([
    {
      label: 'returns null',
      offlineCatalogLoader: async () => null,
    },
    {
      label: 'throws while decoding',
      offlineCatalogLoader: async () => {
        throw new Error('broken bundled catalog')
      },
    },
  ])('does not contact a school server when the offline catalog loader $label', async ({
    offlineCatalogLoader,
  }) => {
    let schoolRequests = 0
    const source = createCourseSearchDataSource(false, {
      offlineCatalogLoader,
      courseRequest: async () => {
        schoolRequests += 1
        throw new Error('must stay offline')
      },
      publicRequest: async () => {
        schoolRequests += 1
        throw new Error('must stay offline')
      },
    })

    await expect(source.searchCourses(request())).rejects.toThrow(
      'App 內建課程資料目前無法載入',
    )
    expect(schoolRequests).toBe(0)
  })

  it.each([
    {
      label: 'is missing',
      bytes: null as Uint8Array | null,
      expectedMessage: '這門課的官方課綱未包含在本版離線資料中',
    },
    {
      label: 'cannot be parsed',
      bytes: new TextEncoder().encode('not a course-detail shard'),
      expectedMessage: '',
    },
  ])('does not contact a school server when the offline detail shard $label', async ({
    bytes,
    expectedMessage,
  }) => {
    const snapshotOffering = offering()
    const catalog: OfflineCourseCatalog = {
      version: 1,
      generatedAt: '2026-09-10T00:00:00.000Z',
      semesters: ['115-1'],
      items: [snapshotOffering],
      detailShards: {
        algorithm: 'fnv1a32',
        shardCount: 1,
        shards: [{
          id: '00',
          path: 'data/test-course-detail-shard.json.gz.bin',
          detailCount: 1,
        }],
      },
    }
    let schoolRequests = 0
    const source = createCourseSearchDataSource(false, {
      offlineCatalogLoader: async () => catalog,
      offlineDetailLoader: createOfflineCourseDetailLoader(async () => bytes),
      courseRequest: async () => {
        schoolRequests += 1
        throw new Error('must stay offline')
      },
      publicRequest: async () => {
        schoolRequests += 1
        throw new Error('must stay offline')
      },
    })

    const result = await source.searchCourses(request({ query: snapshotOffering.courseCode }))
    expect(result.items).toHaveLength(1)
    if (expectedMessage) {
      await expect(source.getCourseDetail(result.items[0])).rejects.toThrow(expectedMessage)
    } else {
      await expect(source.getCourseDetail(result.items[0])).rejects.toBeInstanceOf(Error)
    }
    expect(schoolRequests).toBe(0)
  })

  it('returns unavailable without contacting academics when bundled withdrawal data is unavailable', async () => {
    const snapshotOffering = offering({
      semesterId: '114-2',
      courseCode: 'ME3301',
      enrolledCount: 30,
    })
    const catalog: OfflineCourseCatalog = {
      version: 1,
      generatedAt: '2026-09-10T00:00:00.000Z',
      semesters: ['114-2'],
      items: [snapshotOffering],
      withdrawals: {
        version: 1,
        semesters: {
          '114-2': {
            querySucceeded: false,
            status: 'unavailable',
            courses: [],
            ignoredRowCount: 0,
            reason: 'query_not_confirmed',
          },
        },
      },
    }
    let schoolRequests = 0
    const source = createCourseSearchDataSource(false, {
      offlineCatalogLoader: async () => catalog,
      courseRequest: async () => {
        schoolRequests += 1
        throw new Error('must stay offline')
      },
      publicRequest: async () => {
        schoolRequests += 1
        throw new Error('must stay offline')
      },
    })

    const result = await source.searchCourses(request({
      semester: '1142',
      query: snapshotOffering.courseCode,
    }))
    await expect(source.getWithdrawalEstimate(result.items[0])).resolves.toMatchObject({
      status: 'unavailable',
      explanation: '此學期沒有可用的官方退選資料。',
    })
    expect(schoolRequests).toBe(0)
  })

  it('searches every bundled semester locally and sorts newer semesters first', async () => {
    const newer = offering({
      id: 'newer', pkno: '200', semesterId: '114-2', title: '智慧型控制', instructor: '鄭老師',
    }) as CourseCatalogOffering & { degree: '0' }
    newer.degree = '0'
    const older = offering({
      id: 'older', pkno: '100', semesterId: '112-1', title: '智慧控制導論', instructor: '王老師',
    }) as CourseCatalogOffering & { degree: '0' }
    older.degree = '0'
    const catalog: OfflineCourseCatalog = {
      version: 1,
      generatedAt: '2026-09-10T00:00:00.000Z',
      semesters: ['114-2', '112-1'],
      items: [older, newer],
    }
    const data = createCourseSearchDataSource(false, {
      offlineCatalogLoader: async () => catalog,
      courseRequest: async () => { throw new Error('all-semester search must stay offline') },
    })
    const result = await data.searchCourses(request({ semester: '', query: '智控', pageSize: 1 }))
    expect(result).toMatchObject({ total: 2, page: 1, pageSize: 1, hasNextPage: true })
    expect(result.items[0]).toMatchObject({ id: expect.stringContaining('114-2'), title: '智慧型控制' })
    const byTeacher = await data.searchCourses(request({
      semester: '', query: '鄭老', scope: 'teacher', pageSize: 20,
    }))
    expect(byTeacher.items.map((item) => item.id)).toEqual([expect.stringContaining('114-2')])
    const byUnit = await data.searchCourses(request({
      semester: '', query: '機械系', scope: 'unit', pageSize: 20,
    }))
    expect(byUnit.total).toBe(2)
    await expect(data.searchCourses(request({ semester: '', query: '' }))).rejects.toThrow(
      '請輸入關鍵字，或至少選擇一項來源、學制或選別篩選',
    )
    const filtered = await data.searchCourses(request({
      semester: '',
      query: '',
      selection: 'elective',
      pageSize: 20,
    }))
    expect(filtered.total).toBe(2)
  })

  it('opens sharded details and computes bundled withdrawal rates without any school request', async () => {
    const multiA = offering({
      id: 'multi-a', semesterId: '114-2', courseCode: 'B32031JO', title: '共同課程',
      instructor: '甲老師', className: 'A班', enrolledCount: 37,
    })
    const multiB = offering({
      id: 'multi-b', semesterId: '114-2', courseCode: 'B32031JO', title: '共同課程',
      instructor: '乙老師', className: 'B班', enrolledCount: 23,
    })
    const single = offering({
      id: 'single', semesterId: '114-2', courseCode: 'B7203B35', title: '單班課程',
      instructor: '丙老師', className: 'A班', enrolledCount: 23,
    })
    const catalog: OfflineCourseCatalog = {
      version: 2,
      generatedAt: '2026-09-10T00:00:00.000Z',
      complete: true,
      range: { from: '113-1', to: '115-1' },
      semesters: ['115-1', '114-2'],
      items: [multiA, multiB, single],
      withdrawals: {
        version: 1,
        semesters: {
          '114-2': {
            querySucceeded: true,
            status: 'success',
            courses: [
              {
                key: '114-2:code:B32031JO', semester: '114-2', courseCode: 'B32031JO',
                courseTitle: null, instructor: null, withdrawnCount: 10,
                matchStrategy: 'semester_course_code',
              },
              {
                key: '114-2:code:B7203B35', semester: '114-2', courseCode: 'B7203B35',
                courseTitle: null, instructor: null, withdrawnCount: 7,
                matchStrategy: 'semester_course_code',
              },
            ],
            ignoredRowCount: 0,
          },
          '115-1': {
            querySucceeded: false,
            status: 'unavailable',
            courses: [],
            ignoredRowCount: 0,
            reason: 'query_not_confirmed',
          },
        },
      },
    }
    let schoolRequests = 0
    const source = createCourseSearchDataSource(false, {
      offlineCatalogLoader: async () => catalog,
      offlineDetailLoader: async (_catalog, course) => detailFor(course),
      courseRequest: async () => {
        schoolRequests += 1
        throw new Error('must stay offline')
      },
      publicRequest: async () => {
        schoolRequests += 1
        throw new Error('must stay offline')
      },
      now: () => Date.parse('2026-09-10T00:00:00Z'),
    })

    const multiResult = await source.searchCourses(request({ semester: '1142', query: 'B32031JO' }))
    expect(multiResult.items).toHaveLength(2)
    await expect(source.getCourseDetail(multiResult.items[0])).resolves.toMatchObject({
      description: '離線教材內容',
      meetings: [{ time: '週二 10:20–11:10', classroom: 'MEB226' }],
    })
    await expect(source.getWithdrawalEstimate(multiResult.items[0])).resolves.toMatchObject({
      status: 'estimated',
      midtermWithdrawalCount: 10,
      initialEnrollment: 70,
      finalEnrollment: 60,
      ratePercent: 10 / 70 * 100,
      explanation: '同課號 2 班合計，包含其他授課教師。',
    })

    const singleResult = await source.searchCourses(request({ semester: '1142', query: 'B7203B35' }))
    await expect(source.getWithdrawalEstimate(singleResult.items[0])).resolves.toMatchObject({
      status: 'estimated',
      midtermWithdrawalCount: 7,
      initialEnrollment: 30,
      finalEnrollment: 23,
      ratePercent: 70 / 3,
      explanation: '依官方退選資料與單班人數計算。',
    })

    const zero = await source.searchCourses(request({ semester: '1151', query: '不存在的課' }))
    expect(zero).toMatchObject({ items: [], total: 0 })
    await expect(source.searchCourses(request({ semester: '1121', query: '工程數學' })))
      .rejects.toThrow('內建離線課程僅提供 113-1～115-1')
    expect(schoolRequests).toBe(0)
  })

  it('does not combine enrollment when one course code has conflicting titles', async () => {
    const selected = offering({
      id: 'conflict-a', semesterId: '114-2', courseCode: 'SAME01', title: '課程甲',
      instructor: '甲老師', enrolledCount: 20,
    })
    const conflict = offering({
      id: 'conflict-b', semesterId: '114-2', courseCode: 'SAME01', title: '課程乙',
      instructor: '乙老師', enrolledCount: 10,
    })
    const catalog: OfflineCourseCatalog = {
      version: 2,
      generatedAt: '2026-09-10T00:00:00.000Z',
      semesters: ['114-2'],
      items: [selected, conflict],
      withdrawals: {
        version: 1,
        semesters: {
          '114-2': {
            querySucceeded: true,
            status: 'success',
            courses: [{
              key: '114-2:code:SAME01', semester: '114-2', courseCode: 'SAME01',
              courseTitle: null, instructor: null, withdrawnCount: 2,
              matchStrategy: 'semester_course_code',
            }],
            ignoredRowCount: 0,
          },
        },
      },
    }
    const source = createCourseSearchDataSource(false, { offlineCatalogLoader: async () => catalog })
    await expect(source.getWithdrawalEstimate({
      id: 'selected', semester: '1142', source: 'ntou', code: 'SAME01', title: '課程甲',
      unit: '測試系', teacher: '甲老師', credits: 3,
    })).resolves.toMatchObject({ status: 'unavailable' })
  })

  it('parses official faculty select options and uses unit codes for a unit search', () => {
    const faculties = parseCourseFacultyOptions(`
      <select id="Q_FACULTY_CODE" name="Q_FACULTY_CODE">
        <option value="">請選擇</option>
        <option value="0210">機械與機電工程學系</option>
        <option value="0909">校際選課（臺北聯合大學系統）</option>
      </select>
    `)
    expect(faculties).toEqual([
      { value: '0210', label: '機械與機電工程學系' },
      { value: '0909', label: '校際選課(臺北聯合大學系統)' },
    ])
    expect(buildCourseCatalogQueries(request({ scope: 'unit' }), faculties)).toEqual([
      expect.objectContaining({ semesterId: '115-1', department: '0210', mode: 'department' }),
    ])
  })

  it('queries title and teacher independently for an all-field keyword', () => {
    const queries = buildCourseCatalogQueries(request({ query: '王小明' }), [])
    expect(queries).toEqual(expect.arrayContaining([
      expect.objectContaining({ courseTitle: '王小明' }),
      expect.objectContaining({ instructor: '王小明' }),
    ]))
  })

  it('uses official special-unit codes for Taipei-alliance browsing', () => {
    const queries = buildCourseCatalogQueries(request({ query: '', source: 'taipei-alliance' }), [])
    expect(queries.map((query) => query.department)).toEqual(['0909', '0929', '0939'])
  })

  it('includes domestic, overseas, liberal-arts, PE, and language exchange units', () => {
    const queries = buildCourseCatalogQueries(request({ query: '', source: 'other-exchange' }), [])
    expect(queries.map((query) => query.department)).toEqual([
      '0907', '0908', '0927', '0928', '0937', '0938', '040U', '0910', '0911', '0912',
    ])
  })

  it('routes dates to the NTOU academic semester and normalizes A/B requirements', () => {
    expect(currentCourseSemesterId(Date.parse('2026-09-10T00:00:00Z'))).toBe('115-1')
    expect(currentCourseSemesterId(Date.parse('2027-01-10T00:00:00Z'))).toBe('115-1')
    expect(currentCourseSemesterId(Date.parse('2027-03-10T00:00:00Z'))).toBe('115-2')
    expect(courseSearchRequirementLabel('A')).toBe('必修')
    expect(courseSearchRequirementLabel('B-選修')).toBe('選修')
  })

  it('distinguishes alliance online, Taipei alliance, other exchange, and NTOU offerings', () => {
    expect(courseSearchSourceForOffering(offering({ title: '聯盟線上海洋資料分析' }))).toBe('online-alliance')
    expect(courseSearchSourceForOffering(offering({
      title: '遠距海洋資料分析',
      department: '校際選課（臺北聯合大學系統）',
    }))).toBe('online-alliance')
    expect(courseSearchSourceForOffering(offering({ department: '校際選課（臺北聯合大學系統）' }))).toBe('taipei-alliance')
    expect(courseSearchSourceForOffering(offering({ department: '校際選課', source: 'intercollegiate' }))).toBe('other-exchange')
    expect(courseSearchSourceForOffering(offering())).toBe('ntou')
  })

  it('groups adjacent official period codes and preserves classrooms', () => {
    expect(formatCourseDetailMeetings(['311', '312', '514'], ['NAV210', 'NAV210', '線上'])).toEqual([
      { time: '週三 18:30–20:10', classroom: 'NAV210' },
      { time: '週五 21:10–22:00', classroom: '線上' },
    ])
  })

  it('extracts an encoded PKNO and parses numbered weekly schedules', () => {
    expect(findCourseDetailPkno(
      '/mainframe_open.aspx?mainPage=.%2FApplication%2FTKE%2FTKE22%2FTKE2240_03.aspx%3FPKNO%3D136156881%23',
    )).toBe('136156881')
    expect(parseCourseScheduleWeeks('1. 課程介紹\n第 2 週：需求分析\n沒有週次的附註')).toEqual([
      { week: 1, topic: '課程介紹' },
      { week: 2, topic: '需求分析' },
    ])
    expect(parseCourseScheduleWeeks('Week 01-04：基礎理論 Week 05-10：案例實作')).toEqual([
      { week: '1–4', topic: '基礎理論' },
      { week: '5–10', topic: '案例實作' },
    ])
    expect(parseCourseScheduleWeeks('第一～三週 課程導論\n第四週 感測器實作\n第十一至十二週 系統整合')).toEqual([
      { week: '1–3', topic: '課程導論' },
      { week: 4, topic: '感測器實作' },
      { week: '11–12', topic: '系統整合' },
    ])
  })

  it('keeps current and historical WebForms requests on their matching endpoints', async () => {
    const html = (current: boolean) => `
      <form>
        <input type="hidden" name="__VIEWSTATE" value="state">
        <input type="hidden" name="${current ? 'Q_AYEARSMS' : 'Q_AYEAR'}" value="${current ? '1151' : '114'}">
        <select id="Q_FACULTY_CODE" name="Q_FACULTY_CODE"><option value="0702">機械與機電工程學系</option></select>
        <input name="PC$PageSize" value="200"><input name="PC$PageNo" value="1">
        <span id="PC_TotalPage">1</span><span id="PC_TotalRow">0</span>
        <table id="DataGrid"><tr><th>序號</th><th>學期</th><th>課號</th><th>課名</th><th>開課單位</th></tr></table>
      </form>
    `
    type CourseRequest = NonNullable<CourseSearchDataDependencies['courseRequest']>
    const calls: Array<{ url: string; method: string }> = []
    const courseRequest: CourseRequest = async (options) => {
      calls.push({ url: options.url, method: options.method ?? 'GET' })
      const current = options.url.includes('TKE2211') || options.url.includes('TKE2215')
      return { status: 200, data: html(current), headers: {}, url: options.url }
    }
    const now = () => Date.parse('2026-09-10T00:00:00Z')

    const currentData = createCourseSearchDataSource(false, {
      courseRequest, now, allowNetworkCatalogFallback: true,
    })
    await currentData.searchCourses(request({ semester: '1151', query: '工程數學' }))
    const currentPosts = calls.filter((call) => call.method === 'POST')
    expect(currentPosts.length).toBeGreaterThan(0)
    expect(currentPosts.every((call) => call.url === COURSE_CURRENT_QUERY_URL)).toBe(true)

    calls.length = 0
    const historyData = createCourseSearchDataSource(false, {
      courseRequest, now, allowNetworkCatalogFallback: true,
    })
    await historyData.searchCourses(request({ semester: '1142', query: '工程數學' }))
    const historyPosts = calls.filter((call) => call.method === 'POST')
    expect(historyPosts.length).toBeGreaterThan(0)
    expect(historyPosts.every((call) => call.url === COURSE_HISTORY_QUERY_URL)).toBe(true)
  })
})
