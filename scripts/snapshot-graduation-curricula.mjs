import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { JSDOM } from 'jsdom'

const AIS_BASE_URL = 'https://ais.ntou.edu.tw/'
const OUTSIDE_URL = new URL(
  'outside.aspx?mainPage=QQBwAHAAbABpAGMAYQB0AGkAbwBuAC8ARQBOAFIALwBFAE4AUgBBADAALwBFAE4AUgBBADEAMgAwAF8ALgBhAHMAcAB4AD8AcAByAG8AZwBjAGQAPQBFAE4AUgBBADEAMgAwAA%3D%3D',
  AIS_BASE_URL,
).toString()
const ENTRY_URL = new URL('Application/ENR/ENRA0/ENRA120_.aspx?progcd=ENRA120', AIS_BASE_URL).toString()
const QUERY_URL = new URL('Application/ENR/ENRA0/ENRA120_01.aspx', AIS_BASE_URL).toString()
const SOURCE_URL = 'https://www.ntou.edu.tw/threshold'

const departments = [
  ['mmd', '0701', '商船學系'],
  ['dstm', '0703', '航運管理學系'],
  ['tsweb', '0608', '運輸科學系'],
  ['dme', '060F', '輪機工程學系'],
  ['dotm', '0706', '海洋觀光管理學士學位學程'],
  ['oom', '0707', '海洋經營管理學士學位學程'],
  ['fs', '0302', '食品科學系'],
  ['aqua', '0303', '水產養殖學系'],
  ['dbb', '030B', '生命科學暨生物科技學系'],
  ['bmb', '0308', '海洋生物科技學士學位學程'],
  ['fd', '0301', '環境生物與漁業科學學系'],
  ['mei', '0801', '海洋環境資訊系'],
  ['me', '0702', '機械與機電工程學系'],
  ['se', '0501', '系統工程暨造船學系'],
  ['hreweb', '0502', '河海工程學系'],
  ['oet', '0506', '海洋工程科技學士學位學程'],
  ['ee', '0503', '電機工程學系'],
  ['cse', '0507', '資訊工程學系'],
  ['cnce', '060C', '通訊與導航工程學系'],
  ['omt', '0809', '光電與材料科技學系'],
  ['ccdi', '090E', '海洋文創設計產業學士學位學程'],
  ['dolp', '1001', '海洋法政學士學位學程'],
].map(([id, code, name]) => ({ id, code, name }))

const historicalVariants = {
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
}

const cleanText = (value) => (value ?? '')
  .normalize('NFKC')
  .replace(/[\u200B-\u200D\uFEFF]/gu, '')
  .replace(/\s+/gu, ' ')
  .trim()

const numberFrom = (value) => {
  const match = cleanText(value).match(/-?\d+(?:\.\d+)?/u)
  const parsed = match ? Number(match[0]) : 0
  return Number.isFinite(parsed) ? parsed : 0
}

const textWithBreaks = (element) => {
  if (!element) return ''
  const clone = element.cloneNode(true)
  clone.querySelectorAll('br').forEach((node) => node.replaceWith('\n'))
  return (clone.textContent ?? '')
    .split(/\n+/u)
    .map(cleanText)
    .filter(Boolean)
    .join('\n')
}

const requirementKind = (title, codes) => {
  if (/畢業門檻/u.test(title)) return 'threshold'
  if (
    !codes.length &&
    /(?:國文領域|博雅課程|博雅領域|體育課程|進階英文|外文領域|語文領域|共同教育|主領域|副領域|系訂必選|學習領域|課群|學群|模組|組別)/u.test(title)
  ) return 'group'
  return 'course'
}

const summaryValue = (rows, label) => {
  const row = rows.find((candidate) => cleanText(candidate.cells[0]?.textContent).includes(label))
  return row ? numberFrom([...row.cells].slice(1).map((cell) => cleanText(cell.textContent)).join(' ')) : 0
}

const summaryNote = (rows, label) => {
  const row = rows.find((candidate) => cleanText(candidate.cells[0]?.textContent) === label)
  return row ? cleanText([...row.cells].slice(1).map((cell) => cell.textContent).join(' ')) : ''
}

const parseElectiveConstraints = (electiveMinimumCredits, electiveNotes, graduationNotes) => {
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
  return {
    departmentMinimumCredits,
    outsideMaximumCredits: explicitOutsideMaximum ?? (
      departmentMinimumCredits !== null && electiveMinimumCredits >= departmentMinimumCredits
        ? electiveMinimumCredits - departmentMinimumCredits
        : null
    ),
  }
}

