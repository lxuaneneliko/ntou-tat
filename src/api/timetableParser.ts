import type { TimetableSlot } from '../types'

type CourseMetadata = {
  code: string
  title: string
  department: string
  instructor: string
  credits: number
}

const courseColors = ['#176db9', '#0a8f68', '#7c3aed', '#c45616', '#d81b4e', '#357a38']

const readDocument = (html: string) =>
  typeof DOMParser === 'undefined' ? null : new DOMParser().parseFromString(html, 'text/html')

const readAttr = (tag: string, attr: string) =>
  tag.match(new RegExp(`\\b${attr}=["']([^"']*)["']`, 'i'))?.[1] ?? ''

const decodeHtml = (value: string) =>
  value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))

const normalizeText = (value: string) => decodeHtml(value).replace(/\s+/g, ' ').trim()

const textFromHtml = (html: string) => normalizeText(html.replace(/<[^>]+>/g, ' '))

const linesFromHtml = (html: string) =>
  decodeHtml(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '))
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)

const linesFromElement = (element: Element) => {
  const clone = element.cloneNode(true) as HTMLElement
  clone.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  return (clone.textContent ?? '')
    .split(/\n+/)
    .map(normalizeText)
    .filter(Boolean)
}

const extractTable = (html: string, id: string) =>
  html.match(new RegExp(`<table\\b(?=[^>]*\\bid=["']${id}["'])[^>]*>([\\s\\S]*?)<\\/table>`, 'i'))?.[1] ?? ''

