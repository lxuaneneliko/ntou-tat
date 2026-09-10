const AIS_BASE_URL = 'https://ais.ntou.edu.tw/'

export const COURSE_HISTORY_ENTRY_URL = new URL(
  'Application/TKE/TKE22/TKE2214_.aspx?progcd=TKE2214',
  AIS_BASE_URL,
).toString()
export const COURSE_HISTORY_QUERY_URL = new URL(
  'Application/TKE/TKE22/TKE2210_01.aspx',
  AIS_BASE_URL,
).toString()
export const COURSE_CURRENT_ENTRY_URL = new URL(
  'Application/TKE/TKE22/TKE2215_.aspx?progcd=TKE2215',
  AIS_BASE_URL,
).toString()
export const COURSE_CURRENT_QUERY_URL = new URL(
  'Application/TKE/TKE22/TKE2211_01.aspx',
  AIS_BASE_URL,
).toString()
export const COURSE_DETAIL_URL = new URL(
  'Application/TKE/TKE22/TKE2240_03.aspx',
  AIS_BASE_URL,
).toString()

export type CourseCatalogSource = 'ntou' | 'intercollegiate'
export type CourseCatalogSearchMode = 'department' | 'keyword' | 'teacher'

export type CourseCatalogQuery = {
  academicYear?: string
  semester?: string
  semesterId?: string
  courseCode?: string
  courseTitle?: string
  keyword?: string
  instructor?: string
  instructorDepartment?: string
  department?: string
  degree?: string
  grade?: string
  className?: string
  source?: CourseCatalogSource | 'all'
  match?: 'exact' | 'fuzzy'
  mode?: CourseCatalogSearchMode
  page?: number
  pageSize?: number
}

export type CourseCatalogOffering = {
  id: string
  pkno: string
  detailPostback: string
  semesterId: string
  courseCode: string
  title: string
  department: string
  className: string
  instructor: string
  instructorDepartment: string
  credits: number | null
  requirement: string
  enrolledCount: number | null
  maximumStudents: number | null
  minimumStudents: number | null
  internship: boolean | null
  hours: number | null
  crossListed: boolean | null
  term: string
  source: CourseCatalogSource
  detailUrl: string
}

export type CourseCatalogSearchResult = {
  items: CourseCatalogOffering[]
  page: number
  pageSize: number
  totalPages: number
  totalItems: number
}

export type CourseCatalogDetail = CourseCatalogOffering & {
  englishTitle: string
  allEnglish: boolean | null
  masterDoctorCombined?: boolean | null
  meetingTimes: string[]
  classrooms: string[]
  deliveryMode: string
  audience: string
  mainField: string
  subField: string
  coInstructors: string
  coreCompetencies: string
  characteristicField: string
  notes: string
  objectiveZh: string
  objectiveEn: string
  prerequisitesZh: string
  prerequisitesEn: string
  contentZh: string
  contentEn: string
  teachingMethodZh: string
  teachingMethodEn: string
  referencesZh: string
  referencesEn: string
  scheduleZh: string
  scheduleEn: string
  evaluationZh: string
  evaluationEn: string
  sustainableDevelopmentGoals: string
  referenceUrl: string
  downloadUrl: string
}

type HtmlCell = {
  html: string
  text: string
}

const namedEntities: Record<string, string> = {
  amp: '&',
  apos: "'",
  gt: '>',
  hellip: '…',
  laquo: '«',
  ldquo: '“',
  lsquo: '‘',
  lt: '<',
  mdash: '—',
  middot: '·',
  nbsp: ' ',
  ndash: '–',
  quot: '"',
  raquo: '»',
  rdquo: '”',
  rsquo: '’',
}

