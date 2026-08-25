import type { ExternalCompetition } from '../types'

const STORAGE_KEY = 'ntou_external_competitions_v1'

const isCompetition = (value: unknown): value is ExternalCompetition => {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<ExternalCompetition>
  if (
    typeof item.id !== 'string' ||
    !item.id.startsWith('cycu-') ||
    typeof item.title !== 'string' ||
    !item.title.trim() ||
    typeof item.publishedAt !== 'string' ||
    typeof item.source !== 'string' ||
    typeof item.url !== 'string'
  ) return false

  try {
    const url = new URL(item.url)
    return url.protocol === 'https:' && url.hostname === 'cyie.cycu.edu.tw'
  } catch {
    return false
  }
}

export const parseStoredExternalCompetitions = (value: string | null): ExternalCompetition[] => {
  if (!value) return []
  try {
    const parsed: unknown = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isCompetition).slice(0, 50)
  } catch {
    return []
  }
}

export const readStoredExternalCompetitions = () => {
  try {
    return parseStoredExternalCompetitions(localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

export const writeStoredExternalCompetitions = (items: ExternalCompetition[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.filter(isCompetition).slice(0, 50)))
  } catch {
    // Keep the current in-memory list when storage is unavailable.
  }
}
