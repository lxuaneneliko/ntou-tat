import { describe, expect, it } from 'vitest'
import { parseDepartmentCacheStore } from './departmentSitesStorage'

describe('department site cache', () => {
  it('keeps valid official posts and removes off-domain data', () => {
    const store = parseDepartmentCacheStore(JSON.stringify({
      cse: {
        overview: { siteId: 'cse', fetchedAt: '2026-08-26T00:00:00.000Z', categories: [{ id: 'cse-1112', label: '學業資訊' }] },
        postsByCategory: {
          'cse-1112': [
            { id: 'one', title: '選課公告', publishedAt: '2026-08-25', url: 'https://cse.ntou.edu.tw/p/406-1063-1.php' },
            { id: 'bad', title: '廣告', publishedAt: '2026-08-25', url: 'https://example.com/ad' },
          ],
        },
        savedAt: '2026-08-26T00:00:00.000Z',
      },
    }))

    expect(store.cse.postsByCategory['cse-1112']).toHaveLength(1)
    expect(store.cse.postsByCategory['cse-1112'][0].title).toBe('選課公告')
  })

  it('drops unknown departments and malformed JSON', () => {
    expect(parseDepartmentCacheStore('{')).toEqual({})
    expect(parseDepartmentCacheStore(JSON.stringify({ unknown: { overview: { siteId: 'unknown', categories: [] }, postsByCategory: {}, savedAt: '' } }))).toEqual({})
  })
})
