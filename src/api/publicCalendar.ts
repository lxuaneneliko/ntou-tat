import type { CalendarEvent } from '../types'

const normalizeDate = (value: string) => {
  const match = value.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (!match) return ''
  return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
}

const calendarDate = (year: string, month: string, day: string) =>
  normalizeDate(`${year}-${month}-${day}`)

const cleanTitle = (value: string) =>
  value
    .replace(/\\;/g, '、')
    .replace(/\s+/g, ' ')
    .trim()

const eventsFromDocument = (document: Document): CalendarEvent[] => {
  const events: CalendarEvent[] = []

  document.querySelectorAll<HTMLElement>('.calendar .month[data-year][data-month]').forEach((month) => {
    const year = month.dataset.year ?? ''
    const monthNumber = month.dataset.month ?? ''

    month.querySelectorAll<HTMLElement>('.months_event .day').forEach((day) => {
      const dayNumber = day.querySelector<HTMLElement>('.date')?.textContent?.trim() ?? ''
      const startsOn = calendarDate(year, monthNumber, dayNumber)
      if (!startsOn) return

      day.querySelectorAll<HTMLButtonElement>('.days_event button').forEach((button, index) => {
        const titleNode = button.cloneNode(true) as HTMLButtonElement
        titleNode
          .querySelectorAll('.sr-only, .event_title_append_before, .event_title_append_after')
          .forEach((element) => element.remove())
        const title = cleanTitle(titleNode.textContent ?? '')
        if (!title) return

        const endsOn = normalizeDate(button.dataset.end_date ?? '') || startsOn
        events.push({
          id: `ntou-calendar-${startsOn}-${index}-${title}`,
          title,
          startsOn,
          endsOn,
          category: '海大行事曆',
          source: 'official',
        })
      })
    })
  })

  return events
}

const decodeHtml = (value: string) =>
  value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

const stripTags = (value: string) => cleanTitle(decodeHtml(value.replace(/<[^>]+>/g, ' ')))

const eventsFromHtml = (html: string): CalendarEvent[] => {
  const events: CalendarEvent[] = []
  const monthStart = /<div\b[^>]*class=["'][^"']*\bmonth\b[^"']*["'][^>]*data-year=["'](\d{4})["'][^>]*data-month=["'](\d{1,2})["'][^>]*>/gi
  const monthMatches = [...html.matchAll(monthStart)]

  monthMatches.forEach((monthMatch, monthIndex) => {
    const year = monthMatch[1]
    const month = monthMatch[2]
    const start = (monthMatch.index ?? 0) + monthMatch[0].length
    const end = monthMatches[monthIndex + 1]?.index ?? html.length
    const monthHtml = html.slice(start, end)
    const dayPattern = /<div\b[^>]*class=["'][^"']*\bday\b[^"']*["'][^>]*>[\s\S]*?<div\b[^>]*class=["'][^"']*\bdate\b[^"']*["'][^>]*>(\d{1,2})<\/div>[\s\S]*?<div\b[^>]*class=["'][^"']*\bdays_event\b[^"']*["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi

    for (const dayMatch of monthHtml.matchAll(dayPattern)) {
      const startsOn = calendarDate(year, month, dayMatch[1])
      const buttonsHtml = dayMatch[2]
      const buttonPattern = /<button\b([^>]*)>([\s\S]*?)<\/button>/gi
      let buttonIndex = 0

      for (const buttonMatch of buttonsHtml.matchAll(buttonPattern)) {
        const attributes = buttonMatch[1]
        const content = buttonMatch[2]
          .replace(/<span\b[^>]*class=["'][^"']*(?:sr-only|event_title_append_before|event_title_append_after)[^"']*["'][^>]*>[\s\S]*?<\/span>/gi, '')
        const title = stripTags(content)
        if (!title) continue

        const endDate = attributes.match(/\bdata-end_date=["']([^"']+)["']/i)?.[1] ?? ''
        events.push({
          id: `ntou-calendar-${startsOn}-${buttonIndex}-${title}`,
          title,
          startsOn,
          endsOn: normalizeDate(endDate) || startsOn,
          category: '海大行事曆',
          source: 'official',
        })
        buttonIndex += 1
      }
    }
  })

  return events
}

export const parseNtouPublicCalendar = (html: string): CalendarEvent[] => {
  if (typeof DOMParser !== 'undefined') {
    return eventsFromDocument(new DOMParser().parseFromString(html, 'text/html'))
  }
  return eventsFromHtml(html)
}

export const filterCalendarRange = (
  events: CalendarEvent[],
  from: string,
  to: string,
) => events.filter((event) => event.startsOn <= to && (event.endsOn || event.startsOn) >= from)