const decodeHtmlEntities = (value: string) => value.replace(
  /&(#x[\da-f]+|#\d+|[a-z][\da-z]+);?/gi,
  (entity, code: string) => {
    if (/^#x/i.test(code)) {
      const point = Number.parseInt(code.slice(2), 16)
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity
    }
    if (code.startsWith('#')) {
      const point = Number.parseInt(code.slice(1), 10)
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity
    }
    return namedEntities[code.toLowerCase()] ?? entity
  },
)

const stripControlCharacters = (value: string) => [...value].filter((character) => {
  const code = character.charCodeAt(0)
  return code === 9 || code === 10 || code === 13 || code >= 32 && code !== 127
}).join('')

const normalizeInlineText = (value: string) => stripControlCharacters(decodeHtmlEntities(value))
  .replace(/\u00a0/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

const textFromHtml = (html: string, multiline = false) => {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|li|p|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  if (!multiline) return normalizeInlineText(withBreaks)
  return decodeHtmlEntities(withBreaks)
    .replace(/\r/g, '')
    .split(/\n+/)
    .map(normalizeInlineText)
    .filter(Boolean)
    .join('\n')
}

const readAttr = (tag: string, name: string) => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, 'i'))
  return decodeHtmlEntities(match?.[1] ?? match?.[2] ?? '')
}

const readElementById = (html: string, id: string, multiline = false) => {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const element = html.match(new RegExp(
    `<(?:span|div|td|label|textarea)\\b(?=[^>]*\\bid=["']${escaped}["'])[^>]*>([\\s\\S]*?)<\\/(?:span|div|td|label|textarea)>`,
    'i',
  ))
  if (element) return textFromHtml(element[1], multiline)

  const input = html.match(new RegExp(`<input\\b(?=[^>]*\\bid=["']${escaped}["'])[^>]*>`, 'i'))?.[0]
  return input ? normalizeInlineText(readAttr(input, 'value')) : ''
}

const normalizeCharset = (value: string) => {
  const normalized = value.trim().toLowerCase().replace(/["']/g, '')
  if (/^(?:big5|big-5|cp950|ms950|windows-950)$/.test(normalized)) return 'big5'
  if (/^(?:utf8|utf-8)$/.test(normalized)) return 'utf-8'
  return normalized || 'utf-8'
}

const declaredCharset = (bytes: Uint8Array, contentType: string) => {
  const fromHeader = contentType.match(/charset\s*=\s*["']?([^;\s"']+)/i)?.[1]
  if (fromHeader) return normalizeCharset(fromHeader)

  const head = String.fromCharCode(...bytes.subarray(0, Math.min(bytes.length, 4096)))
  const fromMeta = head.match(/<meta[^>]+charset\s*=\s*["']?([^\s"'/>]+)/i)?.[1]
    ?? head.match(/<meta[^>]+content=["'][^"']*charset\s*=\s*([^;\s"']+)/i)?.[1]
  return fromMeta ? normalizeCharset(fromMeta) : ''
}

/**
 * Decodes raw AIS responses. Android already returns decoded strings, while
 * snapshot scripts may receive Big5/CP950 bytes directly.
 */
export const decodeCourseCatalogHtml = (
  value: string | ArrayBuffer | Uint8Array,
  contentType = '',
) => {
  if (typeof value === 'string') return value.replace(/^\ufeff/, '')
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  const charset = declaredCharset(bytes, contentType)

  if (charset) {
    try {
      return new TextDecoder(charset).decode(bytes).replace(/^\ufeff/, '')
    } catch {
      // Fall through to the UTF-8/Big5 probes below.
    }
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\ufeff/, '')
  } catch {
    try {
      return new TextDecoder('big5').decode(bytes).replace(/^\ufeff/, '')
    } catch {
      return new TextDecoder().decode(bytes).replace(/^\ufeff/, '')
    }
  }
}

export const parseWebFormsHiddenFields = (html: string) => {
  const fields: Record<string, string> = {}
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0]
    if (readAttr(tag, 'type').toLowerCase() !== 'hidden') continue
    const name = readAttr(tag, 'name')
    if (name) fields[name] = readAttr(tag, 'value')
  }
  return fields
}

export const appendWebFormsControls = (body: URLSearchParams, html: string) => {
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0]
    const name = readAttr(tag, 'name')
    const type = readAttr(tag, 'type').toLowerCase()
    if (!name || ['submit', 'button', 'reset', 'file', 'image'].includes(type)) continue
    if (['checkbox', 'radio'].includes(type) && !/\bchecked(?:\s*=|\s|>)/i.test(tag)) continue
    body.append(name, readAttr(tag, 'value'))
  }

  for (const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/gi)) {
    const name = readAttr(match[1], 'name')
    if (!name) continue
    const options = [...match[2].matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/gi)]
    const selected = options.filter((option) => /\bselected(?:\s*=|\s|>)/i.test(option[1]))
    const values = (selected.length ? selected : options.slice(0, 1)).map((option) => (
      readAttr(option[1], 'value') || textFromHtml(option[2])
    ))
    values.forEach((value) => body.append(name, value))
  }

  for (const match of html.matchAll(/<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi)) {
    const name = readAttr(match[1], 'name')
    if (name) body.append(name, textFromHtml(match[2], true))
  }
  return body
}

