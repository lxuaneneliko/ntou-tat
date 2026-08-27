import type { IndustryNews, IndustryNewsCategory } from '../types'

const SOURCE_URL = 'https://tlo.ntou.edu.tw/'
const SOURCE_NAME = '海大產學營運總中心'

const compactText = (value: string | null | undefined) =>
  (value ?? '').replace(/\s+/g, ' ').trim()

const textFromHtml = (value: string) =>
  compactText(
    value
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&quot;|&#34;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>'),
  )

const absoluteHttpsUrl = (value: string) => {
  try {
    const url = new URL(value, SOURCE_URL)
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

const stableNewsId = (url: string) => {
  let hash = 2166136261
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `ntou-industry-${(hash >>> 0).toString(36)}`
}

const newsFromParts = (
  titleHtml: string,
  href: string,
  publishedAtHtml: string,
  category: IndustryNewsCategory,
): IndustryNews | null => {
  const url = absoluteHttpsUrl(href)
  const title = textFromHtml(titleHtml)
  if (!url || !title) return null
  return {
    id: stableNewsId(url),
    title,
    publishedAt: textFromHtml(publishedAtHtml),
    source: SOURCE_NAME,
    category,
    url,
  }
}

export const parseIndustryNews = (
  html: string,
  category: IndustryNewsCategory,
): IndustryNews[] => {
  if (typeof DOMParser === 'undefined') {
    return [...html.matchAll(/<div\b[^>]*class=["'][^"']*\bmtitle\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi)]
      .map((match) => {
        const href = match[1].match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1] ?? ''
        const titleHtml = match[1].match(/<a\b[^>]*>[\s\S]*?<\/a>/i)?.[0] ?? ''
        const publishedAtHtml = match[1].match(/<i\b[^>]*class=["'][^"']*\bmdate\b[^"']*["'][^>]*>([\s\S]*?)<\/i>/i)?.[1] ?? ''
        return newsFromParts(titleHtml, href, publishedAtHtml, category)
      })
      .filter((item): item is IndustryNews => Boolean(item))
  }

  const document = new DOMParser().parseFromString(html, 'text/html')
  const seen = new Set<string>()
  return [...document.querySelectorAll<HTMLElement>('.d-item.d-title .mtitle')]
    .map((row): IndustryNews | null => {
      const link = row.querySelector<HTMLAnchorElement>('a[href]')
      return newsFromParts(
        link?.textContent ?? '',
        link?.getAttribute('href') ?? '',
        row.querySelector('.mdate')?.textContent ?? '',
        category,
      )
    })
    .filter((item): item is IndustryNews => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
}
