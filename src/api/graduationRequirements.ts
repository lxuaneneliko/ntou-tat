import { ApiError } from './errors'
import { DEPARTMENT_SITES } from './departmentSites'
import graduationCurriculaSnapshot from '../data/graduationCurricula.json'
import {
  assertOk,
  portalRequest,
  readEncryptedPortalCache,
  writeEncryptedPortalCache,
} from './portalHttp'

export const GRADUATION_DEPARTMENT_CODES = {
  mmd: '0701',
  dstm: '0703',
  tsweb: '0608',
  dme: '060F',
  dotm: '0706',
  oom: '0707',
  fs: '0302',
  aqua: '0303',
  dbb: '030B',
  bmb: '0308',
  fd: '0301',
  mei: '0801',
  me: '0702',
  se: '0501',
  hreweb: '0502',
  oet: '0506',
  ee: '0503',
  cse: '0507',
  cnce: '060C',
  omt: '0809',
  ccdi: '090E',
  dolp: '1001',
} as const

export const GRADUATION_DEPARTMENT_VARIANTS = {
  dme: [
    { code: '060A', name: '能源應用組' },
    { code: '060D', name: '動力工程組' },
    { code: '0606', name: '四年制' },
  ],
  fs: [
    { code: '030A', name: '生物科技組' },
    { code: '0309', name: '食品科學組' },
  ],
  omt: [
    { code: '0808', name: '光電與材料科技學士學位學程' },
  ],
} satisfies Partial<Record<keyof typeof GRADUATION_DEPARTMENT_CODES, { code: string; name: string }[]>>

export type GraduationDepartmentId = keyof typeof GRADUATION_DEPARTMENT_CODES

export type GraduationRequirementKind = 'course' | 'group' | 'threshold'

export type GraduationCourseRequirement = {
  id: string
  category: string
  title: string
  codes: string[]
  credits: number
  notes: string
  kind: GraduationRequirementKind
}

export type GraduationCurriculum = {
  departmentId: GraduationDepartmentId
  departmentCode: string
  departmentName: string
  programVariantCode?: string
  programVariantName?: string
  requestedYear: number
  sourceYear: number
  fallbackUsed: boolean
  enrollmentIdentity: string
  durationYears: number | null
  commonRequiredCredits: number
  departmentRequiredCredits: number
  requiredCredits: number
  electiveMinimumCredits: number
  departmentElectiveMinimumCredits: number | null
  outsideElectiveMaximumCredits: number | null
  graduationMinimumCredits: number
  requirements: GraduationCourseRequirement[]
  electiveNotes: string
  graduationNotes: string
  generalNotes: string
  fetchedAt: string
  sourceUrl: string
}

export type GraduationElectiveConstraints = {
  departmentMinimumCredits: number | null
  outsideMaximumCredits: number | null
}

const AIS_BASE_URL = 'https://ais.ntou.edu.tw/'
const OUTSIDE_URL = new URL(
  'outside.aspx?mainPage=QQBwAHAAbABpAGMAYQB0AGkAbwBuAC8ARQBOAFIALwBFAE4AUgBBADAALwBFAE4AUgBBADEAMgAwAF8ALgBhAHMAcAB4AD8AcAByAG8AZwBjAGQAPQBFAE4AUgBBADEAMgAwAA%3D%3D',
  AIS_BASE_URL,
).toString()
const ENTRY_URL = new URL('Application/ENR/ENRA0/ENRA120_.aspx?progcd=ENRA120', AIS_BASE_URL).toString()
const QUERY_URL = new URL('Application/ENR/ENRA0/ENRA120_01.aspx', AIS_BASE_URL).toString()
export const GRADUATION_REQUIREMENTS_SOURCE_URL = 'https://www.ntou.edu.tw/threshold'
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const MAX_FALLBACK_YEARS = 6

type GraduationCurriculaSnapshot = {
  metadata: {
    fetchedAt: string
    departmentCount: number
    requestedYears: number[]
    storedCombinationCount: number
  }
  curricula: Record<string, GraduationCurriculum>
  curriculumVariants: Record<string, GraduationCurriculum[]>
}

const bundledSnapshot = graduationCurriculaSnapshot as GraduationCurriculaSnapshot

const cleanText = (value: string | null | undefined) => (value ?? '')
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/gu, '')
  .replace(/\s+/gu, ' ')
  .trim()

const textWithBreaks = (element: Element | undefined) => {
  if (!element) return ''
  const clone = element.cloneNode(true) as Element
  clone.querySelectorAll('br').forEach((node) => node.replaceWith('\n'))
  return (clone.textContent ?? '')
    .split(/\n+/u)
    .map(cleanText)
    .filter(Boolean)
    .join('\n')
}

