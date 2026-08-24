import type { Announcement } from '../types'

const HOME_URL = 'https://www.ntou.edu.tw/'

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
    return new URL(value, HOME_URL).toString()
  } catch {
    return ''
  }
}

const announcementId = (url: string, index: number) => {
  try {
    const parsed = new URL(url)
    return parsed.searchParams.get('bbsNoToken') || `ntou-announcement-${index}`
  } catch {
    return `ntou-announcement-${index}`
  }
}

const parseAnnouncementLink = (link: HTMLAnchorElement, index: number): Announcement | null => {
  const url = absoluteUrl(link.getAttribute('href') ?? '')
  const titleElement = link.querySelector('.tabpanel_title')
  const titleSpans = titleElement ? [...titleElement.querySelectorAll('span:not(.sr-only)')] : []
  const title = compactText(titleSpans.at(-1)?.textContent || titleElement?.textContent)
  const metadata = compactText(link.querySelector('.tabpanel_date')?.textContent)
  const separatorIndex = metadata.lastIndexOf(' - ')
  const source = separatorIndex >= 0 ? compactText(metadata.slice(0, separatorIndex)) : '國立臺灣海洋大學'
  const publishedAt = separatorIndex >= 0 ? compactText(metadata.slice(separatorIndex + 3)) : metadata

  if (!url || !title || title === '更多學校公告') return null
  return {
    id: announcementId(url, index),
    title,
    source: source || '國立臺灣海洋大學',
    publishedAt,
    pinned: link.classList.contains('important') || /重大公告|重要通知/.test(title),
    url,
  }
}

export const parseNtouAnnouncements = (html: string): Announcement[] => {
  if (typeof DOMParser === 'undefined') {
    return [...html.matchAll(/<a\b([^>]*\btitle=["']學校公告\s*-\s*[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi)]
      .map((match, index): Announcement | null => {
        const href = match[1].match(/\bhref=["']([^"']+)["']/i)?.[1] ?? ''
        const title = textFromHtml(
          match[2].match(/<div\b[^>]*class=["'][^"']*tabpanel_title[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '',
        ).replace(/^學校公告\s*/, '')
        const metadata = textFromHtml(
          match[2].match(/<div\b[^>]*class=["'][^"']*tabpanel_date[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ?? '',
        )
        const url = absoluteUrl(href)
        const separatorIndex = metadata.lastIndexOf(' - ')
        if (!url || !title) return null
        return {
          id: announcementId(url, index),
          title,
          source: separatorIndex >= 0 ? compactText(metadata.slice(0, separatorIndex)) : '國立臺灣海洋大學',
          publishedAt: separatorIndex >= 0 ? compactText(metadata.slice(separatorIndex + 3)) : metadata,
          pinned: /\bclass=["'][^"']*important/i.test(match[1]) || /重大公告|重要通知/.test(title),
          url,
        }
      })
      .filter((item): item is Announcement => Boolean(item))
  }

  const document = new DOMParser().parseFromString(html, 'text/html')
  const panel = document.querySelector('#TabList_post_home_tabpanel .tab')
  if (!panel) return []

  const seen = new Set<string>()
  return [...panel.querySelectorAll<HTMLAnchorElement>('ul[role="tabpanel"] > li > a')]
    .map(parseAnnouncementLink)
    .filter((item): item is Announcement => Boolean(item))
    .filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
}
