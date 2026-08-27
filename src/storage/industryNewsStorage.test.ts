import { describe, expect, it } from 'vitest'
import { parseStoredIndustryNews } from './industryNewsStorage'

describe('industry news storage', () => {
  it('keeps valid official-list news for the next app launch', () => {
    const items = parseStoredIndustryNews(JSON.stringify([{
      id: 'ntou-industry-demo',
      title: '產學合作計畫徵件',
      publishedAt: '2026-06-11',
      source: '海大產學營運總中心',
      url: 'https://tlo.ntou.edu.tw/p/406-1082-126280,r1249.php?Lang=zh-tw',
    }]))

    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('ntou-industry-demo')
  })

  it('drops malformed, unsafe, and broken cache data', () => {
    expect(parseStoredIndustryNews(JSON.stringify([{
      id: 'ntou-industry-bad',
      title: '不可信連結',
      publishedAt: '2026-06-11',
      source: '海大產學營運總中心',
      url: 'javascript:alert(1)',
    }]))).toEqual([])
    expect(parseStoredIndustryNews('{broken')).toEqual([])
  })
})
