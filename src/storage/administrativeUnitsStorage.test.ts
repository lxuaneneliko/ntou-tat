import { describe, expect, it } from 'vitest'
import { parseAdministrativeCacheStore } from './administrativeUnitsStorage'

describe('administrative unit cache', () => {
  it('keeps official posts and removes off-domain data', () => {
    const store = parseAdministrativeCacheStore(JSON.stringify({
      'student-activities': {
        overview: {
          siteId: 'student-activities',
          fetchedAt: '2026-08-27T00:00:00.000Z',
          categories: [{ id: 'student-activities-news', label: '最新消息' }],
          navigation: [
            { id: 'student-links', label: '常用連結', children: [
              { id: 'student-form', label: '表格下載', url: 'https://forms.example.com/student', children: [] },
              { id: 'student-bad', label: '不安全連結', url: 'javascript:alert(1)', children: [] },
            ] },
          ],
        },
        postsByCategory: {
          'student-activities-news': [
            { id: 'one', title: '社團活動公告', publishedAt: '2026-08-27', url: 'https://stu.ntou.edu.tw/p/406-1023-1.php' },
            { id: 'bad', title: '外站資料', publishedAt: '2026-08-27', url: 'https://example.com/ad' },
          ],
        },
        savedAt: '2026-08-27T00:00:00.000Z',
      },
    }))

    expect(store['student-activities'].postsByCategory['student-activities-news']).toHaveLength(1)
    expect(store['student-activities'].postsByCategory['student-activities-news'][0].title).toBe('社團活動公告')
    expect(store['student-activities'].overview.navigation[0].children).toHaveLength(1)
    expect(store['student-activities'].overview.navigation[0].children[0].url).toBe('https://forms.example.com/student')
  })

  it('drops unknown units and malformed JSON', () => {
    expect(parseAdministrativeCacheStore('{')).toEqual({})
    expect(parseAdministrativeCacheStore(JSON.stringify({ unknown: { overview: { siteId: 'unknown', categories: [] }, postsByCategory: {}, savedAt: '' } }))).toEqual({})
  })
})
