import { describe, expect, it } from 'vitest'
import { parseStoredExternalCompetitions } from './externalCompetitionStorage'

describe('external competition storage', () => {
  it('keeps valid CYCU competition entries for the next app launch', () => {
    const items = parseStoredExternalCompetitions(JSON.stringify([{
      id: 'cycu-15556',
      title: 'U-start 競賽徵件',
      publishedAt: '2026-08-04',
      source: '中原大學創新創業發展中心',
      url: 'https://cyie.cycu.edu.tw/u-start-18/',
    }]))

    expect(items).toHaveLength(1)
    expect(items[0].id).toBe('cycu-15556')
  })

  it('drops malformed, off-domain, and broken cache data', () => {
    expect(parseStoredExternalCompetitions(JSON.stringify([{
      id: 'cycu-bad',
      title: '不可信連結',
      publishedAt: '2026-08-04',
      source: '未知',
      url: 'https://example.com/competition',
    }]))).toEqual([])
    expect(parseStoredExternalCompetitions('{broken')).toEqual([])
  })
})
