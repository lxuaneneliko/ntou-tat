import type { ExternalCompetition } from '../types'

const SOURCE_URL = 'https://cyie.cycu.edu.tw/'
const SOURCE_NAME = '中原大學創新創業發展中心'

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

const absoluteUrl = (value: string) => {
  try {
    const url = new URL(value, SOURCE_URL)
    return url.protocol === 'https:' && url.hostname === 'cyie.cycu.edu.tw' ? url.toString() : ''
  } catch {
    return ''
  }
}

const competitionId = (article: Element | null, url: string, index: number) => {
  const postClass = article?.className.match(/(?:^|\s)post-(\d+)(?:\s|$)/)?.[1]
  if (postClass) return `cycu-${postClass}`
  try {
    return `cycu-${new URL(url).pathname.replace(/^\/+|\/+$/g, '') || index}`
  } catch {
    return `cycu-${index}`
  }
}

export const parseExternalCompetitions = (html: string): ExternalCompetition[] => {
  if (typeof DOMParser === 'undefined') {
    return [...html.matchAll(/<article\b([^>]*class=["'][^"']*elementor-post[^"']*["'][^>]*)>([\s\S]*?)<\/article>/gi)]
      .map((match, index): ExternalCompetition | null => {
        const titleBlock = match[2].match(/<h3\b[^>]*class=["'][^"']*elementor-post__title[^"']*["'][^>]*>([\s\S]*?)<\/h3>/i)?.[1] ?? ''
        const href = titleBlock.match(/<a\b[^>]*href=["']([^"']+)["']/i)?.[1] ?? ''
        const url = absoluteUrl(href)
        const title = textFromHtml(titleBlock)
        const publishedAt = textFromHtml(
          match[2].match(/<span\b[^>]*class=["'][^"']*elementor-post-date[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? '',
        )
        const postId = match[1].match(/(?:^|\s)post-(\d+)(?:\s|["'])/i)?.[1]
        if (!url || !title) return null
        return {
          id: postId ? `cycu-${postId}` : competitionId(null, url, index),
          title,
          publishedAt,
          source: SOURCE_NAME,
          url,
        }
      })
      .filter((item): item is ExternalCompetition => Boolean(item))
  }

  const document = new DOMParser().parseFromString(html, 'text/html')
  const seen = new Set<string>()
  return [...document.querySelectorAll<HTMLElement>('article.elementor-post')]
    .map((article, index): ExternalCompetition | null => {
      const link = article.querySelector<HTMLAnchorElement>('.elementor-post__title a')
      const url = absoluteUrl(link?.getAttribute('href') ?? '')
      const title = compactText(link?.textContent)
      if (!url || !title) return null
      return {
        id: competitionId(article, url, index),
        title,
        publishedAt: compactText(article.querySelector('.elementor-post-date')?.textContent),
        source: SOURCE_NAME,
        url,
      }
    })
    .filter((item): item is ExternalCompetition => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
}
