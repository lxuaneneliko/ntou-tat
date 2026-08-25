import type { AuthStore } from '../storage/authStorage'
import type {
  Announcement,
  AuthSession,
  CalendarEvent,
  CampusLink,
  CourseFile,
  CreditSummary,
  ExternalCompetition,
  Grade,
  LoginChallenge,
  Semester,
  StudentProfile,
  TimetableResponse,
  TrafficInfo,
} from '../types'
import type { LoginPayload, NtouApi } from './contract'
import { ApiError, UnauthorizedError } from './errors'
import { campusLinks, emptyCredits, trafficInfo } from './publicData'
import { filterCalendarRange, parseNtouPublicCalendar } from './publicCalendar'
import {
  assertOk,
  clearPortalCookies,
  getPortalCookieHeader,
  launchPortalSystemPage,
  portalImageDataUrl,
  portalRequest,
  publicPageRequest,
} from './portalHttp'
import {
  hasAisAuthCookie,
  parseAisClientRedirect,
  parseAisLoginChallenge,
  parseAisLoginResult,
  parsePortalProfile,
} from './portalParser'
import {
  buildAisGradeDetailPostbackBody,
  buildAisGradeDetailRequest,
  buildAisGradeQueryBody,
  parseAisGrades,
} from './gradesParser'
import {
  listPortalSystemNodes,
  parsePortalLoaderUrl,
  resolvePortalMenuUrl,
} from './portalMenu'
import { buildAisCourseQueryBody, parseAisPersonalTimetable } from './timetableParser'
import { currentSemesters } from '../semester'
import { parseNtouAnnouncements } from './announcementParser'
import { parseExternalCompetitions } from './competitionParser'

const AIS_BASE_URL = 'https://ais.ntou.edu.tw/'
const MAINFRAME_URL = new URL('mainframe.aspx', AIS_BASE_URL).toString()
const MENU_URL = new URL('MenuTree.aspx', AIS_BASE_URL).toString()
const PUBLIC_CALENDAR_URL = 'https://www.ntou.edu.tw/calendar'
const PUBLIC_ANNOUNCEMENTS_URL = 'https://www.ntou.edu.tw/post/%E5%AD%B8%E6%A0%A1%E5%85%AC%E5%91%8A'
const EXTERNAL_COMPETITIONS_URL = 'https://cyie.cycu.edu.tw/%E6%A0%A1%E5%A4%96%E6%B4%BB%E5%8B%95/%E6%A0%A1%E5%A4%96%E5%89%B5%E6%A5%AD%E7%AB%B6%E8%B3%BD/'

const formHeaders = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Origin: 'https://ais.ntou.edu.tw',
  Referer: AIS_BASE_URL,
}

export const buildLoginBody = (payload: LoginPayload, challenge: LoginChallenge) => {
  const body = new URLSearchParams(challenge.hiddenFields ?? {})
  body.set(challenge.fieldNames?.account || 'M_PORTAL_LOGIN_ACNT', payload.studentId.trim().toUpperCase())
  body.set(challenge.fieldNames?.password || 'M_PW', payload.password)
  body.set(challenge.fieldNames?.captcha || 'M_PW2', payload.captchaCode?.trim() ?? '')
  body.set(challenge.submitName || 'LGOIN_BTN', challenge.submitValue || '登入/Login')
  return body.toString()
}


