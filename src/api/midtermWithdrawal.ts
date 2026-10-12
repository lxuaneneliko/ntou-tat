export const MIDTERM_WITHDRAWAL_ESTIMATE_LABEL = '退選率' as const

export const NTOU_MIDTERM_WITHDRAWAL_URL = 'https://academics.ntou.edu.tw/course.aspx?u=13'

export type MidtermWithdrawalMatchStrategy =
  | 'semester_course_code'
  | 'semester_course_title_instructor'

export type MidtermWithdrawalUnavailableReason =
  | 'invalid_semester'
  | 'query_not_confirmed'
  | 'insufficient_course_identity'
  | 'ambiguous_fallback'
  | 'invalid_withdrawal_count'
  | 'missing_final_or_current_enrollment'
  | 'empty_denominator'

export type MidtermWithdrawalSemesterOption = {
  semester: string
  label: string
  eventTarget: string
}

export type MidtermWithdrawalCourseAggregate = {
  key: string
  semester: string
  courseCode: string | null
  courseTitle: string | null
  instructor: string | null
  withdrawnCount: number
  matchStrategy: MidtermWithdrawalMatchStrategy
}

export type MidtermWithdrawalParseResult = {
  label: typeof MIDTERM_WITHDRAWAL_ESTIMATE_LABEL
  semester: string | null
  querySucceeded: boolean
  status: 'success' | 'unavailable'
  courses: MidtermWithdrawalCourseAggregate[]
  ignoredRowCount: number
  reason?: 'invalid_semester' | 'query_not_confirmed'
}

export type MidtermWithdrawalCourseIdentity = {
  semester: string
  courseCode?: string | null
  courseTitle?: string | null
  instructor?: string | null
}

export type MidtermWithdrawalLookup =
  | {
      status: 'matched'
      withdrawnCount: number
      matchStrategy: MidtermWithdrawalMatchStrategy
    }
  | {
      status: 'confirmed_none'
      withdrawnCount: 0
      matchStrategy: 'successful_query_no_match'
    }
  | {
      status: 'unavailable'
      withdrawnCount: null
      reason: Extract<
        MidtermWithdrawalUnavailableReason,
        'invalid_semester' | 'query_not_confirmed' | 'insufficient_course_identity' | 'ambiguous_fallback'
      >
    }

export type MidtermWithdrawalEstimate =
  | {
      status: 'estimated'
      label: typeof MIDTERM_WITHDRAWAL_ESTIMATE_LABEL
      withdrawnCount: number
      finalOrCurrentEnrollmentCount: number
      estimatedEnrollmentBeforeMidtermWithdrawal: number
      rate: number
      ratePercent: number
      formula: 'withdrawn/(final_or_current+withdrawn)'
      caveat: string
    }
  | {
      status: 'unavailable'
      label: typeof MIDTERM_WITHDRAWAL_ESTIMATE_LABEL
      reason: MidtermWithdrawalUnavailableReason
    }

type ParsedTable = {
  rows: string[][]
}

type HeaderIndexes = {
  code: number
  title: number
  instructor: number
  count: number
}

const readDocument = (html: string) =>
  typeof DOMParser === 'undefined' ? null : new DOMParser().parseFromString(html, 'text/html')

const decodeHtml = (value: string) =>
  value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))

const normalizeText = (value: string) =>
  decodeHtml(value).normalize('NFKC').replace(/[\u00a0\s]+/g, ' ').trim()

const textFromHtml = (html: string) => normalizeText(html.replace(/<[^>]+>/g, ' '))

const normalizeHeader = (value: string) => normalizeText(value).replace(/\s+/g, '').toLowerCase()

const normalizeCourseCode = (value: string | null | undefined) =>
  normalizeText(value ?? '').replace(/\s+/g, '').toUpperCase()

export const normalizeMidtermWithdrawalCourseTitle = (value: string | null | undefined) =>
  normalizeText(value ?? '')
    .toLowerCase()
    .replace(/[\s·．・,，、:：;；()[\]（）【】]/g, '')

export const normalizeMidtermWithdrawalInstructor = (value: string | null | undefined) =>
  normalizeText(value ?? '')
    .toLowerCase()
    .split(/[、,，;；/&+＋]+/)
    .map((name) => name.replace(/\s+/g, '').replace(/老師$/g, ''))
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, 'zh-Hant'))
    .join(',')