const positiveInteger = (value: number | undefined, fallback: number, maximum: number) => {
  if (!Number.isFinite(value)) return fallback
  return Math.max(1, Math.min(maximum, Math.trunc(value!)))
}

const splitSemester = (query: CourseCatalogQuery) => {
  const joined = normalizeInlineText(query.semesterId ?? '')
  const match = joined.match(/^(\d{2,3})\s*[-/]?\s*([1-4])$/)
  if (match) return { academicYear: match[1].padStart(3, '0'), semester: match[2] }
  return {
    academicYear: normalizeInlineText(query.academicYear ?? ''),
    semester: normalizeInlineText(query.semester ?? ''),
  }
}

const queryMode = (query: CourseCatalogQuery): CourseCatalogSearchMode => {
  if (query.mode) return query.mode
  if (query.instructor) return 'teacher'
  if (query.courseCode || query.courseTitle || query.keyword) return 'keyword'
  return 'department'
}

/**
 * Builds a TKE2210 WebForms request from the latest response HTML. A caller
 * must pass that latest HTML again for page 2+, because its VIEWSTATE carries
 * the server-side result state.
 */
export const buildCourseCatalogQueryBody = (html: string, query: CourseCatalogQuery) => {
  const body = appendWebFormsControls(new URLSearchParams(), html)
  const mode = queryMode(query)
  const { academicYear, semester } = splitSemester(query)
  const page = positiveInteger(query.page, 1, 100_000)
  const pageSize = positiveInteger(query.pageSize, 30, 200)
  const keywordClass = mode === 'teacher' ? '2' : query.courseCode ? '0' : '1'
  const keyword = mode === 'teacher'
    ? query.instructor ?? query.keyword ?? ''
    : query.courseCode ?? query.courseTitle ?? query.keyword ?? ''

  ;['QUERY_BTN1', 'QUERY_BTN3', 'QUERY_BTN4', 'QUERY_BTN5', 'QUERY_BTN6', 'QUERY_BTN7', 'QUERY_BTN8']
    .forEach((name) => body.delete(name))
  body.set('__EVENTTARGET', page > 1 ? 'ReQuery' : '')
  body.set('__EVENTARGUMENT', '')
  body.set('Q_AYEAR', academicYear)
  body.set('Q_SMS', semester)
  if (mode === 'department' && normalizeInlineText(query.degree ?? '')) {
    body.set('Q_DEGREE_CODE', normalizeInlineText(query.degree ?? ''))
  }
  if (mode === 'department' && normalizeInlineText(query.department ?? '')) {
    body.set('Q_FACULTY_CODE', normalizeInlineText(query.department ?? ''))
  }
  body.set('Q_GRADE', normalizeInlineText(query.grade ?? ''))
  body.set('Q_CLASSID', normalizeInlineText(query.className ?? ''))
  body.set('Q_CH_LESSON', normalizeInlineText(keyword))
  body.set('radioButtonClass', keywordClass)
  body.set('radioButtonQuery', query.match === 'exact' ? '0' : '1')
  body.set('Q_TCH_FACULTY_CODE', normalizeInlineText(query.instructorDepartment ?? query.department ?? ''))
  body.set('Q_LECTR_TCH_CH', normalizeInlineText(query.instructor ?? ''))
  body.set('QUERY_TYPE', mode === 'department' ? '1' : '2')
  body.set('hdnSelectedTab', mode === 'department' ? '0' : '1')
  body.set('PC$PageSize', String(pageSize))
  body.set('PC2$PageSize', String(pageSize))
  body.set('PC$PageNo', String(page))
  body.set('PC2$PageNo', String(page))

  if (page > 1) {
    body.set('ActivePageControl', 'PC')
  } else if (mode !== 'department') {
    body.set('QUERY_BTN7', '查詢')
  } else {
    body.set('QUERY_BTN1', '查詢')
  }
  return body.toString()
}

