import type { LoginChallenge, StudentProfile } from '../types'
import { ApiError } from './errors'

const AIS_LOGIN_URL = 'https://ais.ntou.edu.tw/'

const readDocument = (html: string) =>
  typeof DOMParser === 'undefined' ? null : new DOMParser().parseFromString(html, 'text/html')

const readAttr = (tag: string | undefined, attr: string) => {
  if (!tag) {
    return ''
  }
  const match = tag.match(new RegExp(`${attr}=["']([^"']*)["']`, 'i'))
  return match?.[1] ?? ''
}

const findTagByAttr = (html: string, tag: string, attr: string, value: string) => {
  const matcher = new RegExp(`<${tag}\\b(?=[^>]*\\b${attr}=["']${value}["'])[^>]*>`, 'i')
  return html.match(matcher)?.[0]
}

const readInputValueFallback = (html: string, name: string) =>
  readAttr(findTagByAttr(html, 'input', 'name', name), 'value')

const readTextBySelectorFallback = (html: string, selector: string) => {
  const id = selector.replace(/^[#.]/, '')
  const matcher = new RegExp(`<[^>]+(?:id|class)=["'][^"']*${id}[^"']*["'][^>]*>([\\s\\S]*?)<\\/[^>]+>`, 'i')
  return matcher.exec(html)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? ''
}

const readInputValue = (document: Document | null, html: string, name: string) => {
  if (!document) {
    return readInputValueFallback(html, name)
  }
  const input = document.querySelector<HTMLInputElement>(`input[name="${name}"]`)
  return input?.value ?? ''
}

const readHiddenFields = (document: Document | null, html: string) => {
  if (document) {
    return [...document.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]')].reduce<
      Record<string, string>
    >((fields, input) => {
      fields[input.name] = input.value ?? ''
      return fields
    }, {})
  }

  const fields: Record<string, string> = {}
  const matcher = /<input\b(?=[^>]*\btype=["']hidden["'])(?=[^>]*\bname=["']([^"']+)["'])[^>]*>/gi
  let match = matcher.exec(html)
  while (match) {
    const tag = match[0]
    const name = match[1]
    fields[name] = readAttr(tag, 'value')
    match = matcher.exec(html)
  }
  return fields
}

const readSubmitButton = (document: Document | null, html: string) => {
  const button = document?.querySelector<HTMLInputElement>('input[type="submit"][name]')
  const fallbackTag = button ? undefined : html.match(/<input\b(?=[^>]*\btype=["']submit["'])(?=[^>]*\bname=["'][^"']+["'])[^>]*>/i)?.[0]
  const name = button?.name || readAttr(fallbackTag, 'name')
  const value = button?.value || readAttr(fallbackTag, 'value')
  return { name, value }
}

const resolveUrl = (url: string, baseUrl = AIS_LOGIN_URL) => new URL(url, baseUrl).toString()

export const parseAisClientRedirect = (html: string, baseUrl = AIS_LOGIN_URL) => {
  const target =
    html.match(/(?:window\.)?location(?:\.href)?\s*=\s*(['"])(.*?)\1/i)?.[2]?.trim() ||
    html.match(/(?:window\.)?location\.replace\(\s*(['"])(.*?)\1\s*\)/i)?.[2]?.trim()

  if (!target) {
    return undefined
  }

  try {
    const resolved = new URL(target, baseUrl)
    return resolved.protocol === 'https:' && resolved.hostname === 'ais.ntou.edu.tw'
      ? resolved.toString()
      : undefined
  } catch {
    return undefined
  }
}

export const hasAisAuthCookie = (cookieNames?: string) =>
  cookieNames
    ?.split(',')
    .map((name) => name.trim())
    .includes('.ASPXAUTH') ?? false

export const parseAisLoginChallenge = (html: string): LoginChallenge => {
  const document = readDocument(html)
  const form = document?.querySelector<HTMLFormElement>('form#form1')
  const formTag = form ? undefined : findTagByAttr(html, 'form', 'id', 'form1')
  const captcha = document?.querySelector<HTMLImageElement>('#importantImg')
  const captchaTag = captcha ? undefined : findTagByAttr(html, 'img', 'id', 'importantImg')

  if (!form && !formTag) {
    throw new ApiError('海大 AIS 登入頁格式已變更：找不到登入表單', 502, 'AIS_FORM_NOT_FOUND')
  }

  const submit = readSubmitButton(document, html)
  const hiddenFields = readHiddenFields(document, html)

  for (const name of ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__VIEWSTATEENCRYPTED', '__EVENTVALIDATION']) {
    if (!(name in hiddenFields)) {
      hiddenFields[name] = readInputValue(document, html, name)
    }
  }

  return {
    id: `${Date.now()}`,
    source: 'portal',
    loginUrl: resolveUrl(form?.getAttribute('action') || readAttr(formTag, 'action') || AIS_LOGIN_URL),
    captchaUrl:
      captcha?.getAttribute('src') || readAttr(captchaTag, 'src')
        ? resolveUrl(captcha?.getAttribute('src') || readAttr(captchaTag, 'src'))
        : undefined,
    hiddenFields,
    submitName: submit.name || 'LGOIN_BTN',
    submitValue: submit.value || '登入/Login',
    notice:
      document?.querySelector('#server-mark')?.textContent?.trim() ||
      readTextBySelectorFallback(html, '#server-mark') ||
      undefined,
  }
}

export const parseAisLoginResult = (html: string) => {
  const document = readDocument(html)
  const stillOnLoginForm = document
    ? Boolean(document.querySelector('#M_PORTAL_LOGIN_ACNT, #M_PW2'))
    : /(?:id|name)=["']M_PORTAL_LOGIN_ACNT["']|(?:id|name)=["']M_PW2["']/i.test(html)
  const visibleError =
    document?.querySelector('#det_position, #det_position1, .det_position')?.textContent?.trim() ||
    readTextBySelectorFallback(html, '#det_position') ||
    readTextBySelectorFallback(html, '#det_position1') ||
    readTextBySelectorFallback(html, '.det_position') ||
    ''
  const alertError =
    html
      .match(/alert\(\s*(['"])(.*?)\1\s*\)/is)?.[2]
      ?.replace(/\\(['"\\])/g, '$1')
      .trim() || ''

  return {
    success: !stillOnLoginForm,
    message:
      visibleError ||
      alertError ||
      (stillOnLoginForm ? '登入失敗，請確認學號、密碼與驗證碼；驗證碼有區分大小寫' : ''),
  }
}

export const parsePortalProfile = (html: string, fallbackStudentId: string): StudentProfile => {
  const document = readDocument(html)
  const text =
    document?.body.textContent?.replace(/\s+/g, ' ').trim() ??
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  const nameMatch = text.match(/(?:姓名|使用者|User|歡迎)[:：\s]+([\u4e00-\u9fa5A-Za-z0-9_-]{2,20})/)
  const name = nameMatch?.[1] ?? fallbackStudentId

  return {
    id: fallbackStudentId,
    name,
    department: '海大 AIS',
    grade: '已登入',
    className: 'Cookie Session',
    avatarInitials: name.slice(0, 1),
  }
}