export const normalizeMidtermWithdrawalSemester = (value: string | null | undefined) => {
  const normalized = normalizeText(value ?? '')
  const labelled = normalized.match(/(\d{2,3})\s*學年度?\s*第?\s*([1-4])\s*學期/)
  if (labelled) return `${Number(labelled[1])}-${labelled[2]}`

  const separated = normalized.match(/^(\d{2,3})\s*[-_/]\s*([1-4])$/)
  if (separated) return `${Number(separated[1])}-${separated[2]}`

  const compact = normalized.match(/^(\d{2,3})([1-4])$/)
  return compact ? `${Number(compact[1])}-${compact[2]}` : null
}

const parseTables = (html: string): ParsedTable[] => {
  const document = readDocument(html)
  if (document) {
    return [...document.querySelectorAll<HTMLTableElement>('table')].map((table) => ({
      rows: [...table.rows].map((row) =>
        [...row.cells].map((cell) => normalizeText(cell.textContent ?? '')),
      ),
    }))
  }

  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((tableMatch) => ({
    rows: [...tableMatch[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) =>
      [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cellMatch) =>
        textFromHtml(cellMatch[1]),
      ),
    ),
  }))
}

const headerIndexes = (headers: string[]): HeaderIndexes => {
  const normalized = headers.map(normalizeHeader)
  const find = (patterns: RegExp[]) =>
    normalized.findIndex((header) => patterns.some((pattern) => pattern.test(header)))

  return {
    code: find([/(?:課程|科目|選課)(?:代碼|編號)|課號|coursecode/]),
    title: find([/(?:課程|科目)(?:名稱|名)|課名|coursetitle|coursename/]),
    instructor: find([/(?:授課|任課)?(?:教師|老師)|instructor|teacher/]),
    count: find([/退選(?:人數|人次|筆數)|withdraw(?:al)?count/]),
  }
}

const findHeaderRow = (rows: string[][]) => {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const indexes = headerIndexes(rows[rowIndex])
    if (indexes.title >= 0 && (indexes.code >= 0 || indexes.instructor >= 0)) {
      return { rowIndex, indexes }
    }
  }
  return null
}

const parseWithdrawnCount = (value: string) => {
  const match = normalizeText(value).replace(/,/g, '').match(/\d+/)
  if (!match) return null
  const parsed = Number.parseInt(match[0], 10)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

const buildAggregateIdentity = (
  semester: string,
  courseCode: string,
  courseTitle: string,
  instructor: string,
) => {
  const normalizedCode = normalizeCourseCode(courseCode)
  if (normalizedCode) {
    return {
      key: `${semester}:code:${normalizedCode}`,
      matchStrategy: 'semester_course_code' as const,
    }
  }

  const normalizedTitle = normalizeMidtermWithdrawalCourseTitle(courseTitle)
  const normalizedInstructor = normalizeMidtermWithdrawalInstructor(instructor)
  if (!normalizedTitle || !normalizedInstructor) return null
  return {
    key: `${semester}:title-instructor:${normalizedTitle}:${normalizedInstructor}`,
    matchStrategy: 'semester_course_title_instructor' as const,
  }
}

const eventTargetFromHref = (href: string) =>
  decodeHtml(href).match(/__doPostBack\(\s*['"]([^'"]+)['"]\s*,/i)?.[1] ?? ''

export const parseMidtermWithdrawalSemesterOptions = (
  html: string,
): MidtermWithdrawalSemesterOption[] => {
  const document = readDocument(html)
  const options: MidtermWithdrawalSemesterOption[] = []

  if (document) {
    document.querySelectorAll<HTMLAnchorElement>('a[href*="__doPostBack"]').forEach((anchor) => {
      const label = normalizeText(anchor.textContent ?? '')
      const semester = normalizeMidtermWithdrawalSemester(anchor.title || label)
      const eventTarget = eventTargetFromHref(anchor.getAttribute('href') ?? '')
      if (semester && eventTarget) options.push({ semester, label, eventTarget })
    })
  } else {
    for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
      const attributes = match[1]
      const href = attributes.match(/\bhref=["']([^"']*)["']/i)?.[1] ?? ''
      const title = attributes.match(/\btitle=["']([^"']*)["']/i)?.[1] ?? ''
      const label = textFromHtml(match[2])
      const semester = normalizeMidtermWithdrawalSemester(decodeHtml(title) || label)
      const eventTarget = eventTargetFromHref(href)
      if (semester && eventTarget) options.push({ semester, label, eventTarget })
    }
  }

  return [...new Map(options.map((option) => [option.semester, option])).values()]
}

export const buildMidtermWithdrawalQueryBody = (html: string, semester: string) => {
  const normalizedSemester = normalizeMidtermWithdrawalSemester(semester)
  if (!normalizedSemester) throw new Error(`Invalid NTOU semester: ${semester}`)

  const option = parseMidtermWithdrawalSemesterOptions(html).find(
    (candidate) => candidate.semester === normalizedSemester,
  )
  if (!option) throw new Error(`NTOU midterm-withdrawal semester is unavailable: ${semester}`)

  const body = new URLSearchParams()
  const document = readDocument(html)
  if (document) {
    document.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]').forEach((input) => {
      body.set(input.name, input.value)
    })
  } else {
    for (const match of html.matchAll(/<input\b([^>]*)>/gi)) {
      const attributes = match[1]
      const type = attributes.match(/\btype=["']([^"']*)["']/i)?.[1] ?? ''
      const name = attributes.match(/\bname=["']([^"']*)["']/i)?.[1] ?? ''
      const value = attributes.match(/\bvalue=["']([^"']*)["']/i)?.[1] ?? ''
      if (type.toLowerCase() === 'hidden' && name) body.set(decodeHtml(name), decodeHtml(value))
    }
  }

  body.set('__EVENTTARGET', option.eventTarget)
  body.set('__EVENTARGUMENT', '')
  return body.toString()
}