const numberFrom = (value: string) => {
  const match = cleanText(value).match(/-?\d+(?:\.\d+)?/u)
  const parsed = match ? Number(match[0]) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

const courseCodesFrom = (value: string) => [
  ...new Set(value.toUpperCase().match(/[A-Z][A-Z0-9]{5,}/gu) ?? []),
]

const normalizeRequirementTitle = (value: string) => cleanText(value)
  .replace(/^\d{1,2}\s*[-–—]\s*/u, '')

const requirementKind = (title: string, codes: string[]): GraduationRequirementKind => {
  if (/畢業門檻/u.test(title)) return 'threshold'
  if (
    !codes.length &&
    /(?:國文領域|博雅課程|博雅領域|體育課程|進階英文|外文領域|語文領域|共同教育|主領域|副領域|系訂必選|學習領域|課群|學群|模組|組別)/u.test(title)
  ) return 'group'
  return 'course'
}

const summaryValue = (rows: HTMLTableRowElement[], label: string) => {
  const row = rows.find((candidate) => cleanText(candidate.cells[0]?.textContent).includes(label))
  if (!row) return 0
  return numberFrom([...row.cells].slice(1).map((cell) => cleanText(cell.textContent)).join(' '))
}

const summaryNote = (rows: HTMLTableRowElement[], label: string) => {
  const row = rows.find((candidate) => cleanText(candidate.cells[0]?.textContent) === label)
  return row ? cleanText([...row.cells].slice(1).map((cell) => cell.textContent).join(' ')) : ''
}

export const parseGraduationElectiveConstraints = (
  electiveMinimumCredits: number,
  electiveNotes: string,
  graduationNotes: string,
): GraduationElectiveConstraints => {
  const text = cleanText(`${electiveNotes} ${graduationNotes}`)
  const departmentPatterns = [
    /(?:須含|其中)?\s*(?:本系|系內)(?:所開設之)?(?:其他)?選修(?:課程)?(?:至少|不得少於)\s*(\d+(?:\.\d+)?)\s*學分/u,
    /(?:本系|系內)(?:所開設之)?(?:其他)?選修(?:課程)?\s*(\d+(?:\.\d+)?)\s*學分/u,
  ]
  const outsidePatterns = [
    /系外選修(?:課程)?[^。；;]*?(?:以|最多|上限(?:為)?)\s*(\d+(?:\.\d+)?)\s*學分/u,
    /系外選修(?:課程)?[^。；;]*?(\d+(?:\.\d+)?)\s*學分(?:為限|上限)/u,
  ]
  const departmentMinimumCredits = departmentPatterns
    .map((pattern) => Number(text.match(pattern)?.[1] ?? 0))
    .find((value) => value > 0) ?? null
  const explicitOutsideMaximum = outsidePatterns
    .map((pattern) => Number(text.match(pattern)?.[1] ?? 0))
    .find((value) => value > 0) ?? null
  const derivedOutsideMaximum = departmentMinimumCredits !== null && electiveMinimumCredits >= departmentMinimumCredits
    ? electiveMinimumCredits - departmentMinimumCredits
    : null
  return {
    departmentMinimumCredits,
    outsideMaximumCredits: explicitOutsideMaximum ?? derivedOutsideMaximum,
  }
}

export const parseGraduationCurriculum = (
  html: string,
  departmentId: GraduationDepartmentId,
  requestedYear: number,
): GraduationCurriculum | null => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const table = document.querySelector<HTMLTableElement>('#DataGrid1')
  if (!table) return null

  const bodyText = cleanText(document.body.textContent)
  const sourceYear = Number(bodyText.match(/(\d{2,3})\s*學年度入學生適用/u)?.[1] ?? 0)
  const graduationMinimumCredits = summaryValue([...table.rows], '畢業最低學分數')
  if (!sourceYear || !graduationMinimumCredits) return null

  const department = DEPARTMENT_SITES.find((site) => site.id === departmentId)
  const headingName = bodyText.match(/國立臺灣海洋大學\s+(.+?)\s+必修科目表/u)?.[1]
  const identity = bodyText.match(/入學身份\s*[:：]\s*([^科查]+?)(?:科目類別|查詢結果)/u)?.[1]
    ?? bodyText.match(/入學身份\s*[:：]\s*([^ ]+)/u)?.[1]
    ?? '一般生'
  const durationYears = Number(bodyText.match(/本系修業學年為\s*(\d+)\s*年/u)?.[1] ?? 0) || null

  const requirements: GraduationCourseRequirement[] = []
  let currentCategory = ''

  ;[...table.rows].forEach((row, rowIndex) => {
    if (row.querySelector('th')) return
    const cells = [...row.cells]
    if (!cells.length) return
    const firstText = cleanText(cells[0].textContent)
    if (/小計|^總學分$|學分數(?:備註)?$|^備註$/u.test(firstText)) return

    const hasCategoryCell = cells[0].hasAttribute('rowspan') && cells.length >= 15
    if (hasCategoryCell) currentCategory = firstText
    const courseCell = cells[hasCategoryCell ? 1 : 0]
    const creditCell = cells[hasCategoryCell ? 2 : 1]
    if (!courseCell || !creditCell) return

    const parts = textWithBreaks(courseCell).split('\n').filter(Boolean)
    const rawTitle = parts[0] ?? ''
    const title = normalizeRequirementTitle(rawTitle)
    const codes = courseCodesFrom(parts.slice(1).join(' '))
    const credits = numberFrom(creditCell.textContent ?? '')
    const notes = cleanText(cells.at(-1)?.textContent)
    if (!title || !currentCategory) return

    requirements.push({
      id: `${departmentId}-${sourceYear}-${rowIndex}-${codes.join('-') || title}`,
      category: currentCategory,
      title,
      codes,
      credits,
      notes,
      kind: requirementKind(title, codes),
    })
  })

  const electiveMinimumCredits = summaryValue([...table.rows], '選修最低學分數')
  const electiveNotes = summaryNote([...table.rows], '選修最低學分數備註')
  const graduationNotes = summaryNote([...table.rows], '畢業最低學分數備註')
  const electiveConstraints = parseGraduationElectiveConstraints(
    electiveMinimumCredits,
    electiveNotes,
    graduationNotes,
  )

  return {
    departmentId,
    departmentCode: GRADUATION_DEPARTMENT_CODES[departmentId],
    departmentName: cleanText(headingName) || department?.name || departmentId,
    requestedYear,
    sourceYear,
    fallbackUsed: sourceYear !== requestedYear,
    enrollmentIdentity: cleanText(identity),
    durationYears,
    commonRequiredCredits: summaryValue([...table.rows], '共同教育課程學分小計'),
    departmentRequiredCredits: summaryValue([...table.rows], '系訂專業必修學分小計'),
    requiredCredits: summaryValue([...table.rows], '必修總學分數'),
    electiveMinimumCredits,
    departmentElectiveMinimumCredits: electiveConstraints.departmentMinimumCredits,
    outsideElectiveMaximumCredits: electiveConstraints.outsideMaximumCredits,
    graduationMinimumCredits,
    requirements,
    electiveNotes,
    graduationNotes,
    generalNotes: summaryNote([...table.rows], '備註'),
    fetchedAt: new Date().toISOString(),
    sourceUrl: GRADUATION_REQUIREMENTS_SOURCE_URL,
  }
}

