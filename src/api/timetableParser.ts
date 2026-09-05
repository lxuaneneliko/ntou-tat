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

const extractTables = (html: string) =>
  [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)].map((match) => ({
    id: readAttr(match[1], 'id'),
    html: match[2],
  }))

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
  12: { startsAt: '19:20', endsAt: '20:10' },
  13: { startsAt: '20:20', endsAt: '21:10' },
  14: { startsAt: '21:10', endsAt: '22:00' },
}

const parseCredits = (value: string) => {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const findHeaderIndex = (headers: string[], patterns: RegExp[], fallback: number) => {
  const index = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)))
  return index >= 0 ? index : fallback
}

const metadataFromCells = (cells: string[], headers: string[] = []): CourseMetadata | null => {
  const codeIndex = findHeaderIndex(headers, [/課(?:程)?號|科目代碼|course\s*(?:code|no)/i], 2)
  const titleIndex = findHeaderIndex(headers, [/課(?:程)?名|科目名稱|course\s*(?:title|name)/i], 3)
  const departmentIndex = findHeaderIndex(headers, [/開課單位|系所|department/i], 4)
  const instructorIndex = findHeaderIndex(headers, [/授課.*(?:老師|教師)|教師|instructor/i], 6)
  const creditsIndex = findHeaderIndex(headers, [/學分|credit/i], 8)
  const code = normalizeText(cells[codeIndex] ?? '')
  const title = normalizeText(cells[titleIndex] ?? '')
  if (!code && !title) {
    return null
  }

  return {
    code,
    title,
    department: normalizeText(cells[departmentIndex] ?? ''),
    instructor: normalizeText(cells[instructorIndex] ?? ''),
    credits: parseCredits(normalizeText(cells[creditsIndex] ?? '')),
  }
}

const storeMetadata = (courses: Map<string, CourseMetadata>, metadata: CourseMetadata | null) => {
  if (!metadata) return
  if (metadata.code) courses.set(metadata.code, metadata)
  if (metadata.title) courses.set(metadata.title, metadata)
}

const parseCourseMetadata = (html: string) => {
  const courses = new Map<string, CourseMetadata>()
  const document = readDocument(html)

  if (document) {
    const tables = [...document.querySelectorAll<HTMLTableElement>('table')]
    const table =
      document.querySelector<HTMLTableElement>('#DataGrid') ||
      tables.find((candidate) => /課(?:程)?號|科目代碼/i.test(candidate.textContent ?? '') && /課(?:程)?名|科目名稱/i.test(candidate.textContent ?? ''))
    if (!table) return courses
    const rows = [...table.rows]
    const headers = [...(rows[0]?.cells ?? [])].map((cell) => normalizeText(cell.textContent ?? ''))
    rows.slice(1).forEach((row) => {
      storeMetadata(courses, metadataFromCells([...row.cells].map((cell) => normalizeText(cell.textContent ?? '')), headers))
    })
    return courses
  }

  const tables = extractTables(html)
  const table = tables.find(({ id }) => id.toLowerCase() === 'datagrid') ||
    tables.find(({ html: tableHtml }) => /課(?:程)?號|科目代碼/i.test(textFromHtml(tableHtml)) && /課(?:程)?名|科目名稱/i.test(textFromHtml(tableHtml)))
  const rows = extractRows(table?.html ?? extractTable(html, 'DataGrid'))
  const headers = extractCells(rows[0] ?? '').map(textFromHtml)
  rows.slice(1).forEach((row) => {
    storeMetadata(courses, metadataFromCells(extractCells(row).map(textFromHtml), headers))
  })
  return courses
}

const weekdayFromLabel = (value: string) => {
  const label = normalizeText(value).toLowerCase()
  const weekdays = [
    /星期一|週一|周一|monday|\bmon\b/,
    /星期二|週二|周二|tuesday|\btue\b/,
    /星期三|週三|周三|wednesday|\bwed\b/,
    /星期四|週四|周四|thursday|\bthu\b/,
    /星期五|週五|周五|friday|\bfri\b/,
    /星期六|週六|周六|saturday|\bsat\b/,
    /星期日|星期天|週日|周日|sunday|\bsun\b/,
  ]
  const index = weekdays.findIndex((pattern) => pattern.test(label))
  return index >= 0 ? index + 1 : null
}

const chinesePeriods: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7,
  八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12, 十三: 13, 十四: 14,
}

const periodFromLabel = (value: string, fallback: number) => {
  const label = normalizeText(value)
  const evening = label.match(/^(?:第\s*)?([A-D])(?:\s*節)?(?=\s*(?:[:：\-–~]|\d|$))/i)
  if (evening) return 11 + evening[1].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0)
  const numeric = label.match(/第?\s*(\d{1,2})\s*節/)
  if (numeric) return Number(numeric[1])
  const chinese = label.match(/第?\s*(零|十[一二三四]?|[一二三四五六七八九])\s*節/)
  if (chinese && chinesePeriods[chinese[1]] !== undefined) return chinesePeriods[chinese[1]]
  const time = label.match(/(\d{1,2}):\d{2}/)?.[1]
  if (time) {
    const startsAt = label.match(/(\d{1,2}:\d{2})/)?.[1]
    const matched = Object.entries(periodTimes).find(([, period]) => period.startsAt === startsAt)
    if (matched) return Number(matched[0])
  }
  return fallback
}

