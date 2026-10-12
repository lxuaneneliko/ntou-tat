import { describe, expect, it, vi } from 'vitest'
import { activeBulletins, bulletinDateLabel, bulletinExpiresAt, BULLETIN_CACHE_KEY, BULLETIN_CACHE_MAX_AGE, campusEventUrl, fetchCampusBulletins, parseCampusBulletins, readBulletinCache, safeCampusUrl, shuffleBulletins, writeBulletinCache } from './campusBulletinData'

const now = Date.parse('2030-10-10T08:00:00Z')
const raw = { id: 'event-1', title: '水彩展', organizer: '藝文中心', category: '展覽', startsAt: '2030-10-10T16:00:00Z', endsAt: '2030-10-18T16:00:00Z', datePrecision: 'date', dateNote: '實際開放時段見公告', sourceUrl: 'https://art.ntou.edu.tw/p/406-test', location: '圖書館' }
describe('campus bulletin public data', () => {
  it('keeps valid active items, deduplicates and excludes expired / undated / malformed data', () => {
    const items = parseCampusBulletins([raw, raw, { ...raw, id: 'expired', startsAt: '2020-10-10T16:00:00Z', endsAt: '2020-10-18T16:00:00Z' }, { ...raw, id: 'undated', startsAt: null }, { ...raw, id: 'bad-zone', startsAt: '2030-10-10' }, { ...raw, id: 'bad-end', endsAt: 'not-a-date' }, { ...raw, id: 'inverted', endsAt: '2029-01-01T00:00:00Z' }], now)
    expect(items.map((item) => item.id)).toEqual(['event-1'])
    expect(activeBulletins(items, Date.parse(raw.endsAt))).toEqual([])
  })
  it('uses the same one-day expiry for items without an announced end', () => {
    const [item] = parseCampusBulletins([{ ...raw, endsAt: null }], now)
    expect(bulletinExpiresAt(item)).toBe(Date.parse(raw.startsAt) + 86400000)
    expect(activeBulletins([item], bulletinExpiresAt(item))).toEqual([])
  })
  it('rejects executable and credential-bearing URLs and creates an encoded public detail link', () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,test', 'https://user:secret@example.com', '//example.com']) expect(safeCampusUrl(url)).toBe('')
    expect(parseCampusBulletins([{ ...raw, sourceUrl: 'javascript:alert(1)' }], now)).toEqual([])
    const [item] = parseCampusBulletins([{ ...raw, id: 'id/with?query' }], now)
    expect(campusEventUrl(item)).toBe('https://ntou-campus.vercel.app/events/id%2Fwith%3Fquery')
    expect(safeCampusUrl('https://www.ntou.edu.tw/')).toBe('https://www.ntou.edu.tw/')
  })
  it('formats date-only events as dates with an exclusive end, never invented midnight times', () => {
    const [item] = parseCampusBulletins([raw], now)
    expect(bulletinDateLabel(item)).toBe('2030/10/11 – 2030/10/18')
    expect(bulletinDateLabel({ ...item, endsAt: '2030-10-11T16:00:00Z' })).toBe('2030/10/11')
    expect(bulletinDateLabel({ ...item, startsAt: '2030-10-11T06:30:00Z', endsAt: null, datePrecision: 'time' })).toContain('14:30')
  })
  it('accepts only recent public cache, filtering expired items even when offline', () => {
    const storage = new Map<string, string>(), writer = { setItem: (key: string, value: string) => storage.set(key, value) }, reader = { getItem: (key: string) => storage.get(key) ?? null }
    const items = parseCampusBulletins([raw], now)
    writeBulletinCache(writer, items, now)
    expect(readBulletinCache(reader, now)).toEqual(items)
    expect(readBulletinCache(reader, now + BULLETIN_CACHE_MAX_AGE + 1)).toEqual([])
    expect(readBulletinCache(reader, now - 1)).toEqual([])
    storage.set(BULLETIN_CACHE_KEY, '{')
    expect(readBulletinCache(reader, now)).toEqual([])
    expect(() => writeBulletinCache({ setItem: () => { throw new Error('full') } }, items, now)).not.toThrow()
  })
  it('paginates the read-only endpoint without cookies, AIS credentials or auth headers', async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ items: Array.from({ length: 100 }, (_, i) => ({ ...raw, id: 'event-' + i })), total: 101 })).mockResolvedValueOnce(Response.json({ items: [{ ...raw, id: 'last' }], total: 101 }))
    const signal = new AbortController().signal
    const items = await fetchCampusBulletins(signal, request)
    expect(items).toHaveLength(101)
    expect(request.mock.calls[1][0]).toContain('page=2')
    for (const [url, options] of request.mock.calls) {
      expect(String(url)).toContain('scope=all&status=active')
      expect(options).toEqual({ signal, credentials: 'omit', headers: { Accept: 'application/json' } })
    }
  })
  it('does not save failed or malformed responses as successful empty feeds', async () => {
    const signal = new AbortController().signal
    await expect(fetchCampusBulletins(signal, vi.fn<typeof fetch>().mockResolvedValue(Response.json({}, { status: 503 })))).rejects.toThrow('HTTP 503')
    await expect(fetchCampusBulletins(signal, vi.fn<typeof fetch>().mockResolvedValue(Response.json({ items: [], total: '0' })))).rejects.toThrow('Invalid campus feed')
    await expect(fetchCampusBulletins(signal, vi.fn<typeof fetch>().mockResolvedValue(Response.json({ items: [], total: 0 })))).resolves.toEqual([])
  })
  it('shuffles without dropping, repeating, or mutating announcements', () => {
    const items = parseCampusBulletins([raw, { ...raw, id: 'two' }, { ...raw, id: 'three' }], now)
    const original = [...items]
    expect(shuffleBulletins(items, () => 0).map((item) => item.id)).toEqual(['two', 'three', 'event-1'])
    expect(items).toEqual(original)
  })
})