const tableRows = (html: string) => [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
  .map((row) => [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map<HtmlCell>((cell) => ({
    html: cell[1],
    text: textFromHtml(cell[1]),
  })))
  .filter((cells) => cells.length)

const detailValueByLabel = (html: string, patterns: RegExp[]) => {
  for (const cells of tableRows(html)) {
    const labelAt = cells.findIndex((cell) => patterns.some((pattern) => pattern.test(cell.text)))
    if (labelAt >= 0 && cells[labelAt + 1]) return textFromHtml(cells[labelAt + 1].html, true)
  }
  return ''
}

const detailUrlByLabel = (html: string, patterns: RegExp[]) => {
  for (const cells of tableRows(html)) {
    const labelAt = cells.findIndex((cell) => patterns.some((pattern) => pattern.test(cell.text)))
    const valueCell = labelAt >= 0 ? cells[labelAt + 1] : undefined
    if (!valueCell) continue
    const linkTag = valueCell.html.match(/<a\b([^>]*)>/i)?.[1] ?? ''
    const href = normalizeInlineText(readAttr(linkTag, 'href'))
    return href || textFromHtml(valueCell.html, true)
  }
  return ''
}

const resultTable = (html: string) => {
  const tables = [...html.matchAll(/<table\b([^>]*)>([\s\S]*?)<\/table>/gi)]
  const exact = tables.find((table) => /(?:^|[_-])DataGrid(?:["']|\b)/i.test(readAttr(table[1], 'id')))
    ?? tables.find((table) => /\bid=["']DataGrid["']/i.test(table[1]))
  const candidates = exact ? [exact] : tables
  return candidates.find((table) => {
    const text = textFromHtml(table[2])
    return /課號|課程代碼/.test(text) && /課名|課程名稱/.test(text)
  })?.[2] ?? ''
}

const headerIndex = (headers: string[], patterns: RegExp[], fallback = -1) => {
  const found = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)))
  return found >= 0 ? found : fallback
}

const optionalNumber = (value: string) => {
  const match = normalizeInlineText(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : null
}

const optionalBoolean = (value: string) => {
  const normalized = normalizeInlineText(value)
  // NTOU's result grid uses `V` as its checked marker for internship and
  // merged-course flags; some templates render the same value as a checkmark.
  if (/^(?:是|Y|Yes|有|V|✓|√)$/i.test(normalized)) return true
  if (/^(?:否|N|No|無)$/i.test(normalized)) return false
  return null
}

const normalizedSemesterId = (value: string) => {
  const normalized = normalizeInlineText(value)
  const match = normalized.match(/^(\d{2,3})\s*[-/]?\s*([1-4])$/)
  return match ? `${match[1].padStart(3, '0')}-${match[2]}` : normalized
}

const courseSource = (...values: string[]): CourseCatalogSource => (
  /校際|外校|臺北聯合|台北聯合|跨校/i.test(values.join(' ')) ? 'intercollegiate' : 'ntou'
)

const detailUrlFor = (pkno: string) => {
  if (!pkno) return ''
  const url = new URL(COURSE_DETAIL_URL)
  url.searchParams.set('PKNO', pkno)
  return url.toString()
}

const stableOfferingId = (values: string[]) => values
  .map((value) => normalizeInlineText(value).toLowerCase())
  .join('|')

const offeringFromCells = (cells: HtmlCell[], headers: string[]): CourseCatalogOffering | null => {
  const semesterAt = headerIndex(headers, [/^學期$|學年期|semester/i], 1)
  const codeAt = headerIndex(headers, [/課號|課程代碼|course\s*(?:code|number)/i], 2)
  const titleAt = headerIndex(headers, [/課名|課程名稱|course\s*(?:title|name)/i], 3)
  const departmentAt = headerIndex(headers, [/開課單位|開課系所|department/i], 4)
  const classAt = headerIndex(headers, [/年級班別|開課年班|grade.*class/i], 5)
  const instructorAt = headerIndex(headers, [/授課老師|授課教師|^教師$|instructor/i], 6)
  const instructorDepartmentAt = headerIndex(headers, [/老師單位|教師單位/i], 7)
  const creditsAt = headerIndex(headers, [/學分|credit/i], 8)
  const requirementAt = headerIndex(headers, [/選別|必選修|course\s*type/i], 9)
  const enrolledAt = headerIndex(headers, [/^人數$|選課人數|quantity/i], 10)
  const limitsAt = headerIndex(headers, [/上.*下限|人數限制|max.*min/i], 11)
  const internshipAt = headerIndex(headers, [/實習|laboratory/i], 12)
  const hoursAt = headerIndex(headers, [/時數|hour/i], 13)
  const crossListedAt = headerIndex(headers, [/合開|merge/i], 14)
  const termAt = headerIndex(headers, [/期限|學期別|term/i], 15)
  const value = (index: number) => index >= 0 ? cells[index]?.text ?? '' : ''
  const title = value(titleAt)
  const courseCode = value(codeAt)
  if (!title && !courseCode) return null

  const rowHtml = decodeHtmlEntities(cells.map((cell) => cell.html).join(' '))
  const detailPostback = rowHtml.match(
    /__doPostBack\s*\(\s*['"]([^'"]*\$COSID)['"]\s*,/i,
  )?.[1] ?? ''
  const pkno = rowHtml.match(/fn_open\s*\(\s*['"]?([\w-]+)/i)?.[1]
    ?? rowHtml.match(/[?&]PKNO=([\w-]+)/i)?.[1]
    ?? ''
  const limits = value(limitsAt).match(/\d+(?:\.\d+)?/g)?.map(Number) ?? []
  const semesterId = normalizedSemesterId(value(semesterAt))
  const department = value(departmentAt)
  const instructorDepartment = value(instructorDepartmentAt)
  const source = courseSource(department, instructorDepartment, courseCode, title)
  const id = pkno || stableOfferingId([
    semesterId,
    courseCode,
    title,
    department,
    value(classAt),
    value(instructorAt),
  ])

  return {
    id,
    pkno,
    detailPostback,
    semesterId,
    courseCode,
    title,
    department,
    className: value(classAt),
    instructor: value(instructorAt),
    instructorDepartment,
    credits: optionalNumber(value(creditsAt)),
    requirement: value(requirementAt),
    enrolledCount: optionalNumber(value(enrolledAt)),
    maximumStudents: limits[0] ?? null,
    minimumStudents: limits[1] ?? null,
    internship: optionalBoolean(value(internshipAt)),
    hours: optionalNumber(value(hoursAt)),
    crossListed: optionalBoolean(value(crossListedAt)),
    term: value(termAt),
    source,
    detailUrl: detailUrlFor(pkno),
  }
}

const numberByElementId = (html: string, id: string, fallback: number) => {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const span = html.match(new RegExp(`\\bid=["']${escaped}["'][^>]*>\\s*(\\d+)`, 'i'))?.[1]
  const input = html.match(new RegExp(`<input\\b(?=[^>]*(?:id|name)=["']${escaped}["'])[^>]*>`, 'i'))?.[0]
  return Number(span ?? (input ? readAttr(input, 'value') : '')) || fallback
}

export const filterCourseCatalogOfferings = (
  offerings: CourseCatalogOffering[],
  query: CourseCatalogQuery,
) => {
  const code = normalizeInlineText(query.courseCode ?? '').toLowerCase()
  const title = normalizeInlineText(query.courseTitle ?? query.keyword ?? '').toLowerCase()
  const instructor = normalizeInlineText(query.instructor ?? '').toLowerCase()
  const department = normalizeInlineText(query.department ?? '').toLowerCase()
  const filterDepartmentAsText = department && !/^[0-9a-z_-]+$/i.test(department)
  const expectedSemester = normalizedSemesterId(query.semesterId ?? `${query.academicYear ?? ''}${query.semester ?? ''}`)
  return offerings.filter((offering) => (
    (!code || offering.courseCode.toLowerCase().includes(code)) &&
    (!title || offering.title.toLowerCase().includes(title)) &&
    (!instructor || offering.instructor.toLowerCase().includes(instructor)) &&
    (!filterDepartmentAsText || offering.department.toLowerCase().includes(department)) &&
    (!expectedSemester || offering.semesterId === expectedSemester) &&
    (!query.source || query.source === 'all' || offering.source === query.source)
  ))
}

export const parseCourseCatalogResults = (
  html: string,
  query: CourseCatalogQuery = {},
): CourseCatalogSearchResult => {
  const rows = tableRows(resultTable(html))
  const headerAt = rows.findIndex((cells) => {
    const text = cells.map((cell) => cell.text).join(' ')
    return /課號|課程代碼/.test(text) && /課名|課程名稱/.test(text)
  })
  const headers = headerAt >= 0 ? rows[headerAt].map((cell) => cell.text) : []
  const parsed = (headerAt >= 0 ? rows.slice(headerAt + 1) : [])
    .map((cells) => offeringFromCells(cells, headers))
    .filter((item): item is CourseCatalogOffering => Boolean(item))
  const unique = [...new Map(parsed.map((item) => [item.id, item])).values()]
  const items = filterCourseCatalogOfferings(unique, query)
  const pageSize = numberByElementId(html, 'PC_PageSize', positiveInteger(query.pageSize, Math.max(items.length, 1), 200))
  return {
    items,
    page: numberByElementId(html, 'PC_PageNo', positiveInteger(query.page, 1, 100_000)),
    pageSize,
    totalPages: numberByElementId(html, 'PC_TotalPage', items.length ? 1 : 0),
    totalItems: numberByElementId(html, 'PC_TotalRow', items.length),
  }
}

const splitList = (value: string) => value
  .split(/[,，;；\n]+/)
  .map(normalizeInlineText)
  .filter(Boolean)

export const parseCourseCatalogDetail = (
  html: string,
  requestedPkno = '',
): CourseCatalogDetail => {
  const pkno = normalizeInlineText(requestedPkno || readElementById(html, 'M_PKNO'))
  const semesterId = normalizedSemesterId(readElementById(html, 'M_AYEARSMS'))
  const courseCode = readElementById(html, 'M_COSID')
  const title = readElementById(html, 'CH_LESSON') || readElementById(html, 'M_CH_LESSON_CURRI_EXPL')
  const department = readElementById(html, 'M_FACULTY_NAME')
  const instructor = readElementById(html, 'M_LECTR_TCH_CH')
  const className = readElementById(html, 'M_GRADE')
  const maximumStudents = optionalNumber(readElementById(html, 'M_MAX_ST'))
  const minimumStudents = optionalNumber(readElementById(html, 'M_MIN_ST'))
  const source = courseSource(department, courseCode, title)
  const id = pkno || stableOfferingId([semesterId, courseCode, title, department, className, instructor])

  return {
    id,
    pkno,
    detailPostback: '',
    semesterId,
    courseCode,
    title,
    department,
    className,
    instructor,
    instructorDepartment: '',
    credits: optionalNumber(readElementById(html, 'M_CRD')),
    requirement: readElementById(html, 'M_MUST'),
    enrolledCount: optionalNumber(readElementById(html, 'M_CHOICE_QTY')),
    maximumStudents,
    minimumStudents,
    internship: optionalBoolean(readElementById(html, 'M_CLASS_LAB')),
    hours: optionalNumber(readElementById(html, 'M_LECTR_HOUR')),
    crossListed: optionalBoolean(readElementById(html, 'M_IS_CROSS_FACULTY_MERGE')),
    masterDoctorCombined: optionalBoolean(readElementById(html, 'M_IS_MAST_DOCTOR_MERGE')),
    term: readElementById(html, 'M_COSTERM'),
    source,
    detailUrl: detailUrlFor(pkno),
    englishTitle: readElementById(html, 'M_ENG_LESSON'),
    allEnglish: optionalBoolean(readElementById(html, 'M_COS_ENGLISH_FG')),
    meetingTimes: splitList(readElementById(html, 'M_SEG', true)),
    classrooms: splitList(readElementById(html, 'M_CLSSRM_ID', true)),
    deliveryMode: readElementById(html, 'M_IS_LONGDIST_CURRI'),
    audience: '',
    mainField: readElementById(html, 'M_MAIN_NAME', true),
    subField: readElementById(html, 'M_CHILD_NAME', true),
    coInstructors: readElementById(html, 'TCH_NAME_LIST', true),
    coreCompetencies: readElementById(html, 'L_CORE_ABILITY', true),
    characteristicField: readElementById(html, 'L_TRAIT_DOMAIN', true),
    notes: [
      readElementById(html, 'M_DESCRIPTION', true),
      readElementById(html, 'M_RMK', true),
    ]
      .filter(Boolean)
      .join('\n'),
    objectiveZh: readElementById(html, 'M_CH_TARGET', true),
    objectiveEn: readElementById(html, 'M_ENG_TARGET', true),
    prerequisitesZh: readElementById(html, 'M_CH_PREOBJ', true),
    prerequisitesEn: readElementById(html, 'M_ENG_PREOBJ', true),
    contentZh: readElementById(html, 'M_CH_OBJECT', true),
    contentEn: readElementById(html, 'M_ENG_OBJECT', true),
    teachingMethodZh: readElementById(html, 'M_CH_TEACH', true),
    teachingMethodEn: readElementById(html, 'M_ENG_TEACH', true),
    referencesZh: readElementById(html, 'M_CH_REF', true),
    referencesEn: readElementById(html, 'M_ENG_REF', true),
    scheduleZh: readElementById(html, 'M_CH_TEACHSCH', true),
    scheduleEn: readElementById(html, 'M_ENG_TEACHSCH', true),
    evaluationZh: readElementById(html, 'M_CH_TYPE', true),
    evaluationEn: readElementById(html, 'M_ENG_TYPE', true),
    sustainableDevelopmentGoals: readElementById(html, 'L_SUSTAINABLE_DEVE_GOAL', true)
      || detailValueByLabel(html, [/永續發展目標|sustainable\s+development/i]),
    referenceUrl: detailUrlByLabel(html, [/參考網址|reference\s*(?:url|website)/i])
      || readElementById(html, 'M_DOWNLOAD_ADDR', true),
    downloadUrl: readElementById(html, 'M_DOWNLOAD_ADDR'),
  }
}