const formFields = (html: string) => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const form = document.querySelector<HTMLFormElement>('form')
  const body = new URLSearchParams()
  if (!form) return body

  Array.from(form.elements).forEach((control) => {
    if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return
    if (!control.name || control.disabled) return
    if (control instanceof HTMLInputElement && ['submit', 'button', 'reset', 'file', 'image'].includes(control.type.toLowerCase())) return
    body.append(control.name, control.value ?? '')
  })
  return body
}

export const buildGraduationCurriculumQueryBody = (
  html: string,
  departmentId: GraduationDepartmentId,
  year: number,
  departmentCode: string = GRADUATION_DEPARTMENT_CODES[departmentId],
) => {
  const body = formFields(html)
  body.set('__EVENTTARGET', '')
  body.set('__EVENTARGUMENT', '')
  body.set('Q_ENROLL_AYEAR', String(year).padStart(3, '0'))
  body.set('Q_RQ_CRS_TYPE', '1')
  body.set('Q_DEGREE_CODE', '0')
  body.set('Q_FACULTY_CODE', departmentCode)
  body.set('Q_ENROLL_ID', '01')
  body.set('QUERY_BTN1', '查詢')
  return body.toString()
}

const requestHeaders = (referer: string, form = false) => ({
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Referer: referer,
  ...(form ? {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    Origin: 'https://ais.ntou.edu.tw',
  } : {}),
})

const curriculumCacheKey = (
  departmentId: GraduationDepartmentId,
  year: number,
  programVariantCode?: string,
) => `graduation_curriculum_v4:${departmentId}:${year}:${programVariantCode ?? 'default'}`

