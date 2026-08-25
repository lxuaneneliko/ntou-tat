export const LATEST_RELEASE_URL =
  'https://api.github.com/repos/lxuaneneliko/ntou-tat/releases/latest'

export const UPDATE_RETRY_INTERVAL_MS = 60 * 60 * 1000

const NEXT_UPDATE_CHECK_KEY = 'ntou-update-next-check-at-v4'
const DAILY_UPDATE_CHECK_HOURS = [4, 10, 16, 22]

type GitHubReleaseAsset = {
  browser_download_url?: unknown
  name?: unknown
}

type GitHubRelease = {
  assets?: unknown
  body?: unknown
  html_url?: unknown
  name?: unknown
  published_at?: unknown
  tag_name?: unknown
}

export type AppUpdate = {
  downloadUrl: string
  highlights: string[]
  publishedAt: string | null
  releaseUrl: string
  title: string
  version: string
}

const versionParts = (version: string) =>
  version
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0))

export const isNewerVersion = (latest: string, installed: string) => {
  const latestParts = versionParts(latest)
  const installedParts = versionParts(installed)
  const length = Math.max(latestParts.length, installedParts.length)

  for (let index = 0; index < length; index += 1) {
    const latestPart = latestParts[index] ?? 0
    const installedPart = installedParts[index] ?? 0
    if (latestPart > installedPart) return true
    if (latestPart < installedPart) return false
  }

  return false
}

const cleanReleaseLine = (line: string) =>
  line
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/[*_`>]/g, '')
    .trim()

export const releaseHighlights = (body: string) => {
  const highlights = body
    .split(/\r?\n/)
    .map(cleanReleaseLine)
    .filter((line) => line.length > 0)
    .filter((line) => !/^https?:\/\//i.test(line))
    .slice(0, 3)
    .map((line) => (line.length > 96 ? `${line.slice(0, 93)}…` : line))

  return highlights.length ? highlights : ['包含最新功能改善與錯誤修正。']
}

const stringValue = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

export const parseLatestRelease = (
  payload: GitHubRelease,
  installedVersion: string,
): AppUpdate | null => {
  const tag = stringValue(payload.tag_name)
  if (!tag || !isNewerVersion(tag, installedVersion)) return null

  const assets = Array.isArray(payload.assets) ? (payload.assets as GitHubReleaseAsset[]) : []
  const apkAsset =
    assets.find((asset) => stringValue(asset.name).toLowerCase() === 'ntoutat.apk') ??
    assets.find((asset) => stringValue(asset.name).toLowerCase().endsWith('.apk'))
  const releaseUrl = stringValue(payload.html_url)
  const downloadUrl = stringValue(apkAsset?.browser_download_url) || releaseUrl
  if (!downloadUrl) return null

  const version = tag.replace(/^v/i, '')
  return {
    version,
    title: stringValue(payload.name) || `NTOU TAT ${version}`,
    highlights: releaseHighlights(stringValue(payload.body)),
    publishedAt: stringValue(payload.published_at) || null,
    downloadUrl,
    releaseUrl: releaseUrl || downloadUrl,
  }
}

export const fetchLatestAppUpdate = async (
  installedVersion: string,
  signal?: AbortSignal,
): Promise<AppUpdate | null> => {
  const response = await fetch(LATEST_RELEASE_URL, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    throw new Error(`UPDATE_CHECK_FAILED_${response.status}`)
  }

  const payload = (await response.json()) as GitHubRelease
  return parseLatestRelease(payload, installedVersion)
}

export const shouldCheckForUpdate = (now = Date.now()) => {
  try {
    const nextCheckAt = Number(localStorage.getItem(NEXT_UPDATE_CHECK_KEY) ?? 0)
    return !Number.isFinite(nextCheckAt) || now >= nextCheckAt
  } catch {
    return true
  }
}

export const nextScheduledUpdateCheckAt = (now = Date.now()) => {
  const current = new Date(now)
  for (const hour of DAILY_UPDATE_CHECK_HOURS) {
    const candidate = new Date(current)
    candidate.setHours(hour, 30, 0, 0)
    if (candidate.getTime() > now) return candidate.getTime()
  }

  const nextMorning = new Date(current)
  nextMorning.setDate(nextMorning.getDate() + 1)
  nextMorning.setHours(DAILY_UPDATE_CHECK_HOURS[0], 30, 0, 0)
  return nextMorning.getTime()
}

export const scheduleNextUpdateCheck = (delay: number, now = Date.now()) => {
  try {
    localStorage.setItem(NEXT_UPDATE_CHECK_KEY, String(now + delay))
  } catch {
    // Update checks still work when WebView storage is unavailable.
  }
}

export const scheduleNextScheduledUpdateCheck = (now = Date.now()) => {
  try {
    localStorage.setItem(NEXT_UPDATE_CHECK_KEY, String(nextScheduledUpdateCheckAt(now)))
  } catch {
    // The foreground timer still uses the next scheduled window without storage.
  }
}

export const millisecondsUntilNextUpdateCheck = (now = Date.now()) => {
  try {
    const stored = Number(localStorage.getItem(NEXT_UPDATE_CHECK_KEY) ?? 0)
    if (Number.isFinite(stored) && stored > now) return stored - now
  } catch {
    // Fall through to the next scheduled window when storage is unavailable.
  }
  return Math.max(1000, nextScheduledUpdateCheckAt(now) - now)
}