const extractRows = (tableHtml: string) =>
  [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((match) => match[1])

const extractCells = (rowHtml: string) =>
  [...rowHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((match) => match[1])

const courseColor = (key: string) => {
  const hash = [...key].reduce((value, char) => ((value << 5) - value + char.charCodeAt(0)) | 0, 0)
  return courseColors[Math.abs(hash) % courseColors.length]
}

const periodTimes: Record<number, { startsAt: string; endsAt: string }> = {
  0: { startsAt: '06:20', endsAt: '08:10' },
  1: { startsAt: '08:20', endsAt: '09:10' },
  2: { startsAt: '09:20', endsAt: '10:10' },
  3: { startsAt: '10:20', endsAt: '11:10' },
  4: { startsAt: '11:15', endsAt: '12:05' },
  5: { startsAt: '12:10', endsAt: '13:00' },
  6: { startsAt: '13:10', endsAt: '14:00' },
  7: { startsAt: '14:10', endsAt: '15:00' },
  8: { startsAt: '15:10', endsAt: '16:00' },
  9: { startsAt: '16:05', endsAt: '16:55' },
  10: { startsAt: '17:30', endsAt: '18:20' },
  11: { startsAt: '18:30', endsAt: '19:20' },
  12: { startsAt: '19:25', endsAt: '20:15' },
  13: { startsAt: '20:20', endsAt: '21:10' },
  14: { startsAt: '21:15', endsAt: '22:05' },
}

const parseCredits = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const metadataFromCells = (cells: string[]): CourseMetadata | null => {
  const code = normalizeText(cells[2] ?? '')
  const title = normalizeText(cells[3] ?? '')
  if (!code && !title) {
    return null
  }

  return {
    code,
    title,
    department: normalizeText(cells[4] ?? ''),
    instructor: normalizeText(cells[6] ?? ''),
    credits: parseCredits(normalizeText(cells[8] ?? '')),
  }
}

const parseCourseMetadata = (html: string) => {
  const courses = new Map<string, CourseMetadata>()
  const document = readDocument(html)

  if (document) {
    const rows = [...document.querySelectorAll<HTMLTableRowElement>('#DataGrid tr')].slice(1)
    rows.forEach((row) => {
      const metadata = metadataFromCells([...row.cells].map((cell) => normalizeText(cell.textContent ?? '')))
      if (metadata) {
        courses.set(metadata.code || metadata.title, metadata)
      }
    })
    return courses
  }

  extractRows(extractTable(html, 'DataGrid')).slice(1).forEach((row) => {
    const metadata = metadataFromCells(extractCells(row).map(textFromHtml))
    if (metadata) {
      courses.set(metadata.code || metadata.title, metadata)
    }
  })
  return courses
}

const slotsFromCourseLines = (
  lines: string[],
  courseMetadata: Map<string, CourseMetadata>,
  day: number,
  period: number,
): TimetableSlot | null => {
  const title = normalizeText(lines[0] ?? '')
  const code = normalizeText(lines[1] ?? '')
  if (!title && !code) {
    return null
  }

  const metadata = courseMetadata.get(code) ?? courseMetadata.get(title)
  const key = code || title
  const times = periodTimes[period] ?? { startsAt: '', endsAt: '' }

  return {
    id: `${key}-${day}-${period}`,
    courseId: key,
    courseCode: code,
    courseTitle: metadata?.title || title,
    instructor: metadata?.instructor ?? '',
    classroom: normalizeText(lines[4] ?? ''),
    day,
    startsAt: times.startsAt,
    endsAt: times.endsAt,
    section: String(period),
    credits: metadata?.credits || parseCredits(lines[3] ?? ''),
    color: courseColor(key),
  }
}

export const parseAisPersonalTimetable = (timetableHtml: string, courseListHtml: string) => {
  const metadata = parseCourseMetadata(courseListHtml)
  const slots: TimetableSlot[] = []
  const document = readDocument(timetableHtml)

  if (document) {
    const rows = [...document.querySelectorAll<HTMLTableRowElement>('#table2 tr')].slice(1)
    rows.forEach((row, rowIndex) => {
      const period = rowIndex
      ;[...row.cells].slice(1, 8).forEach((cell, dayIndex) => {
        const anchors = [...cell.querySelectorAll('a')]
        const sources = anchors.length ? anchors.map(linesFromElement) : [linesFromElement(cell)]
        sources.forEach((lines) => {
          const slot = slotsFromCourseLines(lines, metadata, dayIndex + 1, period)
          if (slot) slots.push(slot)
        })
      })
    })
    return slots
  }

  extractRows(extractTable(timetableHtml, 'table2')).slice(1).forEach((row, rowIndex) => {
    extractCells(row).slice(1, 8).forEach((cell, dayIndex) => {
      const anchors = [...cell.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => match[1])
      const sources = anchors.length ? anchors : [cell]
      sources.forEach((source) => {
        const slot = slotsFromCourseLines(linesFromHtml(source), metadata, dayIndex + 1, rowIndex)
        if (slot) slots.push(slot)
      })
    })
  })

  return slots
}

const appendFormControls = (body: URLSearchParams, html: string) => {
  const document = readDocument(html)
  const form = document?.querySelector<HTMLFormElement>('form')

  if (form) {
    Array.from(form.elements).forEach((control) => {
      if (
        !(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) ||
        !control.name ||
        control.disabled
      ) {
        return
      }

      const type = control instanceof HTMLInputElement ? control.type.toLowerCase() : ''
      if (['submit', 'button', 'reset', 'file', 'image'].includes(type)) return
      if (control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(type) && !control.checked) return
      body.append(control.name, control.value ?? '')
    })
    return
  }

  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0]
    const name = readAttr(tag, 'name')
    const type = readAttr(tag, 'type').toLowerCase()
    if (name && !['submit', 'button', 'reset', 'file', 'image'].includes(type)) {
      body.append(name, readAttr(tag, 'value'))
    }
  }
}

export const buildAisCourseQueryBody = (
  html: string,
  semesterId: string,
  mode: 'list' | 'timetable',
) => {
  const [academicYear = '', semester = ''] = semesterId.split('-')
  const body = new URLSearchParams()
  appendFormControls(body, html)
  body.set('Q_AYEAR', academicYear)
  body.set('Q_SMS', semester)
  body.set('PC$PageSize', '200')
  body.set('PC2$PageSize', '200')
  body.delete('QUERY_BTN1')
  body.delete('QUERY_BTN3')
  body.set(mode === 'list' ? 'QUERY_BTN1' : 'QUERY_BTN3', mode === 'list' ? '選課清單' : '選課課表')
  return body.toString()
}
