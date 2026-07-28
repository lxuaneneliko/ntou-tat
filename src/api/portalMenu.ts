import { ApiError } from './errors'
import { assertOk, portalRequest } from './portalHttp'
import type { PortalSystemNode } from '../types'

const AIS_BASE_URL = 'https://ais.ntou.edu.tw/'
const MENU_URL = new URL('MenuTree.aspx', AIS_BASE_URL).toString()
const MAINFRAME_URL = new URL('mainframe.aspx', AIS_BASE_URL).toString()

type MenuNode = {
  text: string
  href: string
}

type MenuState = {
  fields: Record<string, string>
  lastIndex: number
  nodes: MenuNode[]
}

const readDocument = (html: string) =>
  typeof DOMParser === 'undefined' ? null : new DOMParser().parseFromString(html, 'text/html')

const readAttr = (tag: string, attr: string) =>
  tag.match(new RegExp(`\\b${attr}=["']([^"']*)["']`, 'i'))?.[1] ?? ''

const normalizeText = (value: string) =>
  value.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim()

const parseMenuNodes = (html: string): MenuNode[] => {
  const document = readDocument(html)
  if (document) {
    return [...document.querySelectorAll<HTMLAnchorElement>('a[href]')]
      .map((anchor) => ({
        text: normalizeText(anchor.textContent ?? ''),
        href: anchor.getAttribute('href') ?? '',
      }))
      .filter((node) => node.text)
  }

  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({
      text: normalizeText(match[2]),
      href: readAttr(match[1], 'href'),
    }))
    .filter((node) => node.text)
}

const parseHiddenFields = (html: string) => {
  const document = readDocument(html)
  if (document) {
    return [...document.querySelectorAll<HTMLInputElement>('input[name]')].reduce<Record<string, string>>(
      (fields, input) => {
        fields[input.name] = input.value ?? ''
        return fields
      },
      {},
    )
  }

  const fields: Record<string, string> = {}
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const name = readAttr(match[0], 'name')
    if (name) fields[name] = readAttr(match[0], 'value')
  }
  return fields
}