export const parseMidtermWithdrawalHtml = (
  html: string,
  semester: string,
): MidtermWithdrawalParseResult => {
  const normalizedSemester = normalizeMidtermWithdrawalSemester(semester)
  if (!normalizedSemester) {
    return {
      label: MIDTERM_WITHDRAWAL_ESTIMATE_LABEL,
      semester: null,
      querySucceeded: false,
      status: 'unavailable',
      courses: [],
      ignoredRowCount: 0,
      reason: 'invalid_semester',
    }
  }

  const aggregates = new Map<string, MidtermWithdrawalCourseAggregate>()
  let ignoredRowCount = 0
  let resultTableCount = 0

  for (const table of parseTables(html)) {
    const header = findHeaderRow(table.rows)
    if (!header) continue
    resultTableCount += 1

    for (const cells of table.rows.slice(header.rowIndex + 1)) {
      if (findHeaderRow([cells])) continue

      const courseCode = normalizeText(cells[header.indexes.code] ?? '')
      const courseTitle = normalizeText(cells[header.indexes.title] ?? '')
      const instructor = normalizeText(cells[header.indexes.instructor] ?? '')
      const identity = buildAggregateIdentity(
        normalizedSemester,
        courseCode,
        courseTitle,
        instructor,
      )
      const withdrawnCount =
        header.indexes.count >= 0
          ? parseWithdrawnCount(cells[header.indexes.count] ?? '')
          : cells.some(Boolean)
            ? 1
            : null

      if (!identity || withdrawnCount === null) {
        if (cells.some(Boolean)) ignoredRowCount += 1
        continue
      }
      if (withdrawnCount === 0) continue

      const existing = aggregates.get(identity.key)
      if (existing) {
        existing.withdrawnCount += withdrawnCount
        if (!existing.courseTitle && courseTitle) existing.courseTitle = courseTitle
        if (!existing.instructor && instructor) existing.instructor = instructor
      } else {
        aggregates.set(identity.key, {
          key: identity.key,
          semester: normalizedSemester,
          courseCode: courseCode || null,
          courseTitle: courseTitle || null,
          instructor: instructor || null,
          withdrawnCount,
          matchStrategy: identity.matchStrategy,
        })
      }
    }
  }

  const documentText = normalizeText(readDocument(html)?.body.textContent ?? textFromHtml(html))
  const explicitEmptyResult =
    /(?:查無|沒有|無符合)[^。，,]{0,30}(?:退選)?(?:資料|記錄)|(?:本學期|該學期)(?:尚)?無(?:期中)?退選/.test(
      documentText,
    )
  const querySucceeded = resultTableCount > 0 || explicitEmptyResult
  const courses = [...aggregates.values()].sort((left, right) =>
    left.key.localeCompare(right.key, 'zh-Hant'),
  )

  return {
    label: MIDTERM_WITHDRAWAL_ESTIMATE_LABEL,
    semester: normalizedSemester,
    querySucceeded,
    status: querySucceeded ? 'success' : 'unavailable',
    courses,
    ignoredRowCount,
    ...(querySucceeded ? {} : { reason: 'query_not_confirmed' as const }),
  }
}

