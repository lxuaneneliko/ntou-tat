import { JSDOM } from 'jsdom'
import { createHash } from 'node:crypto'

const outsideUrl = 'https://ais.ntou.edu.tw/outside.aspx?mainPage=QQBwAHAAbABpAGMAYQB0AGkAbwBuAC8ARQBOAFIALwBFAE4AUgBBADAALwBFAE4AUgBBADEAMgAwAF8ALgBhAHMAcAB4AD8AcAByAG8AZwBjAGQAPQBFAE4AUgBBADEAMgAwAA%3D%3D'
const entryUrl = 'https://ais.ntou.edu.tw/Application/ENR/ENRA0/ENRA120_.aspx?progcd=ENRA120'
const queryUrl = 'https://ais.ntou.edu.tw/Application/ENR/ENRA0/ENRA120_01.aspx'
const probes = [
  { department: '輪機工程學系', codes: ['060A', '060B', '060D', '0606'], years: [110, 109, 108, 107, 106, 105] },
  { department: '食品科學系', codes: ['030A', '0309'], years: [109, 108, 107, 106, 105] },
  { department: '光電與材料科技學系', codes: ['0808'], years: [115, 106, 105] },
]

const cookies = new Map()
const request = async (url, options = {}) => {
  const response = await fetch(url, {
    redirect: 'follow',
    ...options,
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; ') } : {}),
      ...options.headers,
    },
  })
  response.headers.getSetCookie().forEach((value) => {
    const [pair] = value.split(';')
    const separator = pair.indexOf('=')
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1))
  })
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
  return response.text()
}

const formBody = (html, code, year) => {
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
  body.set('Q_FACULTY_CODE', code)
  body.set('Q_ENROLL_ID', '01')
  body.set('QUERY_BTN1', '查詢')
  return body.toString()
}

await request(outsideUrl)
await request(entryUrl, { headers: { Referer: outsideUrl } })
let queryHtml = await request(queryUrl, { headers: { Referer: outsideUrl } })

for (const probe of probes) {
  for (const year of probe.years) {
    for (const code of probe.codes) {
      const html = await request(queryUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Origin: 'https://ais.ntou.edu.tw',
          Referer: queryUrl,
        },
        body: formBody(queryHtml, code, year),
      })
      queryHtml = html
      const document = new JSDOM(html).window.document
      const text = (document.body.textContent ?? '').replace(/\s+/gu, ' ').trim()
      const sourceYear = Number(text.match(/(\d{2,3})\s*學年度入學生適用/u)?.[1] ?? 0)
      const heading = text.match(/國立臺灣海洋大學\s+(.+?)\s+必修科目表/u)?.[1] ?? ''
      const graduationRow = [...(document.querySelector('#DataGrid1')?.rows ?? [])]
        .find((row) => row.cells[0]?.textContent?.includes('畢業最低學分數'))
      const graduationCredits = Number(graduationRow?.textContent?.match(/\d+(?:\.\d+)?/u)?.[0] ?? 0)
      if (sourceYear === year && graduationCredits > 0) {
        const tableHash = createHash('sha256')
          .update(document.querySelector('#DataGrid1')?.textContent?.replace(/\s+/gu, '') ?? '')
          .digest('hex')
          .slice(0, 12)
        process.stdout.write(`${probe.department}\t${year}\t${code}\t${heading}\t${graduationCredits}\t${tableHash}\n`)
      }
      await new Promise((resolve) => setTimeout(resolve, 80))
    }
  }
}