const courseMetadataFromLines = (lines: string[], metadata: Map<string, CourseMetadata>) =>
  lines.map((line) => metadata.get(line)).find(Boolean)

const slotsFromCourseLines = (
  lines: string[],
  courseMetadata: Map<string, CourseMetadata>,
  day: number,
  period: number,
): TimetableSlot | null => {
  const normalizedLines = lines.map(normalizeText).filter(Boolean)
  const matchedMetadata = courseMetadataFromLines(normalizedLines, courseMetadata)
  const legacyTitle = normalizeText(normalizedLines[0] ?? '')
  const legacyCode = normalizeText(normalizedLines[1] ?? '')
  const title = matchedMetadata?.title || legacyTitle
  const code = matchedMetadata?.code || legacyCode
  if (!title && !code) {
    return null
  }

  const metadata = matchedMetadata ?? courseMetadata.get(code) ?? courseMetadata.get(title)
  const key = code || title
  const times = periodTimes[period] ?? { startsAt: '', endsAt: '' }
  const metadataValues = new Set([
    metadata?.code,
    metadata?.title,
    metadata?.department,
    metadata?.instructor,
    metadata?.credits ? String(metadata.credits) : undefined,
  ].filter(Boolean))
  const classroom = normalizedLines.filter((line) => !metadataValues.has(line)).at(-1) || normalizeText(lines[4] ?? '')

  return {
    id: `${key}-${day}-${period}`,
    courseId: key,
    courseCode: code,
    courseTitle: metadata?.title || title,
    instructor: metadata?.instructor ?? '',
    classroom,
    day,
    startsAt: times.startsAt,
    endsAt: times.endsAt,
    section: String(period),
    credits: metadata?.credits || normalizedLines.map(parseCredits).find((credits) => credits > 0) || 0,
    color: courseColor(key),
  }
}

export const parseAisPersonalTimetable = (timetableHtml: string, courseListHtml: string) => {
  const metadata = parseCourseMetadata(courseListHtml)
  const slots: TimetableSlot[] = []
  const document = readDocument(timetableHtml)

  if (document) {
    const tables = [...document.querySelectorAll<HTMLTableElement>('table')]
    const hasWeekdayHeader = (candidate: HTMLTableElement) =>
      [...candidate.rows].some((row) => [...row.cells].filter((cell) => weekdayFromLabel(cell.textContent ?? '') !== null).length >= 2)
    const preferred = document.querySelector<HTMLTableElement>('#table2')
    const table = preferred && hasWeekdayHeader(preferred) ? preferred : tables.find(hasWeekdayHeader)
    if (!table) return slots
    const rows = [...table.rows]
    const headerIndex = rows.findIndex((row) => [...row.cells].filter((cell) => weekdayFromLabel(cell.textContent ?? '') !== null).length >= 2)
    if (headerIndex < 0) return slots
    const dayColumns = new Map<number, number>()
    ;[...rows[headerIndex].cells].forEach((cell, cellIndex) => {
      const day = weekdayFromLabel(cell.textContent ?? '')
      if (day) dayColumns.set(cellIndex, day)
    })
    rows.slice(headerIndex + 1).forEach((row, rowIndex) => {
      const period = periodFromLabel(row.cells[0]?.textContent ?? '', rowIndex)
      ;[...row.cells].forEach((cell, cellIndex) => {
        const day = dayColumns.get(cellIndex)
        if (!day) return
        const anchors = [...cell.querySelectorAll('a')]
        const sources = anchors.length ? anchors.map(linesFromElement) : [linesFromElement(cell)]
        sources.forEach((lines) => {
          const slot = slotsFromCourseLines(lines, metadata, day, period)
          if (slot) slots.push(slot)
        })
      })
    })
    return slots
  }

  const tables = extractTables(timetableHtml)
  const hasWeekdayHeader = ({ html }: { html: string }) =>
    extractRows(html).some((row) => extractCells(row).filter((cell) => weekdayFromLabel(textFromHtml(cell)) !== null).length >= 2)
  const preferred = tables.find(({ id }) => id.toLowerCase() === 'table2')
  const table = preferred && hasWeekdayHeader(preferred) ? preferred : tables.find(hasWeekdayHeader)
  const rows = extractRows(table?.html ?? '')
  const headerIndex = rows.findIndex((row) => extractCells(row).filter((cell) => weekdayFromLabel(textFromHtml(cell)) !== null).length >= 2)
  if (headerIndex < 0) return slots
  const dayColumns = new Map<number, number>()
  extractCells(rows[headerIndex]).forEach((cell, cellIndex) => {
    const day = weekdayFromLabel(textFromHtml(cell))
    if (day) dayColumns.set(cellIndex, day)
  })
  rows.slice(headerIndex + 1).forEach((row, rowIndex) => {
    const cells = extractCells(row)
    const period = periodFromLabel(textFromHtml(cells[0] ?? ''), rowIndex)
    cells.forEach((cell, cellIndex) => {
      const day = dayColumns.get(cellIndex)
      if (!day) return
      const anchors = [...cell.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((match) => match[1])
      const sources = anchors.length ? anchors : [cell]
      sources.forEach((source) => {
        const slot = slotsFromCourseLines(linesFromHtml(source), metadata, day, period)
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