export const createPortalApiClient = (store: AuthStore): NtouApi => {
  let latestChallenge: LoginChallenge | null = null
  let latestGrades: Grade[] = []
  let sessionReadyAt = 0
  let sessionRestorePromise: Promise<void> | null = null
  const featureUrls = new Map<string, string>()
  const systemMenuCache = new Map<string, Awaited<ReturnType<typeof listPortalSystemNodes>>>()

  const invalidateSession = async (): Promise<never> => {
    sessionReadyAt = 0
    throw new UnauthorizedError()
  }

  const getStoredProfile = async (): Promise<StudentProfile> => {
    const session = await store.getSession()
    if (!session) {
      throw new UnauthorizedError()
    }
    return session.profile
  }

  const isPortalSessionExpired = (html: string) =>
    html.includes('M_PORTAL_LOGIN_ACNT') ||
    /使用時間逾時|使用時間頁面已逾時/i.test(html)

  const assertPortalSession = async (html: string) => {
    if (isPortalSessionExpired(html)) {
      return invalidateSession()
    }
  }

  const ensurePortalSession = async (force = false) => {
    if (!force && Date.now() - sessionReadyAt < 10 * 60 * 1000) {
      return
    }
    if (sessionRestorePromise) {
      return sessionRestorePromise
    }

    sessionRestorePromise = (async () => {
      let landing = await portalRequest({
        url: new URL('Default.aspx', AIS_BASE_URL).toString(),
        method: 'GET',
        headers: { Accept: 'text/html,application/xhtml+xml' },
      })
      for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
        assertOk(landing, '無法恢復 AIS 登入狀態')
        const clientRedirect = parseAisClientRedirect(landing.data, landing.url)
        if (!clientRedirect) break
        landing = await portalRequest({
          url: clientRedirect,
          method: 'GET',
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            Referer: landing.url,
          },
        })
      }

      const mainframe = await portalRequest({
        url: MAINFRAME_URL,
        method: 'GET',
        headers: { Accept: 'text/html,application/xhtml+xml', Referer: AIS_BASE_URL },
      })
      assertOk(mainframe, '無法恢復 AIS 登入狀態')
      await assertPortalSession(mainframe.data)
      const mainframeRedirect = parseAisClientRedirect(mainframe.data, mainframe.url)
      if (mainframeRedirect?.includes('/Default')) {
        return invalidateSession()
      }

      const menu = await portalRequest({
        url: MENU_URL,
        method: 'GET',
        headers: { Accept: 'text/html,application/xhtml+xml', Referer: MAINFRAME_URL },
      })
      assertOk(menu, '無法恢復 AIS 功能選單')
      await assertPortalSession(menu.data)
      if (!/Menu_TreeView|TreeView_PopulateNode/i.test(menu.data)) {
        return invalidateSession()
      }
      sessionReadyAt = Date.now()
    })().finally(() => {
      sessionRestorePromise = null
    })
    return sessionRestorePromise
  }

  const openFeature = async (groups: string[], targetLabel: string) => {
    await ensurePortalSession()
    const featureKey = [...groups, targetLabel].join('>')
    let featureUrl: string
    try {
      featureUrl = featureUrls.get(featureKey) ?? await resolvePortalMenuUrl(groups, targetLabel)
      featureUrls.set(featureKey, featureUrl)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await ensurePortalSession(true)
        featureUrl = await resolvePortalMenuUrl(groups, targetLabel)
        featureUrls.set(featureKey, featureUrl)
      } else {
        throw error
      }
    }

    const feature = await portalRequest({
      url: featureUrl,
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml', Referer: new URL('MenuTree.aspx', AIS_BASE_URL).toString() },
    })
    assertOk(feature, `無法開啟 AIS「${targetLabel}」`)
    await assertPortalSession(feature.data)

    const dataUrl = parsePortalLoaderUrl(feature.data, featureUrl)
    if (dataUrl === featureUrl) {
      return { dataUrl, featureUrl, html: feature.data }
    }

    const dataPage = await portalRequest({
      url: dataUrl,
      method: 'GET',
      headers: { Accept: 'text/html,application/xhtml+xml', Referer: featureUrl },
    })
    assertOk(dataPage, `無法讀取 AIS「${targetLabel}」`)
    await assertPortalSession(dataPage.data)
    return { dataUrl, featureUrl, html: dataPage.data }
  }

  return {
    async getLoginChallenge() {
      latestGrades = []
      featureUrls.clear()
      systemMenuCache.clear()
      let response = await portalRequest({
        url: 'https://ais.ntou.edu.tw/Default.aspx',
        method: 'GET',
        headers: { Accept: 'text/html,application/xhtml+xml' },
      })
      for (let redirectCount = 0; redirectCount < 4; redirectCount += 1) {
        assertOk(response, '無法取得海大 AIS 登入頁')
        const clientRedirect = parseAisClientRedirect(response.data, response.url)
        if (!clientRedirect) {
          break
        }
        response = await portalRequest({
          url: clientRedirect,
          method: 'GET',
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            Referer: response.url,
          },
        })
      }

      assertOk(response, '無法取得海大 AIS 登入頁')
      latestChallenge = parseAisLoginChallenge(response.data)
      if (!latestChallenge.captchaUrl) {
        throw new ApiError('海大 AIS 尚未提供驗證碼圖片，請重新整理', 502, 'CAPTCHA_URL_NOT_FOUND')
      }
      const cookieHeader = await getPortalCookieHeader(response.headers)
      const captchaDataUrl = await portalImageDataUrl(
        latestChallenge.captchaUrl,
        response.url,
        cookieHeader,
      )
      latestChallenge = { ...latestChallenge, captchaDataUrl, cookieHeader }
      return latestChallenge
    },

    async login(payload: LoginPayload): Promise<AuthSession> {
      featureUrls.clear()
      systemMenuCache.clear()
      const challenge = payload.challenge ?? latestChallenge
      if (!challenge) {
        throw new ApiError('請先取得驗證碼', 400, 'CAPTCHA_REQUIRED')
      }
      if (!payload.captchaCode?.trim()) {
        throw new ApiError('請輸入海大 AIS 驗證碼', 400, 'CAPTCHA_REQUIRED')
      }

      const response = await portalRequest({
        url: challenge.loginUrl,
        method: 'POST',
        headers: formHeaders,
        data: buildLoginBody(payload, challenge),
      })
      assertOk(response, '海大 AIS 登入請求失敗')
      
      if (response.data.includes('ConfirmInOrOut.aspx') || response.url.includes('ConfirmInOrOut')) {
        await portalRequest({
          url: new URL('LogOut.aspx', AIS_BASE_URL).toString(),
          method: 'GET',
          headers: { Accept: 'text/html,application/xhtml+xml', Referer: response.url },
        })
        throw new ApiError('偵測到重複登入，已自動為您登出其他視窗，請再次嘗試登入', 401, 'AIS_SESSION_CONFLICT_RESOLVED')
      }

      const result = parseAisLoginResult(response.data)
      const authenticatedByCookie = hasAisAuthCookie(response.cookieNames)
      if (!result.success && !authenticatedByCookie) {
        throw new ApiError(result.message, 401, 'AIS_LOGIN_FAILED')
      }

      let profile = parsePortalProfile(response.data, payload.studentId.trim().toUpperCase())
      try {
        const mainframe = await portalRequest({
          url: MAINFRAME_URL,
          method: 'GET',
          headers: { Accept: 'text/html,application/xhtml+xml', Referer: AIS_BASE_URL },
        })
        const mainframeIsLogin =
          mainframe.status === 401 ||
          /(?:id|name)=["']M_PORTAL_LOGIN_ACNT["']/i.test(mainframe.data)
        if (mainframe.status < 200 || mainframe.status >= 400 || mainframeIsLogin) {
          throw new ApiError('AIS 已驗證帳密，但登入工作階段尚未建立', 401, 'AIS_SESSION_NOT_ESTABLISHED')
        }
        profile = parsePortalProfile(mainframe.data, payload.studentId.trim().toUpperCase())
        sessionReadyAt = Date.now()
      } catch (error) {
        if (error instanceof ApiError) {
          throw error
        }
        throw new ApiError('AIS 已驗證帳密，但無法開啟系統主頁，請再試一次', 502, 'AIS_MAINFRAME_FAILED')
      }

      return {
        accessToken: 'ais-cookie-session',
        refreshToken: 'ais-cookie-session',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 8).toISOString(),
        profile,
        source: 'portal',
      }
    },

    async refresh() {
      const session = await store.getSession()
      if (!session) {
        throw new UnauthorizedError()
      }
      return session
    },

    async getMe() {
      const fallback = await getStoredProfile()
      try {
        await ensurePortalSession()
        const mainframe = await portalRequest({
          url: MAINFRAME_URL,
          method: 'GET',
          headers: { Accept: 'text/html,application/xhtml+xml', Referer: AIS_BASE_URL },
        })
        if (mainframe.status === 401) {
          return invalidateSession()
        }
        assertOk(mainframe, '無法恢復 AIS 登入狀態')
        await assertPortalSession(mainframe.data)
        return parsePortalProfile(mainframe.data, fallback.id)
      } catch {
        return fallback
      }
    },

    async getSemesters(): Promise<Semester[]> {
      return currentSemesters()
    },

    async getTimetable(semesterId): Promise<TimetableResponse> {
      const queryPage = await openFeature(
        ['教務系統', '選課系統'],
        '學生個人選課清單課表列印',
      )

      const queryHeaders = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html,application/xhtml+xml',
        Origin: 'https://ais.ntou.edu.tw',
        Referer: queryPage.dataUrl,
      }
      const courseList = await portalRequest({
        url: queryPage.dataUrl,
        method: 'POST',
        headers: queryHeaders,
        data: buildAisCourseQueryBody(queryPage.html, semesterId, 'list'),
      })
      const timetable = await portalRequest({
        url: queryPage.dataUrl,
        method: 'POST',
        headers: queryHeaders,
        data: buildAisCourseQueryBody(queryPage.html, semesterId, 'timetable'),
      })

      assertOk(courseList, '無法取得 AIS 選課清單')
      assertOk(timetable, '無法取得 AIS 選課課表')
      await assertPortalSession(courseList.data)
      await assertPortalSession(timetable.data)

      return {
        semesterId,
        updatedAt: new Date().toISOString(),
        slots: parseAisPersonalTimetable(timetable.data, courseList.data),
      }
    },

    async getGrades(semesterId): Promise<Grade[]> {
      const gradePage = await openFeature(['教務系統', '成績系統'], '查詢各式成績')

      const body = buildAisGradeQueryBody(gradePage.html, semesterId)
      let resultHtml = gradePage.html
      if (body) {
        const response = await portalRequest({
          url: gradePage.dataUrl,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'text/html,application/xhtml+xml',
            Origin: 'https://ais.ntou.edu.tw',
            Referer: gradePage.dataUrl,
          },
          data: body,
        })
        assertOk(response, '無法取得 AIS 學期成績')
        await assertPortalSession(response.data)
        resultHtml = response.data
      }

      const detailRequest = buildAisGradeDetailRequest(resultHtml, gradePage.dataUrl)
      if (detailRequest) {
        const detailPage = await portalRequest({
          url: detailRequest.url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'text/html,application/xhtml+xml',
            Origin: 'https://ais.ntou.edu.tw',
            Referer: gradePage.dataUrl,
          },
          data: detailRequest.body,
          timeoutMs: 40000,
        })
        assertOk(detailPage, '無法開啟 AIS 成績明細')
        await assertPortalSession(detailPage.data)
        resultHtml = detailPage.data

        const postbackBody = buildAisGradeDetailPostbackBody(detailPage.data)
        if (postbackBody) {
          const detailResult = await portalRequest({
            url: detailRequest.url,
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              Accept: 'text/html,application/xhtml+xml',
              Origin: 'https://ais.ntou.edu.tw',
              Referer: detailRequest.url,
            },
            data: postbackBody,
            timeoutMs: 70000,
          })
          assertOk(detailResult, '無法讀取 AIS 成績明細')
          await assertPortalSession(detailResult.data)
          resultHtml = detailResult.data
        }
      }

      latestGrades = parseAisGrades(resultHtml, semesterId)
      return latestGrades
    },

    async getCredits(): Promise<CreditSummary> {
      const passed = latestGrades.filter((grade) =>
        grade.score === null
          ? !/不及格|未通過|F/i.test(grade.letter ?? '')
          : grade.score >= 60,
      )
      const totalEarned = passed.reduce((total, grade) => total + grade.credits, 0)
      const requiredEarned = passed
        .filter((grade) => grade.required)
        .reduce((total, grade) => total + grade.credits, 0)
      return {
        ...emptyCredits,
        totalEarned,
        requiredEarned,
        electiveEarned: totalEarned - requiredEarned,
      }
    },

    async getCourseFiles(): Promise<CourseFile[]> {
      return []
    },

    async getAnnouncements(): Promise<Announcement[]> {
      const response = await publicPageRequest({
        url: PUBLIC_ANNOUNCEMENTS_URL,
        method: 'GET',
        headers: { Accept: 'text/html,application/xhtml+xml' },
      }, '海大學校公告')
      assertOk(response, '無法取得海大校務公告')
      const announcements = parseNtouAnnouncements(response.data)
      if (!announcements.length) {
        throw new ApiError('海大學校公告頁目前沒有回傳資料', 502, 'NTOU_ANNOUNCEMENTS_EMPTY')
      }
      return announcements
    },

    async getExternalCompetitions(): Promise<ExternalCompetition[]> {
      const response = await publicPageRequest({
        url: EXTERNAL_COMPETITIONS_URL,
        method: 'GET',
        headers: { Accept: 'text/html,application/xhtml+xml' },
      }, '中原大學校外競賽來源')
      assertOk(response, '無法取得校外競賽')
      const competitions = parseExternalCompetitions(response.data)
      if (!competitions.length) {
        throw new ApiError('校外競賽來源目前沒有回傳資料', 502, 'EXTERNAL_COMPETITIONS_EMPTY')
      }
      return competitions
    },

    async getCalendar(from, to): Promise<CalendarEvent[]> {
      const response = await publicPageRequest({
        url: PUBLIC_CALENDAR_URL,
        method: 'GET',
        headers: { Accept: 'text/html,application/xhtml+xml' },
      }, '海大官方行事曆')
      assertOk(response, '無法取得海大官方行事曆')
      return filterCalendarRange(parseNtouPublicCalendar(response.data), from, to)
    },

    async getCampusLinks(): Promise<CampusLink[]> {
      return campusLinks
    },

    async getTraffic(): Promise<TrafficInfo[]> {
      return trafficInfo
    },

    async getPortalSystemMenu(path) {
      await ensurePortalSession()
      const key = path.join('>')
      const cached = systemMenuCache.get(key)
      if (cached) return cached

      const nodes = await listPortalSystemNodes(path)
      systemMenuCache.set(key, nodes)
      return nodes
    },

    async openPortalSystemPage(path) {
      const targetLabel = path.at(-1)
      if (!targetLabel) {
        throw new ApiError('缺少校務系統功能名稱', 400, 'AIS_SYSTEM_PATH_INVALID')
      }
      const feature = await openFeature(path.slice(0, -1), targetLabel)
      await launchPortalSystemPage(feature.dataUrl)
    },
  }
}

export const clearPortalSession = clearPortalCookies
