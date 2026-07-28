import type { Grade } from '../types'

const readDocument = (html: string) =>
  typeof DOMParser === 'undefined' ? null : new DOMParser().parseFromString(html, 'text/html')

const normalizeText = (value: string) =>
  value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()

const scoreValue = (value: string) => {
  const match = value.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const score = Number(match[0])
  return Number.isFinite(score) ? score : null
}

const headerIndex = (headers: string[], patterns: RegExp[]) =>
  headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)))

const semesterFromText = (value: string) => {
  const compact = normalizeText(value).replace(/\s+/g, '')
  const compactMatch = compact.match(/^(\d{2,3})([12])$/)
  if (compactMatch) return `${Number(compactMatch[1])}-${compactMatch[2]}`

  const labelledMatch = compact.match(/(\d{2,3})(?:學年度|[-/年])?.*?第?([12一二])(?:學期)?/)
  if (!labelledMatch) return ''
  const semester = labelledMatch[2] === '一' ? '1' : labelledMatch[2] === '二' ? '2' : labelledMatch[2]
  return `${Number(labelledMatch[1])}-${semester}`
}

const gradesFromRows = (rows: string[][], semesterId: string): Grade[] => {
  const headerRowIndex = rows.findIndex((cells) => {
    const text = cells.map((cell) => cell.replace(/\s+/g, '')).join('|')
    return (
      /課名|科目名稱|課程名稱|科目/.test(text) &&
      /學期成績|總成績|成績|分數|等第/.test(text)
    )
  })
  if (headerRowIndex < 0) return []

  const originalHeaders = rows[headerRowIndex]
  const headers = originalHeaders.map(h => h.replace(/\s+/g, ''))
  const semesterIndex = headerIndex(headers, [/學年期/, /學年度學期/, /^學期$/])
  const codeIndex = headerIndex(headers, [/課號/, /科目代碼/])
  const titleIndex = headerIndex(headers, [/課名/, /科目名稱/, /課程名稱/, /^科目$/])
  const creditIndex = headerIndex(headers, [/學分/, /學分數/])
  const scoreIndex = headers.findIndex((header) =>
    !/學分/.test(header) &&
    [/學期成績/, /學期總成績/, /總成績/, /百分成績/, /成績/, /^分數$/, /等第/].some((pattern) => pattern.test(header)),
  )
  const categoryIndex = headerIndex(headers, [/選別/, /必選修/, /修別/, /類別/])
  if (titleIndex < 0 || scoreIndex < 0) return []

  return rows.slice(headerRowIndex + 1).flatMap((cells, index) => {
    const rowSemester = semesterFromText(cells[semesterIndex] ?? '')
    if (rowSemester && rowSemester !== semesterId) return []
    const code = normalizeText(cells[codeIndex] ?? '')
    const courseTitle = normalizeText(cells[titleIndex] ?? '')
    const rawScore = normalizeText(cells[scoreIndex] ?? '')
    if (
      !courseTitle ||
      !rawScore ||
      /合計|平均|排名|操行|學期平均/.test(courseTitle)
    ) return []
    const score = scoreValue(rawScore)
    const category = normalizeText(cells[categoryIndex] ?? '')
    return [{
      id: `${semesterId}-${code || courseTitle}-${index}`,
      courseId: code || courseTitle,
      courseTitle,
      semester: rowSemester || semesterId,
      credits: Number.parseFloat(normalizeText(cells[creditIndex] ?? '')) || 0,
      score,
      letter: score === null ? rawScore || undefined : undefined,
      required: /必修|必/.test(category),
      category,
    }]
  })
}

export const parseAisGrades = (html: string, semesterId: string): Grade[] => {
  const document = readDocument(html)
  if (document) {
    for (const table of document.querySelectorAll<HTMLTableElement>('table')) {
      const rows = [...table.rows].map((row) =>
        [...row.cells].map((cell) => normalizeText(cell.textContent ?? '')),
      )
      const grades = gradesFromRows(rows, semesterId)
      if (grades.length) return grades
    }
    return []
  }

  for (const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) =>
        normalizeText(cell[1]),
      ),
    )
    const grades = gradesFromRows(rows, semesterId)
    if (grades.length) return grades
  }
  return []
}

const appendFormFields = (body: URLSearchParams, html: string) => {
  const document = readDocument(html)
  const form = document?.querySelector<HTMLFormElement>('form')
  if (!form) return { document, form: null }

  Array.from(form.elements).forEach((control) => {
    if (
      !(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) ||
      !control.name ||
      control.disabled
    ) return
    const type = control instanceof HTMLInputElement ? control.type.toLowerCase() : ''
    if (['submit', 'button', 'reset', 'file', 'image'].includes(type)) return
    if (control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(type) && !control.checked) return
    body.append(control.name, control.value ?? '')
  })
  return { document, form }
}