const parseCurriculum = (html, department, requestedYear, fetchedAt) => {
  const document = new JSDOM(html).window.document
  const table = document.querySelector('#DataGrid1')
  if (!table) return null
  const rows = [...table.rows]
  const bodyText = cleanText(document.body.textContent)
  const sourceYear = Number(bodyText.match(/(\d{2,3})\s*學年度入學生適用/u)?.[1] ?? 0)
  const graduationMinimumCredits = summaryValue(rows, '畢業最低學分數')
  if (!sourceYear || !graduationMinimumCredits) return null

  const requirements = []
  let currentCategory = ''
  rows.forEach((row, rowIndex) => {
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
    const title = cleanText(parts[0]).replace(/^\d{1,2}\s*[-–—]\s*/u, '')
    const codes = [...new Set(parts.slice(1).join(' ').toUpperCase().match(/[A-Z][A-Z0-9]{5,}/gu) ?? [])]
    const notes = cleanText(cells.at(-1)?.textContent)
    if (!title || !currentCategory) return
    requirements.push({
      id: `${department.id}-${sourceYear}-${rowIndex}-${codes.join('-') || title}`,
      category: currentCategory,
      title,
      codes,
      credits: numberFrom(creditCell.textContent ?? ''),
      notes,
      kind: requirementKind(title, codes),
    })
  })

  const electiveMinimumCredits = summaryValue(rows, '選修最低學分數')
  const electiveNotes = summaryNote(rows, '選修最低學分數備註')
  const graduationNotes = summaryNote(rows, '畢業最低學分數備註')
  const electiveConstraints = parseElectiveConstraints(electiveMinimumCredits, electiveNotes, graduationNotes)
  const headingName = bodyText.match(/國立臺灣海洋大學\s+(.+?)\s+必修科目表/u)?.[1]
  const identity = bodyText.match(/入學身份\s*[:：]\s*([^科查]+?)(?:科目類別|查詢結果)/u)?.[1]
    ?? bodyText.match(/入學身份\s*[:：]\s*([^ ]+)/u)?.[1]
    ?? '一般生'

  return {
    departmentId: department.id,
    departmentCode: department.code,
    departmentName: cleanText(headingName) || department.name,
    requestedYear,
    sourceYear,
    fallbackUsed: sourceYear !== requestedYear,
    enrollmentIdentity: cleanText(identity),
    durationYears: Number(bodyText.match(/本系修業學年為\s*(\d+)\s*年/u)?.[1] ?? 0) || null,
    commonRequiredCredits: summaryValue(rows, '共同教育課程學分小計'),
    departmentRequiredCredits: summaryValue(rows, '系訂專業必修學分小計'),
    requiredCredits: summaryValue(rows, '必修總學分數'),
    electiveMinimumCredits,
    departmentElectiveMinimumCredits: electiveConstraints.departmentMinimumCredits,
    outsideElectiveMaximumCredits: electiveConstraints.outsideMaximumCredits,
    graduationMinimumCredits,
    requirements,
    electiveNotes,
    graduationNotes,
    generalNotes: summaryNote(rows, '備註'),
    fetchedAt,
    sourceUrl: SOURCE_URL,
  }
}

const formBody = (html, department, year) => {
  const document = new JSDOM(html).window.document
  const body = new URLSearchParams()
  document.querySelectorAll('input, select, textarea').forEach((control) => {
    if (!control.name || control.disabled) return
    if (control.tagName === 'INPUT' && ['submit', 'button', 'reset', 'file', 'image'].includes(control.type.toLowerCase())) return
    body.append(control.name, control.value ?? '')
  })
  body.set('__EVENTTARGET', '')
  body.set('__EVENTARGUMENT', '')
  body.set('Q_ENROLL_AYEAR', String(year).padStart(3, '0'))
  body.set('Q_RQ_CRS_TYPE', '1')
  body.set('Q_DEGREE_CODE', '0')
  body.set('Q_FACULTY_CODE', department.code)
  body.set('Q_ENROLL_ID', '01')
  body.set('QUERY_BTN1', '查詢')
  return body.toString()
}