export const lookupMidtermWithdrawal = (
  result: MidtermWithdrawalParseResult,
  course: MidtermWithdrawalCourseIdentity,
): MidtermWithdrawalLookup => {
  const semester = normalizeMidtermWithdrawalSemester(course.semester)
  if (!semester || semester !== result.semester) {
    return { status: 'unavailable', withdrawnCount: null, reason: 'invalid_semester' }
  }
  if (!result.querySucceeded) {
    return { status: 'unavailable', withdrawnCount: null, reason: 'query_not_confirmed' }
  }

  const courseCode = normalizeCourseCode(course.courseCode)
  if (courseCode) {
    const match = result.courses.find(
      (candidate) => normalizeCourseCode(candidate.courseCode) === courseCode,
    )
    // A partially parsed official table can still provide reliable positive
    // matches, but a missing course code is not proof of zero withdrawals.
    // Refuse the zero result whenever any source row was skipped.
    if (!match && result.ignoredRowCount > 0) {
      return { status: 'unavailable', withdrawnCount: null, reason: 'query_not_confirmed' }
    }
    return match
      ? {
          status: 'matched',
          withdrawnCount: match.withdrawnCount,
          matchStrategy: 'semester_course_code',
        }
      : {
          status: 'confirmed_none',
          withdrawnCount: 0,
          matchStrategy: 'successful_query_no_match',
        }
  }

  const title = normalizeMidtermWithdrawalCourseTitle(course.courseTitle)
  const instructor = normalizeMidtermWithdrawalInstructor(course.instructor)
  if (!title || !instructor) {
    return {
      status: 'unavailable',
      withdrawnCount: null,
      reason: 'insufficient_course_identity',
    }
  }

  const matches = result.courses.filter(
    (candidate) =>
      normalizeMidtermWithdrawalCourseTitle(candidate.courseTitle) === title &&
      normalizeMidtermWithdrawalInstructor(candidate.instructor) === instructor,
  )
  if (matches.length > 1) {
    return { status: 'unavailable', withdrawnCount: null, reason: 'ambiguous_fallback' }
  }
  if (matches.length === 1) {
    return {
      status: 'matched',
      withdrawnCount: matches[0].withdrawnCount,
      matchStrategy: 'semester_course_title_instructor',
    }
  }
  if (result.ignoredRowCount > 0) {
    return { status: 'unavailable', withdrawnCount: null, reason: 'query_not_confirmed' }
  }
  return {
    status: 'confirmed_none',
    withdrawnCount: 0,
    matchStrategy: 'successful_query_no_match',
  }
}

export const estimateMidtermWithdrawalRate = (
  lookup: MidtermWithdrawalLookup,
  finalOrCurrentEnrollmentCount: number | null | undefined,
): MidtermWithdrawalEstimate => {
  if (
    finalOrCurrentEnrollmentCount === null ||
    finalOrCurrentEnrollmentCount === undefined ||
    !Number.isSafeInteger(finalOrCurrentEnrollmentCount) ||
    finalOrCurrentEnrollmentCount < 0
  ) {
    return {
      status: 'unavailable',
      label: MIDTERM_WITHDRAWAL_ESTIMATE_LABEL,
      reason: 'missing_final_or_current_enrollment',
    }
  }
  if (lookup.status === 'unavailable') {
    return {
      status: 'unavailable',
      label: MIDTERM_WITHDRAWAL_ESTIMATE_LABEL,
      reason: lookup.reason,
    }
  }

  if (
    lookup.status === 'matched' &&
    (!Number.isSafeInteger(lookup.withdrawnCount) || lookup.withdrawnCount <= 0)
  ) {
    return {
      status: 'unavailable',
      label: MIDTERM_WITHDRAWAL_ESTIMATE_LABEL,
      reason: 'invalid_withdrawal_count',
    }
  }

  const withdrawnCount = lookup.withdrawnCount
  const estimatedEnrollmentBeforeMidtermWithdrawal = finalOrCurrentEnrollmentCount + withdrawnCount
  if (estimatedEnrollmentBeforeMidtermWithdrawal <= 0) {
    return {
      status: 'unavailable',
      label: MIDTERM_WITHDRAWAL_ESTIMATE_LABEL,
      reason: 'empty_denominator',
    }
  }

  const rate = withdrawnCount / estimatedEnrollmentBeforeMidtermWithdrawal
  return {
    status: 'estimated',
    label: MIDTERM_WITHDRAWAL_ESTIMATE_LABEL,
    withdrawnCount,
    finalOrCurrentEnrollmentCount,
    estimatedEnrollmentBeforeMidtermWithdrawal,
    rate,
    ratePercent: rate * 100,
    formula: 'withdrawn/(final_or_current+withdrawn)',
    caveat: '依官方退選紀錄與退選後課程人數計算。',
  }
}
