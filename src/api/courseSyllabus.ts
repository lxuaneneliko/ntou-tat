import type { CourseSyllabus, TimetableSlot } from '../types'
import {
  appendWebFormsControls,
  buildCourseCatalogQueryBody,
  COURSE_CURRENT_ENTRY_URL,
  COURSE_CURRENT_QUERY_URL,
  COURSE_DETAIL_URL,
  COURSE_HISTORY_ENTRY_URL,
  COURSE_HISTORY_QUERY_URL,
  decodeCourseCatalogHtml,
  parseCourseCatalogDetail,
  parseCourseCatalogResults,
  type CourseCatalogOffering,
} from './courseCatalog'
import { ApiError } from './errors'
import { assertOk, portalRequest, type PortalResponse } from './portalHttp'

const COURSE_HISTORY_OUTSIDE_URL =
  'https://ais.ntou.edu.tw/outside.aspx?mainPage=LwBBAHAAcABsAGkAYwBhAHQAaQBvAG4ALwBUAEsARQAvAFQASwBFADIAMgAvAFQASwBFADIAMgAxADQAXwAuAGEAcwBwAHgAPwBwAHIAbwBnAGMAZAA9AFQASwBFADIAMgAxADQA'
const COURSE_CURRENT_OUTSIDE_URL =
  'https://ais.ntou.edu.tw/outside.aspx?mainPage=LwBBAHAAcABsAGkAYwBhAHQAaQBvAG4ALwBUAEsARQAvAFQASwBFADIAMgAvAFQASwBFADIAMgAxADUAXwAuAGEAcwBwAHgAPwBwAHIAbwBnAGMAZAA9AFQASwBFADIAMgAxADUA'

const requestHeaders = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.7',
}

type CourseEndpoint = {
  outsideUrl: string
  entryUrl: string
  queryUrl: string
}

const historyEndpoint: CourseEndpoint = {
  outsideUrl: COURSE_HISTORY_OUTSIDE_URL,
  entryUrl: COURSE_HISTORY_ENTRY_URL,
  queryUrl: COURSE_HISTORY_QUERY_URL,
}

const currentEndpoint: CourseEndpoint = {
  outsideUrl: COURSE_CURRENT_OUTSIDE_URL,
  entryUrl: COURSE_CURRENT_ENTRY_URL,
  queryUrl: COURSE_CURRENT_QUERY_URL,
}

const normalize = (value: string | undefined) => (value ?? '')
  .normalize('NFKC')
  .replace(/\s+/g, '')
  .toLocaleLowerCase('zh-TW')

const normalizeSemester = (value: string) => {
  const match = value.trim().match(/^(\d{2,3})\s*[-_/]?\s*([1-4])$/)
  return match ? `${match[1].padStart(3, '0')}-${match[2]}` : value.trim()
}

export const currentCourseSemesterId = (now = Date.now()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date(now))
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  if (!Number.isInteger(year) || !Number.isInteger(month)) return ''
  if (month >= 8) return `${year - 1911}-1`
  if (month === 1) return `${year - 1912}-1`
  return `${year - 1912}-2`
}

const endpointForSemester = (semesterId: string) => (
  normalizeSemester(semesterId) === currentCourseSemesterId()
    ? currentEndpoint
    : historyEndpoint
)

const teacherMatches = (actual: string, expected: string) => {
  const actualName = normalize(actual)
  const expectedName = normalize(expected)
  if (!expectedName) return true
  if (actualName === expectedName) return true
  const names = actual.split(/[、,，/／;；]+/).map(normalize).filter(Boolean)
  return names.includes(expectedName)
}

export type SyllabusCourseIdentity = Pick<
  TimetableSlot,
  'courseId' | 'courseCode' | 'courseTitle' | 'instructor' | 'department' | 'className'
>

/** Select only one fully defensible official row. Ambiguous rows are never guessed. */
export const selectSyllabusOffering = (
  offerings: CourseCatalogOffering[],
  semesterId: string,
  course: SyllabusCourseIdentity,
) => {
  let matches = offerings.filter((offering) => (
    normalizeSemester(offering.semesterId) === normalizeSemester(semesterId)
    && normalize(offering.courseCode) === normalize(course.courseCode)
  ))

  if (course.className) {
    matches = matches.filter((offering) => normalize(offering.className) === normalize(course.className))
  }
  if (course.instructor) {
    matches = matches.filter((offering) => teacherMatches(offering.instructor, course.instructor))
  }
  if (course.department) {
    const sameDepartment = matches.filter((offering) => (
      normalize(offering.department) === normalize(course.department)
    ))
    if (sameDepartment.length) matches = sameDepartment
  }

  return matches.length === 1 ? matches[0] : null
}

const responseHtml = (response: PortalResponse, message: string) => {
  assertOk(response, message)
  return decodeCourseCatalogHtml(
    response.data,
    String(Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1] ?? ''),
  )
}

const getPage = async (url: string) => responseHtml(await portalRequest({
  url,
  method: 'GET',
  headers: requestHeaders,
  timeoutMs: 35_000,
}), '無法連線至海大課程大綱')

const postPage = async (url: string, body: string) => responseHtml(await portalRequest({
  url,
  method: 'POST',
  headers: {
    ...requestHeaders,
    'Content-Type': 'application/x-www-form-urlencoded',
    Origin: 'https://ais.ntou.edu.tw',
    Referer: url,
  },
  data: body,
  timeoutMs: 45_000,
}), '無法讀取海大課程大綱')

