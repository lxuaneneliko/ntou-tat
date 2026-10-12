import { describe, expect, it } from 'vitest'
import type {
  CourseCatalogDetail,
  CourseCatalogOffering,
  CourseCatalogSearchResult,
} from '../api/courseCatalog'
import {
  COURSE_DETAIL_CACHE_LIMIT,
  COURSE_DETAIL_CACHE_TTL_MS,
  COURSE_SEARCH_CACHE_LIMIT,
  COURSE_SEARCH_CACHE_TTL_MS,
  courseCatalogDetailKey,
  courseCatalogQueryKey,
  parseCourseCatalogCacheStore,
  withCourseCatalogDetail,
  withCourseCatalogSearch,
} from './courseCatalogStorage'

const offering = (id = '90001'): CourseCatalogOffering => ({
  id,
  pkno: id,
  detailPostback: '',
  semesterId: '114-1',
  courseCode: `ME${id}`,
  title: '工程數學',
  department: '機械與機電工程學系',
  className: '2A',
  instructor: '王老師',
  instructorDepartment: '機械系',
  credits: 3,
  requirement: '必修',
  enrolledCount: 42,
  maximumStudents: 60,
  minimumStudents: 5,
  internship: false,
  hours: 3,
  crossListed: false,
  term: '單學期',
  source: 'ntou',
  detailUrl: `https://ais.ntou.edu.tw/detail?PKNO=${id}`,
})

const searchResult = (id = '90001'): CourseCatalogSearchResult => ({
  items: [offering(id)],
  page: 1,
  pageSize: 30,
  totalPages: 1,
  totalItems: 1,
})

const detail = (id = '90001'): CourseCatalogDetail => ({
  ...offering(id),
  englishTitle: 'Engineering Mathematics',
  allEnglish: false,
  meetingTimes: ['102', '103'],
  classrooms: ['MEB429'],
  deliveryMode: '實體',
  audience: '一般',
  mainField: '',
  subField: '',
  coInstructors: '',
  coreCompetencies: '',
  characteristicField: '',
  notes: '',
  objectiveZh: '建立工程數學基礎。',
  objectiveEn: '',
  prerequisitesZh: '微積分',
  prerequisitesEn: '',
  contentZh: '微分方程',
  contentEn: '',
  teachingMethodZh: '講授',
  teachingMethodEn: '',
  referencesZh: '',
  referencesEn: '',
  scheduleZh: '',
  scheduleEn: '',
  evaluationZh: '考試 100%',
  evaluationEn: '',
  sustainableDevelopmentGoals: '',
  referenceUrl: '',
  downloadUrl: '',
})

describe('course catalog cache', () => {
  it('keys a detail by the stable offering id even after its PKNO is resolved', () => {
    expect(courseCatalogDetailKey({ semesterId: '114-2', id: 'offering-a', pkno: '136156881' }))
      .toBe('114-2:offering-a')
  })

  it('uses a canonical key for equivalent trimmed and cased queries', () => {
    expect(courseCatalogQueryKey({ semesterId: ' 114-1 ', courseCode: ' ME123 ' })).toBe(
      courseCatalogQueryKey({ semesterId: '114-1', courseCode: 'me123' }),
    )
  })

  it('round-trips valid searches and details and drops expired or malformed entries', () => {
    const now = Date.UTC(2026, 8, 10, 0, 0, 0)
    const store = {
      version: 1,
      searches: [
        { key: 'fresh', savedAt: now - 1_000, result: searchResult() },
        { key: 'expired', savedAt: now - COURSE_SEARCH_CACHE_TTL_MS - 1, result: searchResult('old') },
        { key: 'bad', savedAt: now, result: { items: [{ title: 123 }] } },
        {
          key: 'legacy-without-postback',
          savedAt: now,
          result: {
            ...searchResult('legacy'),
            items: [{ ...offering('legacy'), detailPostback: undefined }],
          },
        },
      ],
      details: [
        { key: 'fresh-detail', savedAt: now - 1_000, detail: detail() },
        { key: 'expired-detail', savedAt: now - COURSE_DETAIL_CACHE_TTL_MS - 1, detail: detail('old') },
      ],
    }

    const parsed = parseCourseCatalogCacheStore(JSON.stringify(store), now)
    expect(parsed.searches.map((entry) => entry.key)).toEqual(['fresh'])
    expect(parsed.details.map((entry) => entry.key)).toEqual(['fresh-detail'])
    expect(parseCourseCatalogCacheStore('{broken', now)).toEqual({
      version: 1,
      searches: [],
      details: [],
    })
  })

  it('replaces duplicate entries and retains only the newest bounded history', () => {
    let store = parseCourseCatalogCacheStore(null)
    for (let index = 0; index < COURSE_SEARCH_CACHE_LIMIT + 4; index += 1) {
      store = withCourseCatalogSearch(
        store,
        { keyword: `課程 ${index}` },
        searchResult(String(10_000 + index)),
        1_000 + index,
      )
    }
    expect(store.searches).toHaveLength(COURSE_SEARCH_CACHE_LIMIT)
    expect(store.searches[0].savedAt).toBe(1_000 + COURSE_SEARCH_CACHE_LIMIT + 3)

    store = withCourseCatalogSearch(store, { keyword: '課程 5' }, searchResult('replacement'), 9_000)
    expect(store.searches).toHaveLength(COURSE_SEARCH_CACHE_LIMIT)
    expect(store.searches[0].result.items[0].id).toBe('replacement')

    for (let index = 0; index < COURSE_DETAIL_CACHE_LIMIT + 5; index += 1) {
      store = withCourseCatalogDetail(store, detail(String(20_000 + index)), 10_000 + index)
    }
    expect(store.details).toHaveLength(COURSE_DETAIL_CACHE_LIMIT)
    expect(store.details[0].detail.id).toBe(String(20_000 + COURSE_DETAIL_CACHE_LIMIT + 4))
  })
})