export const getBundledGraduationCurriculumOptions = (
  departmentId: GraduationDepartmentId,
  requestedYear: number,
): GraduationCurriculum[] => {
  for (let year = requestedYear; year >= Math.max(76, requestedYear - MAX_FALLBACK_YEARS); year -= 1) {
    const stored = bundledSnapshot.curricula[`${departmentId}:${year}`]
    const variants = bundledSnapshot.curriculumVariants[`${departmentId}:${year}`] ?? []
    const options = stored ? [stored] : variants
    if (!options.length) continue
    return options.map((option) => ({
      ...option,
      requestedYear,
      fallbackUsed: option.sourceYear !== requestedYear,
    }))
  }
  return []
}

export const getBundledGraduationCurriculum = (
  departmentId: GraduationDepartmentId,
  requestedYear: number,
  programVariantCode?: string,
): GraduationCurriculum | null => {
  const options = getBundledGraduationCurriculumOptions(departmentId, requestedYear)
  if (programVariantCode) {
    return options.find((option) => option.programVariantCode === programVariantCode) ?? null
  }
  return options.length === 1 ? options[0] : null
}

const readCachedCurriculum = async (
  departmentId: GraduationDepartmentId,
  year: number,
  programVariantCode?: string,
) => {
  try {
    const raw = await readEncryptedPortalCache(curriculumCacheKey(departmentId, year, programVariantCode))
    if (!raw) return null
    const parsed = JSON.parse(raw) as GraduationCurriculum
    const age = Date.now() - new Date(parsed.fetchedAt).getTime()
    return age >= 0 && age <= CACHE_MAX_AGE_MS ? parsed : null
  } catch {
    return null
  }
}

const mockCurriculum = (departmentId: GraduationDepartmentId, requestedYear: number): GraduationCurriculum => {
  const department = DEPARTMENT_SITES.find((site) => site.id === departmentId)!
  return {
    departmentId,
    departmentCode: GRADUATION_DEPARTMENT_CODES[departmentId],
    departmentName: department.name,
    requestedYear,
    sourceYear: requestedYear,
    fallbackUsed: false,
    enrollmentIdentity: '一般生',
    durationYears: 4,
    commonRequiredCredits: 28,
    departmentRequiredCredits: departmentId === 'cse' ? 50 : departmentId === 'me' ? 74 : 42,
    requiredCredits: departmentId === 'cse' ? 78 : departmentId === 'me' ? 114 : 70,
    electiveMinimumCredits: departmentId === 'cse' ? 57 : departmentId === 'me' ? 18 : 58,
    departmentElectiveMinimumCredits: departmentId === 'me' ? 12 : null,
    outsideElectiveMaximumCredits: departmentId === 'me' ? 6 : null,
    graduationMinimumCredits: departmentId === 'cse' ? 135 : departmentId === 'me' ? 132 : 128,
    requirements: [
      { id: 'mock-chinese', category: '共同教育課程', title: '國文領域', codes: [], credits: 4, notes: '上下學期各二學分。', kind: 'group' },
      { id: 'mock-general', category: '共同教育課程', title: '博雅課程', codes: [], credits: 14, notes: '依四大領域採計。', kind: 'group' },
      { id: 'mock-physical-education', category: '共同教育課程', title: '體育課程', codes: [], credits: 0, notes: '須修滿四學期零學分體育。', kind: 'group' },
      { id: 'mock-advanced-english', category: '共同教育課程', title: '進階英文', codes: [], credits: 2, notes: '請依成績單選擇採計課程。', kind: 'group' },
      ...(departmentId === 'me' ? [{
        id: 'mock-me-main-domain',
        category: '系訂主領域必修及選修',
        title: '機械系主領域',
        codes: [],
        credits: 12,
        notes: '請依學習領域修課規定，選擇所屬主領域的已修課程。',
        kind: 'group' as const,
      }] : []),
      { id: 'mock-ocean', category: '共同教育課程', title: '海洋科學概論', codes: ['B9M01Z64'], credits: 2, notes: '', kind: 'course' },
      { id: 'mock-ai', category: '共同教育課程', title: '人工智慧概論', codes: ['B9M01024'], credits: 2, notes: '', kind: 'course' },
      { id: 'mock-data-structure', category: '系訂專業必修', title: '資料結構', codes: ['CS220'], credits: 3, notes: '', kind: 'course' },
      { id: 'mock-database', category: '系訂專業必修', title: '資料庫系統', codes: ['CS330'], credits: 3, notes: '', kind: 'course' },
      { id: 'mock-swim', category: '共同教育課程', title: '游泳畢業門檻', codes: ['B92A12P5'], credits: 0, notes: '完成五十公尺或符合免修規定。', kind: 'threshold' },
      { id: 'mock-english', category: '共同教育課程', title: '英文畢業門檻', codes: ['B9D03TVS'], credits: 0, notes: '依校方英文畢業門檻規定。', kind: 'threshold' },
    ],
    electiveNotes: departmentId === 'me'
      ? '須含本系選修課程至少12學分'
      : '實際選修領域與外系學分上限請依官方必修科目表。',
    graduationNotes: departmentId === 'me'
      ? '需修習本系所開設之課程至少98學分：共同專業必修74學分、主領域至少12學分及本系其他選修12學分。'
      : '',
    generalNotes: '模擬資料僅供介面測試。',
    fetchedAt: new Date().toISOString(),
    sourceUrl: GRADUATION_REQUIREMENTS_SOURCE_URL,
  }
}