let cookies = new Map()
const updateCookies = (response) => {
  response.headers.getSetCookie().forEach((value) => {
    const first = value.split(';', 1)[0]
    const separator = first.indexOf('=')
    if (separator > 0) cookies.set(first.slice(0, separator), first.slice(separator + 1))
  })
}
const cookieHeader = () => [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ')

const request = async (url, options = {}) => {
  const response = await fetch(url, {
    redirect: 'follow',
    ...options,
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(cookies.size ? { Cookie: cookieHeader() } : {}),
      ...options.headers,
    },
  })
  updateCookies(response)
  const text = await response.text()
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`)
  return text
}

const values = (name, fallback) => {
  const prefix = `--${name}=`
  const value = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : fallback
}

const selectedDepartmentIds = values('departments', departments.map((department) => department.id))
const selectedYears = values('years', Array.from({ length: 11 }, (_, index) => String(115 - index))).map(Number)
const selectedDepartments = departments.filter((department) => selectedDepartmentIds.includes(department.id))
if (!selectedDepartments.length || !selectedYears.length) throw new Error('No departments or years selected')

const fetchedAt = new Date().toISOString()
await request(OUTSIDE_URL)
await request(ENTRY_URL, { headers: { Referer: OUTSIDE_URL } })
let queryHtml = await request(QUERY_URL, { headers: { Referer: OUTSIDE_URL } })
const curricula = {}
const curriculumVariants = {}
const records = []

for (const department of selectedDepartments) {
  for (const year of selectedYears) {
    const html = await request(QUERY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Origin: 'https://ais.ntou.edu.tw',
        Referer: QUERY_URL,
      },
      body: formBody(queryHtml, department, year),
    })
    queryHtml = html
    const curriculum = parseCurriculum(html, department, year, fetchedAt)
    const key = `${department.id}:${year}`
    const exactCurriculum = curriculum && curriculum.sourceYear === year ? curriculum : null
    const variants = []
    const sourceHashes = [createHash('sha256').update(html).digest('hex')]
    if (!exactCurriculum) {
      for (const variant of historicalVariants[department.id] ?? []) {
        const variantDepartment = { ...department, code: variant.code }
        const variantHtml = await request(QUERY_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            Origin: 'https://ais.ntou.edu.tw',
            Referer: QUERY_URL,
          },
          body: formBody(queryHtml, variantDepartment, year),
        })
        queryHtml = variantHtml
        sourceHashes.push(createHash('sha256').update(variantHtml).digest('hex'))
        const parsedVariant = parseCurriculum(variantHtml, variantDepartment, year, fetchedAt)
        if (parsedVariant?.sourceYear === year) {
          variants.push({
            ...parsedVariant,
            departmentId: department.id,
            departmentName: department.name,
            programVariantCode: variant.code,
            programVariantName: variant.name,
          })
        }
      }
    }
    if (exactCurriculum) curricula[key] = exactCurriculum
    else if (variants.length === 1) curricula[key] = variants[0]
    else if (variants.length > 1) curriculumVariants[key] = variants
    const warnings = []
    if (curriculum && curriculum.sourceYear !== year) warnings.push(`returned source year ${curriculum.sourceYear}`)
    const storedCurricula = exactCurriculum ? [exactCurriculum] : variants
    if (storedCurricula.some((item) => !item.requirements.length)) warnings.push('no parsed requirements')
    if (storedCurricula.some((item) => item.requiredCredits <= 0)) warnings.push('required total is zero')
    if (storedCurricula.some((item) => item.departmentElectiveMinimumCredits === null)) warnings.push('elective structure needs manual confirmation')
    const status = exactCurriculum ? 'stored' : variants.length ? 'stored-variant' : 'missing'
    records.push({
      key,
      departmentId: department.id,
      departmentName: department.name,
      requestedYear: year,
      status,
      sourceYear: storedCurricula[0]?.sourceYear ?? curriculum?.sourceYear ?? null,
      requirementCount: storedCurricula[0]?.requirements.length ?? 0,
      graduationMinimumCredits: storedCurricula[0]?.graduationMinimumCredits ?? 0,
      variants: variants.map((variant) => ({
        code: variant.programVariantCode,
        name: variant.programVariantName,
        requirementCount: variant.requirements.length,
        graduationMinimumCredits: variant.graduationMinimumCredits,
      })),
      sourceHtmlSha256: sourceHashes,
      warnings,
    })
    process.stdout.write(`${key} ${status}${variants.length ? ` [${variants.map((variant) => variant.programVariantName).join(', ')}]` : ''}${warnings.length ? ` (${warnings.join('; ')})` : ''}\n`)
    await new Promise((resolve) => setTimeout(resolve, 80))
  }
}

const metadata = {
  schemaVersion: 1,
  fetchedAt,
  sourceUrl: SOURCE_URL,
  queryUrl: QUERY_URL,
  departmentCount: selectedDepartments.length,
  requestedYears: selectedYears,
  requestedCombinationCount: selectedDepartments.length * selectedYears.length,
  storedCombinationCount: Object.keys(curricula).length + Object.keys(curriculumVariants).length,
  curriculumRecordCount: Object.keys(curricula).length + Object.values(curriculumVariants).reduce((total, variants) => total + variants.length, 0),
  historicalVariantCombinationCount: records.filter((record) => record.status === 'stored-variant').length,
  missingCombinationCount: records.filter((record) => record.status === 'missing').length,
  manualReviewCombinationCount: records.filter((record) => record.warnings.length).length,
}

const root = process.cwd()
await mkdir(path.join(root, 'src', 'data'), { recursive: true })
await mkdir(path.join(root, 'reports'), { recursive: true })
await writeFile(
  path.join(root, 'src', 'data', 'graduationCurricula.json'),
  `${JSON.stringify({ metadata, curricula, curriculumVariants }, null, 2)}\n`,
  'utf8',
)
await writeFile(
  path.join(root, 'reports', 'graduation-curricula-audit.json'),
  `${JSON.stringify({ metadata, records }, null, 2)}\n`,
  'utf8',
)
process.stdout.write(`${JSON.stringify(metadata)}\n`)
