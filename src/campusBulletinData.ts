// Public campus announcements only. Never send school credentials to this service.
export const CAMPUS_API = 'https://ntou-campus-api.ntou-campus.workers.dev'
export const CAMPUS_SITE = 'https://ntou-campus.vercel.app'
export const BULLETIN_CACHE_KEY = 'ntou-campus-bulletins-v1'
export const BULLETIN_CACHE_MAX_AGE = 24 * 60 * 60 * 1000
export const BULLETIN_REFRESH_MS = 10 * 60 * 1000

export type CampusBulletinItem = {
  id: string; title: string; organizer: string; category: string; description: string
  startsAt: string; endsAt: string | null; datePrecision: 'date' | 'time'; dateNote: string
  location: string; audience: string; sourceUrl: string; registrationUrl: string | null
  registrationEndsAt: string | null
  clubId?: string | null
}
type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem'>
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown, max = 300) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const date = (value: unknown) => typeof value === 'string' && /(Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null
export const safeCampusUrl = (value: unknown): string => {
  try {
    const url = new URL(text(value, 2000))
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
export const bulletinExpiresAt = (item: CampusBulletinItem) => Date.parse(item.endsAt || item.startsAt) + (item.endsAt ? 0 : 86400000)
export const activeBulletins = (items: CampusBulletinItem[], now = Date.now()) => items.filter((item) => bulletinExpiresAt(item) > now)
export function parseCampusBulletins(value: unknown, now = Date.now()): CampusBulletinItem[] {
  if (!Array.isArray(value)) return []
  const items = new Map<string, CampusBulletinItem>()
  for (const raw of value.slice(0, 500)) {
    if (!record(raw)) continue
    const startsAt = date(raw.startsAt), endsAt = date(raw.endsAt), id = text(raw.id, 160), title = text(raw.title)
    if (!id || !title || !startsAt || (raw.endsAt != null && !endsAt) || (endsAt && Date.parse(endsAt) <= Date.parse(startsAt))) continue
    const sourceUrl = safeCampusUrl(raw.sourceUrl)
    if (!sourceUrl) continue
    const item: CampusBulletinItem = {
      id, title, startsAt, endsAt, sourceUrl, organizer: text(raw.organizer) || '校園活動', category: text(raw.category),
      description: text(raw.description, 12000), datePrecision: raw.datePrecision === 'time' ? 'time' : 'date',
      dateNote: text(raw.dateNote, 2000), location: text(raw.location), audience: text(raw.audience, 1000),
      registrationUrl: safeCampusUrl(raw.registrationUrl) || null, registrationEndsAt: date(raw.registrationEndsAt),
      clubId: raw.clubId === null ? null : text(raw.clubId, 160) || undefined,
    }
    if (bulletinExpiresAt(item) > now) items.set(id, item)
  }
  return [...items.values()]
}
export function readBulletinCache(storage: StorageReader, now = Date.now()): CampusBulletinItem[] {
  try {
    const cached: unknown = JSON.parse(storage.getItem(BULLETIN_CACHE_KEY) || 'null')
    if (!record(cached) || typeof cached.savedAt !== 'number' || now < cached.savedAt || now - cached.savedAt > BULLETIN_CACHE_MAX_AGE) return []
    return parseCampusBulletins(cached.items, now)
  } catch { return [] }
}
export function writeBulletinCache(storage: StorageWriter, items: CampusBulletinItem[], now = Date.now()) {
  try { storage.setItem(BULLETIN_CACHE_KEY, JSON.stringify({ savedAt: now, items: activeBulletins(items, now) })) } catch { /* Public feed can work without storage. */ }
}
export async function fetchCampusBulletins(signal: AbortSignal, request: typeof fetch = fetch): Promise<CampusBulletinItem[]> {
  const items: unknown[] = []
  for (let page = 1; page <= 5; page++) {
    const query = new URLSearchParams({ scope: 'all', status: 'active', limit: '100', page: String(page) })
    const response = await request(`${CAMPUS_API}/api/v1/events?${query}`, { signal, credentials: 'omit', headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Campus feed HTTP ${response.status}`)
    const body: unknown = await response.json()
    if (!record(body) || !Array.isArray(body.items) || typeof body.total !== 'number' || !Number.isFinite(body.total) || body.total < 0) throw new Error('Invalid campus feed')
    items.push(...body.items)
    if (items.length >= body.total || body.items.length < 100) break
  }
  return parseCampusBulletins(items)
}
export function shuffleBulletins(items: CampusBulletinItem[], random = Math.random): CampusBulletinItem[] {
  const shuffled = [...items]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}
export const campusEventUrl = (item: CampusBulletinItem) => `${CAMPUS_SITE}/events/${encodeURIComponent(item.id)}`
export function bulletinDateLabel(item: CampusBulletinItem) {
  const format = (value: number) => new Date(value).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric', ...(item.datePrecision === 'time' ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}) })
  const first = format(Date.parse(item.startsAt))
  const last = item.endsAt ? format(Date.parse(item.endsAt) - (item.datePrecision === 'date' ? 1 : 0)) : null
  return last && last !== first ? `${first} – ${last}` : first
}