const decodeJavaScriptString = (value: string) =>
  value
    .replace(/\\u([0-9a-f]{4})/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\x([0-9a-f]{2})/gi, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\(['"\\])/g, '$1')

const parseExpandNode = (node: MenuNode, lastIndex: number) => {
  const index = Number(node.href.match(/TreeView_PopulateNode\([^,]+,\s*(\d+)/i)?.[1])
  const values = [
    ...node.href.matchAll(/'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g),
  ].map((match) => decodeJavaScriptString(match[1] ?? match[2] ?? ''))
  const [lineType, text, path, databound, datapath, parentIsLast] = values.slice(-6)

  if (!Number.isFinite(index) || !text || path === undefined) {
    throw new ApiError(`AIS 選單節點格式已變更：${node.text}`, 502, 'AIS_MENU_NODE_INVALID')
  }

  return {
    index,
    param:
      `${index}|${lastIndex}|${databound}f${parentIsLast}|` +
      `${text.length}|${text}${datapath.length}|${datapath}${path}`,
    lineType,
  }
}

const parseCallbackFrame = (raw: string) => {
  if (raw.startsWith('e')) {
    throw new ApiError(raw.slice(1) || 'AIS 選單回呼失敗', 502, 'AIS_MENU_CALLBACK_FAILED')
  }
  if (raw.startsWith('s')) {
    return { validation: '', result: raw.slice(1) }
  }
  if (raw.startsWith('<script')) {
    const message = raw.match(/alert\((['"])(.*?)\1\)/is)?.[2] ?? 'AIS 選單工作階段已失效'
    throw new ApiError(message, 401, 'AIS_MENU_SESSION_FAILED')
  }

  const separator = raw.indexOf('|')
  const validationLength = Number(raw.slice(0, separator))
  if (separator < 0 || !Number.isFinite(validationLength)) {
    throw new ApiError('AIS 選單回應格式已變更', 502, 'AIS_MENU_CALLBACK_INVALID')
  }
  const validationStart = separator + 1
  return {
    validation: raw.slice(validationStart, validationStart + validationLength),
    result: raw.slice(validationStart + validationLength),
  }
}

const expandNode = async (state: MenuState, node: MenuNode) => {
  const expansion = parseExpandNode(node, state.lastIndex)
  const body = new URLSearchParams(state.fields)
  body.set('__CALLBACKID', 'Menu_TreeView')
  body.set('__CALLBACKPARAM', expansion.param)

  const response = await portalRequest({
    url: MENU_URL,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: '*/*',
      Origin: 'https://ais.ntou.edu.tw',
      Referer: MENU_URL,
    },
    data: body.toString(),
  })
  assertOk(response, '無法展開 AIS 功能選單')

  const frame = parseCallbackFrame(response.data)
  const firstSeparator = frame.result.indexOf('|')
  const secondSeparator = frame.result.indexOf('|', firstSeparator + 1)
  const nextIndex = Number(frame.result.slice(0, firstSeparator))
  if (firstSeparator < 0 || secondSeparator < 0 || !Number.isFinite(nextIndex)) {
    throw new ApiError('AIS 選單內容格式已變更', 502, 'AIS_MENU_CONTENT_INVALID')
  }

  state.lastIndex = nextIndex
  state.fields.__EVENTVALIDATION = frame.validation || state.fields.__EVENTVALIDATION || ''
  state.fields.Menu_TreeView_ExpandState =
    (state.fields.Menu_TreeView_ExpandState || '') +
    frame.result.slice(firstSeparator + 1, secondSeparator)
  state.fields.Menu_TreeView_PopulateLog =
    (state.fields.Menu_TreeView_PopulateLog || '') + `${expansion.index},`
  state.nodes = parseMenuNodes(frame.result.slice(secondSeparator + 1))
}

const findNode = (nodes: MenuNode[], label: string) =>
  nodes.find((node) => node.text === label) ?? nodes.find((node) => node.text.includes(label))

const pageFromHref = (href: string) =>
  href.match(/([A-Za-z0-9_./-]+\.aspx(?:\?[^"' <>\s)]*)?)/i)?.[1]

const isExpandableNode = (node: MenuNode) => /TreeView_PopulateNode/i.test(node.href)

const createMenuState = (html: string): MenuState => {
  const lastIndex = Number(
    html.match(/Menu_TreeView_Data\.lastIndex\s*=\s*['"]?(\d+)/i)?.[1],
  )
  const nodes = parseMenuNodes(html)
  return {
    fields: parseHiddenFields(html),
    lastIndex: Number.isFinite(lastIndex) ? lastIndex : nodes.length,
    nodes,
  }
}

const systemNodesFromMenu = (nodes: MenuNode[], path: string[]): PortalSystemNode[] => {
  const seen = new Set<string>()
  return nodes
    .filter((node) => isExpandableNode(node) || Boolean(pageFromHref(node.href)))
    .filter((node) => {
      if (seen.has(node.text)) return false
      seen.add(node.text)
      return true
    })
    .map((node) => {
      const nodePath = [...path, node.text]
      return {
        id: nodePath.join('>'),
        title: node.text,
        kind: isExpandableNode(node) ? 'group' : 'page',
        path: nodePath,
      }
    })
}

export const parsePortalSystemNodes = (html: string, path: string[] = []) =>
  systemNodesFromMenu(parseMenuNodes(html), path)

export const listPortalSystemNodes = async (path: string[] = []) => {
  const response = await portalRequest({
    url: MENU_URL,
    method: 'GET',
    headers: { Accept: 'text/html,application/xhtml+xml', Referer: MAINFRAME_URL },
  })
  assertOk(response, '無法取得 AIS 功能選單')
  if (response.data.includes('使用時間逾時') || response.data.includes('M_PORTAL_LOGIN_ACNT')) {
    throw new ApiError('AIS 登入工作階段已失效，請重新登入', 401, 'AIS_MENU_SESSION_FAILED')
  }

  const state = createMenuState(response.data)
  for (const group of path) {
    const node = findNode(state.nodes, group)
    if (!node || !isExpandableNode(node)) {
      throw new ApiError(`AIS 功能選單找不到「${group}」`, 502, 'AIS_MENU_GROUP_NOT_FOUND')
    }
    await expandNode(state, node)
  }
  return systemNodesFromMenu(state.nodes, path)
}

export const resolvePortalMenuUrl = async (groups: string[], targetLabel: string) => {
  const response = await portalRequest({
    url: MENU_URL,
    method: 'GET',
    headers: { Accept: 'text/html,application/xhtml+xml', Referer: MAINFRAME_URL },
  })
  assertOk(response, '無法取得 AIS 功能選單')
  if (response.data.includes('使用時間逾時') || response.data.includes('M_PORTAL_LOGIN_ACNT')) {
    throw new ApiError('AIS 登入工作階段已失效，請重新登入', 401, 'AIS_MENU_SESSION_FAILED')
  }

  const state = createMenuState(response.data)

  for (const group of groups) {
    const node = findNode(state.nodes, group)
    if (!node) {
      throw new ApiError(`AIS 功能選單找不到「${group}」`, 502, 'AIS_MENU_GROUP_NOT_FOUND')
    }
    await expandNode(state, node)
  }

  const target = findNode(state.nodes, targetLabel)
  if (!target) {
    throw new ApiError(`AIS 功能選單找不到「${targetLabel}」`, 502, 'AIS_MENU_TARGET_NOT_FOUND')
  }
  const page = pageFromHref(target.href)
  if (!page) {
    throw new ApiError(`AIS 功能「${targetLabel}」沒有可用網址`, 502, 'AIS_MENU_URL_NOT_FOUND')
  }
  return new URL(page, MENU_URL).toString()
}

export const parsePortalLoaderUrl = (html: string, baseUrl: string) => {
  const page =
    html.match(/(?:mainFrame|viewFrame)\.location\.href\s*=\s*(['"])([^'"]+\.aspx(?:\?[^'"]*)?)\1/i)?.[2] ??
    html.match(/location\.href\s*=\s*(['"])([^'"]+\.aspx(?:\?[^'"]*)?)\1/i)?.[2]
  return page ? new URL(page, baseUrl).toString() : baseUrl
}