const clearSubmitControls = (body: URLSearchParams) => {
  ;['QUERY_BTN1', 'QUERY_BTN3', 'QUERY_BTN4', 'QUERY_BTN5', 'QUERY_BTN6', 'QUERY_BTN7', 'QUERY_BTN8']
    .forEach((name) => body.delete(name))
}

const findPkno = (html: string) => {
  let decoded = html
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded.replace(/&amp;/gi, '&'))
      if (next === decoded) break
      decoded = next
    } catch {
      break
    }
  }
  return decoded.match(/TKE2240_03\.aspx\?PKNO=([\w-]+)/i)?.[1]
    ?? decoded.match(/[?&]PKNO=([\w-]+)/i)?.[1]
    ?? decoded.match(/fn_open\s*\(\s*['"]?([\w-]+)/i)?.[1]
    ?? ''
}

const toSyllabus = (detail: ReturnType<typeof parseCourseCatalogDetail>): CourseSyllabus => ({
  semesterId: detail.semesterId,
  courseCode: detail.courseCode,
  title: detail.title,
  englishTitle: detail.englishTitle,
  instructor: detail.instructor,
  department: detail.department,
  className: detail.className,
  objectiveZh: detail.objectiveZh,
  objectiveEn: detail.objectiveEn,
  prerequisitesZh: detail.prerequisitesZh,
  prerequisitesEn: detail.prerequisitesEn,
  contentZh: detail.contentZh,
  contentEn: detail.contentEn,
  teachingMethodZh: detail.teachingMethodZh,
  teachingMethodEn: detail.teachingMethodEn,
  referencesZh: detail.referencesZh,
  referencesEn: detail.referencesEn,
  scheduleZh: detail.scheduleZh,
  scheduleEn: detail.scheduleEn,
  evaluationZh: detail.evaluationZh,
  evaluationEn: detail.evaluationEn,
  referenceUrl: detail.referenceUrl,
})

export const loadOfficialCourseSyllabus = async (
  semesterId: string,
  course: SyllabusCourseIdentity,
): Promise<CourseSyllabus> => {
  if (!course.courseCode.trim() || course.courseCode === 'CUSTOM') {
    throw new ApiError('自訂課程沒有海大 AIS 課程大綱', 404, 'COURSE_SYLLABUS_CUSTOM')
  }

  const endpoint = endpointForSemester(semesterId)
  await getPage(endpoint.outsideUrl)
  await getPage(endpoint.entryUrl)
  const baseHtml = await getPage(endpoint.queryUrl)
  if (!/__VIEWSTATE/i.test(baseHtml)) {
    throw new ApiError('海大課程查詢頁格式暫時無法辨識', 502, 'COURSE_SYLLABUS_FORM')
  }

  const query = {
    semesterId,
    courseCode: course.courseCode,
    match: 'exact' as const,
    page: 1,
    pageSize: 200,
  }
  const resultHtml = await postPage(endpoint.queryUrl, buildCourseCatalogQueryBody(baseHtml, query))
  const result = parseCourseCatalogResults(resultHtml, query)
  const offering = selectSyllabusOffering(result.items, semesterId, course)
  if (!offering) {
    const sameCodeCount = result.items.filter((item) => normalize(item.courseCode) === normalize(course.courseCode)).length
    const message = sameCodeCount > 1 && !course.className
      ? '這份課表快取缺少班別資料，請重新整理課表後再開啟課程大綱'
      : '找不到能與這堂課精確對應的官方課程大綱'
    throw new ApiError(message, 404, 'COURSE_SYLLABUS_NOT_FOUND')
  }

  let detailHtml = ''
  let pkno = offering.pkno
  if (!pkno && offering.detailPostback) {
    const body = appendWebFormsControls(new URLSearchParams(), resultHtml)
    clearSubmitControls(body)
    body.set('__EVENTTARGET', offering.detailPostback)
    body.set('__EVENTARGUMENT', '')
    const postbackHtml = await postPage(endpoint.queryUrl, body.toString())
    if (/\bid=["']M_COSID["']/i.test(postbackHtml)) detailHtml = postbackHtml
    else pkno = findPkno(postbackHtml)
  }
  if (!detailHtml) {
    if (!pkno) throw new ApiError('官方課綱連結目前無法辨識', 502, 'COURSE_SYLLABUS_LINK')
    const url = new URL(COURSE_DETAIL_URL)
    url.searchParams.set('PKNO', pkno)
    detailHtml = await getPage(url.toString())
  }

  const detail = parseCourseCatalogDetail(detailHtml, pkno)
  if (
    normalize(detail.courseCode) !== normalize(course.courseCode)
    || (detail.semesterId && normalizeSemester(detail.semesterId) !== normalizeSemester(semesterId))
    || (offering.className && normalize(detail.className) !== normalize(offering.className))
    || (offering.instructor && !teacherMatches(detail.instructor, offering.instructor))
    || (offering.department && detail.department && normalize(detail.department) !== normalize(offering.department))
  ) {
    throw new ApiError('官方課綱身分核對不一致，已停止顯示以避免放錯資料', 409, 'COURSE_SYLLABUS_MISMATCH')
  }

  return toSyllabus(detail)
}
