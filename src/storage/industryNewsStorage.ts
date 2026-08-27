import type { IndustryNews } from '../types'

const STORAGE_KEY = 'ntou_industry_news_v1'

const isIndustryNews = (value: unknown): value is IndustryNews => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<IndustryNews>
  if (
    typeof item.id !== 'string' ||
    !item.id.startsWith('ntou-industry-') ||
    typeof item.title !== 'string' ||
    !item.title.trim() ||
    typeof item.publishedAt !== 'string' ||
    item.source !== '海大產學營運總中心' ||
    typeof item.url !== 'string'
  ) return false

  try {
    return new URL(item.url).protocol === 'https:'
  } catch {
    return false
  }
}

export const parseStoredIndustryNews = (value: string | null): IndustryNews[] => {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isIndustryNews).slice(0, 50)
  } catch {
    return []
  }
}

export const readStoredIndustryNews = () => {
  try {
    return parseStoredIndustryNews(localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

export const writeStoredIndustryNews = (items: IndustryNews[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.filter(isIndustryNews).slice(0, 50)))
  } catch {
    // Keep the current in-memory list when storage is unavailable.
  }
}