export const buildAisGradeQueryBody = (html: string, semesterId: string) => {
  const [academicYear = '', semester = ''] = semesterId.split('-')
  const body = new URLSearchParams()
  const { document, form } = appendFormFields(body, html)
  if (!document || !form) return ''

  const radios = [...form.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
  const semesterGradeRadio = form.querySelector<HTMLInputElement>('#RB_TYPE_1')
  const radioLabel = (radio: HTMLInputElement) => {
    const explicitLabel = radio.id
      ? form.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(radio.id)}"]`)?.textContent
      : ''
    return normalizeText(
      explicitLabel ||
      radio.closest('label, td, th, div, li')?.textContent ||
      '',
    )
  }
  const semRadio =
    semesterGradeRadio ||
    radios.find((radio) => /學期成績|semester\s*grade/i.test(radioLabel(radio))) ||
    radios.find((radio) =>
      /semester|term|sms|grade/i.test(`${radio.name} ${radio.id}`) && radio.value === '1',
    )
  if (semRadio) {
    body.set(semRadio.name, semRadio.value)
  }

  const inputs = [...form.querySelectorAll<HTMLInputElement>('input[name]')]
  let ayearCount = 0

  for (const input of inputs) {
    const name = input.name
    const type = (input.type || 'text').toLowerCase()
    if (type === 'radio' || type === 'checkbox' || type === 'submit' || type === 'button' || type === 'reset') {
      continue
    }

    if (/AYEAR_SMS|AYEARSMS/i.test(name)) {
      body.set(name, `${academicYear}${semester}`)
    } else if (/AYEAR|YEAR/i.test(name)) {
      ayearCount += 1
      if (ayearCount === 1) {
        body.set(name, `${academicYear}${semester}`)
      } else {
        body.set(name, academicYear)
      }
    } else if (/SMS|SEM/i.test(name)) {
      body.set(name, semester)
    }
  }

  for (const select of form.querySelectorAll<HTMLSelectElement>('select[name]')) {
    const options = [...select.options]
    const yearOption = options.find((option) => option.value === academicYear || option.text.trim() === academicYear)
    const semesterOption = options.find((option) => option.value === semester || option.text.trim() === semester)
    const gradeOption = options.find((option) => option.text.includes('學期成績'))
    if (/AYEAR|YEAR/i.test(select.name) && yearOption) body.set(select.name, yearOption.value)
    else if (/SMS|SEM/i.test(select.name) && semesterOption) body.set(select.name, semesterOption.value)
    else if (gradeOption) body.set(select.name, gradeOption.value)
  }

  const submitButtons = [...form.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
    'input[type="submit"][name], button[type="submit"][name]',
  )]
  const isQueryButton = (button: HTMLInputElement | HTMLButtonElement) => {
    const label = button instanceof HTMLInputElement ? button.value : button.textContent ?? ''
    return /查詢|搜尋|Query|Search/.test(label) && !/清除|還原|Clear|Reset/.test(label)
  }
  const semesterContainer = semRadio?.closest('tr, fieldset, section, .row, div')
  const submit =
    [...(semesterContainer?.querySelectorAll<HTMLInputElement | HTMLButtonElement>(
      'input[type="submit"][name], button[type="submit"][name]',
    ) ?? [])].find(isQueryButton) ||
    submitButtons.find((button) =>
      /學期|semester/i.test(normalizeText(button.closest('tr, fieldset, section, div')?.textContent ?? '')) &&
      isQueryButton(button),
    ) ||
    submitButtons.find(isQueryButton)
  if (submit?.name) {
    body.set(
      submit.name,
      submit instanceof HTMLInputElement ? submit.value : normalizeText(submit.textContent ?? ''),
    )
  }
  return body.toString()
}

const decodeHtmlAttribute = (value: string) =>
  value
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )

const detailArguments = (script: string) => {
  const match = script.match(
    /doEdit1_2\(\s*[^,]+,\s*(['"])(.*?)\1\s*,\s*(['"])(.*?)\3\s*\)/i,
  )
  if (!match) return null
  return {
    keyString: decodeHtmlAttribute(match[2]),
    mode: match[4].trim().toUpperCase(),
  }
}

export type AisGradeDetailRequest = {
  url: string
  body: string
}

export const buildAisGradeDetailRequest = (
  html: string,
  baseUrl: string,
): AisGradeDetailRequest | null => {
  const document = readDocument(html)
  const detailScript =
    document?.querySelector<HTMLElement>('[onclick*="doEdit1_2"]')?.getAttribute('onclick') ??
    html.match(/doEdit1_2\(\s*[^,]+,\s*(['"])(.*?)\1\s*,\s*(['"])(.*?)\3\s*\)/i)?.[0] ??
    ''
  const args = detailArguments(detailScript)
  const scripts = document
    ? [...document.scripts].map((script) => script.textContent ?? '').join('\n')
    : html
  const viewPage = scripts.match(/var\s+viewpage\s*=\s*(['"])([^'"]+\.aspx)\1/i)?.[2]
  if (!args || !viewPage || !args.mode) return null

  const body = new URLSearchParams({ Mode: args.mode })
  const keyParts = args.keyString.split('|')
  for (let index = 0; index + 1 < keyParts.length; index += 2) {
    const name = keyParts[index].trim()
    if (/^[A-Za-z0-9_$]+$/.test(name)) {
      body.set(name, keyParts[index + 1])
    }
  }
  if ([...body.keys()].length < 2) return null

  const detailUrl = new URL(viewPage, baseUrl)
  if (detailUrl.origin !== new URL(baseUrl).origin) return null
  return { url: detailUrl.toString(), body: body.toString() }
}

const readTagAttribute = (tag: string, name: string) =>
  decodeHtmlAttribute(
    tag.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'))?.[2] ?? '',
  )

const appendFallbackHiddenFields = (body: URLSearchParams, html: string) => {
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0]
    const name = readTagAttribute(tag, 'name')
    const type = readTagAttribute(tag, 'type').toLowerCase() || 'text'
    if (
      !name ||
      /\bdisabled\b/i.test(tag) ||
      ['submit', 'button', 'reset', 'file', 'image'].includes(type)
    ) continue
    if (['checkbox', 'radio'].includes(type) && !/\bchecked\b/i.test(tag)) continue
    body.append(name, readTagAttribute(tag, 'value'))
  }
}

export const buildAisGradeDetailPostbackBody = (html: string) => {
  if (
    !/__doPostBack\(\s*(['"])ReQuery\1/i.test(html) ||
    /<table\b[^>]*\bid\s*=\s*(['"])DataGrid\1/i.test(html)
  ) return ''

  const body = new URLSearchParams()
  const { form } = appendFormFields(body, html)
  if (!form) {
    appendFallbackHiddenFields(body, html)
  }
  if (!body.has('__VIEWSTATE')) return ''
  body.set('__EVENTTARGET', 'ReQuery')
  body.set('__EVENTARGUMENT', '')
  return body.toString()
}

export const describeAisGradePage = (html: string) => {
  const document = readDocument(html)
  if (!document) {
    return {
      formCount: (html.match(/<form\b/gi) ?? []).length,
      tableCount: (html.match(/<table\b/gi) ?? []).length,
      hasSemesterGradeLabel: /學期成績/i.test(html),
      hasNoDataMessage: /查無資料|無成績資料|沒有資料/i.test(html),
    }
  }

  const controls = [...document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(
    'form input[name], form select[name], form button[name]',
  )].map((control) => {
    const type = control instanceof HTMLInputElement ? control.type : control.tagName.toLowerCase()
    const label = control instanceof HTMLInputElement && ['radio', 'submit', 'button'].includes(type)
      ? normalizeText(
          (control.id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(control.id)}"]`)?.textContent : '') ||
          control.closest('label, td, th, div')?.textContent ||
          control.value,
        ).slice(0, 40)
      : ''
    return { name: control.getAttribute('name') ?? '', id: control.id, type, label }
  })

  const headerRows = [...document.querySelectorAll<HTMLTableRowElement>('table tr')].flatMap((row) => {
    const cells = [...row.cells].map((cell) => normalizeText(cell.textContent ?? '').slice(0, 40))
    const headerHits = cells.filter((cell) =>
      /課號|科目|課名|課程|學分|選別|修別|成績|分數|等第/.test(cell),
    ).length
    return headerHits >= 2 ? [cells] : []
  })

  return {
    formCount: document.forms.length,
    tableCount: document.querySelectorAll('table').length,
    hasSemesterGradeLabel: /學期成績/i.test(document.body.textContent ?? ''),
    hasNoDataMessage: /查無資料|無成績資料|沒有資料/i.test(document.body.textContent ?? ''),
    controls,
    headerRows,
  }
}
