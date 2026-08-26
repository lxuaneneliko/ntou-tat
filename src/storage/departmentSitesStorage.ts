import { DEPARTMENT_SITES } from '../api/departmentSites'
import type { DepartmentOverview, DepartmentPost } from '../api/departmentSites'

const STORAGE_KEY = 'ntou_department_sites_v1'
const validSiteIds = new Set(DEPARTMENT_SITES.map((site) => site.id))

export type DepartmentSiteCache = {
  overview: DepartmentOverview
  postsByCategory: Record<string, DepartmentPost[]>
  savedAt: string
}

type DepartmentCacheStore = Record<string, DepartmentSiteCache>

const validPost = (value: unknown): value is DepartmentPost => {
  if (!value || typeof value !== 'object') return false
  const post = value as Partial<DepartmentPost>
  if (typeof post.id !== 'string' || typeof post.title !== 'string' || typeof post.publishedAt !== 'string' || typeof post.url !== 'string') return false
  try {
    const url = new URL(post.url)
    return url.protocol === 'https:' && (url.hostname === 'ntou.edu.tw' || url.hostname.endsWith('.ntou.edu.tw'))
  } catch {
    return false
  }
}

const validCache = (siteId: string, value: unknown): value is DepartmentSiteCache => {
  if (!value || typeof value !== 'object') return false
  const cache = value as Partial<DepartmentSiteCache>
  if (!validSiteIds.has(siteId) || !cache.overview || cache.overview.siteId !== siteId || !Array.isArray(cache.overview.categories)) return false
  return typeof cache.savedAt === 'string' && Boolean(cache.postsByCategory && typeof cache.postsByCategory === 'object')
}

export const parseDepartmentCacheStore = (value: string | null): DepartmentCacheStore => {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return {}
    return Object.fromEntries(Object.entries(parsed).flatMap(([siteId, rawCache]) => {
      if (!validCache(siteId, rawCache)) return []
      const cache = rawCache as DepartmentSiteCache
      const site = DEPARTMENT_SITES.find((candidate) => candidate.id === siteId)!
      const categories = cache.overview.categories.flatMap((category) => {
        if (!category || typeof category.id !== 'string' || typeof category.label !== 'string') return []
        let endpoint: string | undefined
        if (typeof category.endpoint === 'string') {
          try {
            const parsedEndpoint = new URL(category.endpoint)
            if (parsedEndpoint.protocol === 'https:' && parsedEndpoint.hostname === new URL(site.url).hostname) endpoint = parsedEndpoint.toString()
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
      const postsByCategory = Object.fromEntries(Object.entries(cache.postsByCategory).map(([categoryId, posts]) => [
        categoryId,
        Array.isArray(posts) ? posts.filter(validPost).slice(0, 30) : [],
      ]))
      return [[siteId, { ...cache, overview: { ...cache.overview, categories }, postsByCategory }]]
    }))
  } catch {
    return {}
  }
}

export const readDepartmentCacheStore = () => {
  try {
    return parseDepartmentCacheStore(localStorage.getItem(STORAGE_KEY))
  } catch {
    return {}
  }
}

export const writeDepartmentCacheStore = (store: DepartmentCacheStore) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Live data remains available in memory when local storage is unavailable.
  }
}
