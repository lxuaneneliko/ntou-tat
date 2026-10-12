import { describe, expect, it } from 'vitest'
import { filterCampusActivities } from './campusActivities'
import { parseCampusBulletins } from './campusBulletinData'

const now = Date.parse('2030-10-10T08:00:00Z')
const raw = { id: 'school', clubId: null, title: 'AI 工作坊', organizer: '圖書館', category: '講座', location: '海大', description: '入門課程', startsAt: '2030-10-12T00:00:00Z', endsAt: '2030-10-13T00:00:00Z', datePrecision: 'date', sourceUrl: 'https://www.ntou.edu.tw/' }
const items = parseCampusBulletins([raw, { ...raw, id: 'club', clubId: 'maker', title: '３Ｄ 列印社課', organizer: '創客社', category: '社課', startsAt: '2030-10-11T00:00:00Z' }, { ...raw, id: 'unknown', clubId: undefined }], now)
describe('campus activity listing', () => {
  it('orders by date without mutating the shared bulletin feed', () => {
    const original = [...items]
    expect(filterCampusActivities(items, 'all', '', '', now).map((item) => item.id)).toEqual(['club', 'school', 'unknown'])
    expect(items).toEqual(original)
  })
  it('distinguishes campus and club sources, without misclassifying old cache', () => {
    expect(filterCampusActivities(items, 'campus', '', '', now).map((item) => item.id)).toEqual(['school'])
    expect(filterCampusActivities(items, 'club', '', '', now).map((item) => item.id)).toEqual(['club'])
  })
  it('combines source, type and all search words across public fields', () => {
    expect(filterCampusActivities(items, 'campus', '講座', 'ai 圖書館 入門 海大', now).map((item) => item.id)).toEqual(['school'])
    expect(filterCampusActivities(items, 'club', '講座', '', now)).toEqual([])
    expect(filterCampusActivities(items, 'all', '', 'AI 不存在', now)).toEqual([])
  })
  it('normalizes case and full-width text and tolerates blank queries', () => {
    expect(filterCampusActivities(items, 'all', '', '3d', now).map((item) => item.id)).toEqual(['club'])
    expect(filterCampusActivities(items, 'all', '', '  \n  ', now)).toHaveLength(3)
  })
  it('removes expired records even after the page has loaded', () => {
    expect(filterCampusActivities(items, 'all', '', '', Date.parse(raw.endsAt))).toEqual([])
  })
})