export const fetchGraduationCurriculum = async (
  departmentId: GraduationDepartmentId,
  requestedYear: number,
  force = false,
  programVariantCode?: string,
): Promise<GraduationCurriculum> => {
  if (!(departmentId in GRADUATION_DEPARTMENT_CODES)) {
    throw new ApiError('找不到這個系所的畢業門檻設定', 404, 'GRADUATION_DEPARTMENT_NOT_FOUND')
  }
  if (!Number.isInteger(requestedYear) || requestedYear < 76 || requestedYear > 199) {
    throw new ApiError('入學年度格式不正確', 400, 'GRADUATION_YEAR_INVALID')
  }
  const variant = programVariantCode
    ? GRADUATION_DEPARTMENT_VARIANTS[departmentId as keyof typeof GRADUATION_DEPARTMENT_VARIANTS]
      ?.find((candidate) => candidate.code === programVariantCode)
    : undefined
  if (programVariantCode && !variant) {
    throw new ApiError('找不到這個系所的舊制組別', 404, 'GRADUATION_VARIANT_NOT_FOUND')
  }
  const departmentCode = variant?.code ?? GRADUATION_DEPARTMENT_CODES[departmentId]
  if (import.meta.env.VITE_NTOU_AUTH_MODE === 'mock') {
    const mock = mockCurriculum(departmentId, requestedYear)
    return variant ? {
      ...mock,
      departmentCode: variant.code,
      programVariantCode: variant.code,
      programVariantName: variant.name,
    } : mock
  }

  if (!force) {
    const cached = await readCachedCurriculum(departmentId, requestedYear, programVariantCode)
    if (cached) return cached
    const bundled = getBundledGraduationCurriculum(departmentId, requestedYear, programVariantCode)
    if (bundled) return bundled
  }

  const outside = await portalRequest({ url: OUTSIDE_URL, method: 'GET', headers: requestHeaders(AIS_BASE_URL), timeoutMs: 30000 })
  assertOk(outside, '無法開啟海大必修科目表')
  const entry = await portalRequest({ url: ENTRY_URL, method: 'GET', headers: requestHeaders(OUTSIDE_URL), timeoutMs: 30000 })
  assertOk(entry, '無法開啟海大必修科目表')
  let queryPage = await portalRequest({ url: QUERY_URL, method: 'GET', headers: requestHeaders(OUTSIDE_URL), timeoutMs: 30000 })
  assertOk(queryPage, '無法讀取海大必修科目表查詢條件')

  for (let year = requestedYear; year >= Math.max(76, requestedYear - MAX_FALLBACK_YEARS); year -= 1) {
    const result = await portalRequest({
      url: QUERY_URL,
      method: 'POST',
      headers: requestHeaders(QUERY_URL, true),
      data: buildGraduationCurriculumQueryBody(queryPage.data, departmentId, year, departmentCode),
      timeoutMs: 45000,
    })
    assertOk(result, '無法查詢海大必修科目表')
    const parsed = parseGraduationCurriculum(result.data, departmentId, requestedYear)
    const curriculum = parsed && variant ? {
      ...parsed,
      departmentCode: variant.code,
      programVariantCode: variant.code,
      programVariantName: variant.name,
    } : parsed
    if (curriculum) {
      await writeEncryptedPortalCache(
        curriculumCacheKey(departmentId, requestedYear, programVariantCode),
        JSON.stringify(curriculum),
      ).catch(() => undefined)
      return curriculum
    }
    queryPage = result
  }

  throw new ApiError(
    `${requestedYear} 學年度及之前 ${MAX_FALLBACK_YEARS} 年查無必修科目表`,
    404,
    'GRADUATION_CURRICULUM_NOT_FOUND',
  )
}
