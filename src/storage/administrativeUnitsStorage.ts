import { ADMINISTRATIVE_CONTENT_UNITS } from '../api/administrativeUnits'
import type { AdministrativeOverview, AdministrativePost } from '../api/administrativeUnits'

const STORAGE_KEY = 'ntou_administrative_units_v1'
const validUnitIds = new Set(ADMINISTRATIVE_CONTENT_UNITS.map((unit) => unit.id))

export type AdministrativeUnitCache = {
  overview: AdministrativeOverview
  postsByCategory: Record<string, AdministrativePost[]>
  savedAt: string
}

type AdministrativeCacheStore = Record<string, AdministrativeUnitCache>

const validPost = (value: unknown): value is AdministrativePost => {
  if (!value || typeof value !== 'object') return false
  const post = value as Partial<AdministrativePost>
  if (typeof post.id !== 'string' || typeof post.title !== 'string' || typeof post.publishedAt !== 'string' || typeof post.url !== 'string') return false
  try {
    const url = new URL(post.url)
    return url.protocol === 'https:' && (url.hostname === 'ntou.edu.tw' || url.hostname.endsWith('.ntou.edu.tw'))
  } catch {
    return false
  }
}

export const parseAdministrativeCacheStore = (value: string | null): AdministrativeCacheStore => {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(Object.entries(parsed).flatMap(([unitId, raw]) => {
      if (!validUnitIds.has(unitId) || !raw || typeof raw !== 'object') return []
      const cache = raw as Partial<AdministrativeUnitCache>
      if (!cache.overview || cache.overview.siteId !== unitId || !Array.isArray(cache.overview.categories) || typeof cache.savedAt !== 'string') return []
      const unit = ADMINISTRATIVE_CONTENT_UNITS.find((candidate) => candidate.id === unitId)!
      const feedHost = new URL(unit.feedUrl ?? unit.url).hostname
      const categories = cache.overview.categories.flatMap((category) => {
        if (!category || typeof category.id !== 'string' || typeof category.label !== 'string') return []
        let endpoint: string | undefined
        if (typeof category.endpoint === 'string') {
          try {
            const url = new URL(category.endpoint)
            if (url.protocol === 'https:' && url.hostname === feedHost) endpoint = url.toString()
          } catch {
            endpoint = undefined
          }
        }
        return [{
          id: category.id,
          label: category.label,
          ...(endpoint ? { endpoint } : {}),
          ...(Array.isArray(category.initialPosts) ? { initialPosts: category.initialPosts.filter(validPost).slice(0, 30) } : {}),
        }]
      })
      const postsByCategory = Object.fromEntries(Object.entries(cache.postsByCategory ?? {}).map(([categoryId, posts]) => [
        categoryId,
        Array.isArray(posts) ? posts.filter(validPost).slice(0, 30) : [],
      ]))
      return [[unitId, { overview: { ...cache.overview, categories }, postsByCategory, savedAt: cache.savedAt }]]
    }))
  } catch {
    return {}
  }
}

export const readAdministrativeCacheStore = () => {
  try {
    return parseAdministrativeCacheStore(localStorage.getItem(STORAGE_KEY))
  } catch {
    return {}
  }
}

export const writeAdministrativeCacheStore = (store: AdministrativeCacheStore) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // The live response remains available when local storage is full or disabled.
  }
}
