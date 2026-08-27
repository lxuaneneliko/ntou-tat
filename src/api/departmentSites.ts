import { ApiError } from './errors'
import { assertOk, publicPageRequest } from './portalHttp'

export type DepartmentCollege =
  | '海運暨管理學院'
  | '生命科學院'
  | '海洋科學與資源學院'
  | '工學院'
  | '電機資訊學院'
  | '人文社會科學院'
  | '海洋法律與政策學院'

export type PublicContentSite = {
  id: string
  name: string
  shortName: string
  url: string
  homeUrl?: string
}

export type DepartmentSite = PublicContentSite & {
  college: DepartmentCollege
}

export type DepartmentPost = {
  id: string
  title: string
  publishedAt: string
  url: string
}

export type DepartmentCategory = {
  id: string
  label: string
  endpoint?: string
  initialPosts?: DepartmentPost[]
}

export type DepartmentOverview = {
  siteId: string
  categories: DepartmentCategory[]
  fetchedAt: string
}

export const DEPARTMENT_SITES: DepartmentSite[] = [
  { id: 'mmd', name: '商船學系', shortName: '商船', college: '海運暨管理學院', url: 'https://mmd.ntou.edu.tw/', homeUrl: 'https://mmd.ntou.edu.tw/app/home.php' },
  { id: 'dstm', name: '航運管理學系', shortName: '航管', college: '海運暨管理學院', url: 'https://dstm.ntou.edu.tw/' },
  { id: 'tsweb', name: '運輸科學系', shortName: '運輸', college: '海運暨管理學院', url: 'https://tsweb.ntou.edu.tw/' },
  { id: 'dme', name: '輪機工程學系', shortName: '輪機', college: '海運暨管理學院', url: 'https://dme.ntou.edu.tw/' },
  { id: 'dotm', name: '海洋觀光管理學士學位學程', shortName: '海洋觀光', college: '海運暨管理學院', url: 'https://dotm.ntou.edu.tw/' },
  { id: 'oom', name: '海洋經營管理學士學位學程', shortName: '海洋經管', college: '海運暨管理學院', url: 'https://oom.ntou.edu.tw/' },
  { id: 'fs', name: '食品科學系', shortName: '食科', college: '生命科學院', url: 'https://fs.ntou.edu.tw/' },
  { id: 'aqua', name: '水產養殖學系', shortName: '養殖', college: '生命科學院', url: 'https://aqua.ntou.edu.tw/' },
  { id: 'dbb', name: '生命科學暨生物科技學系', shortName: '生科', college: '生命科學院', url: 'https://dbb.ntou.edu.tw/' },
  { id: 'bmb', name: '海洋生物科技學士學位學程', shortName: '海生科', college: '生命科學院', url: 'https://bmb.ntou.edu.tw/' },
  { id: 'fd', name: '環境生物與漁業科學學系', shortName: '環漁', college: '海洋科學與資源學院', url: 'https://fd.ntou.edu.tw/' },
  { id: 'mei', name: '海洋環境資訊系', shortName: '海環', college: '海洋科學與資源學院', url: 'https://mei.ntou.edu.tw/' },
  { id: 'me', name: '機械與機電工程學系', shortName: '機械', college: '工學院', url: 'https://me.ntou.edu.tw/' },
  { id: 'se', name: '系統工程暨造船學系', shortName: '系船', college: '工學院', url: 'https://se.ntou.edu.tw/' },
  { id: 'hreweb', name: '河海工程學系', shortName: '河工', college: '工學院', url: 'https://hreweb.ntou.edu.tw/' },
  { id: 'oet', name: '海洋工程科技學士學位學程', shortName: '海工', college: '工學院', url: 'https://oet.ntou.edu.tw/' },
  { id: 'ee', name: '電機工程學系', shortName: '電機', college: '電機資訊學院', url: 'https://ee.ntou.edu.tw/' },
  { id: 'cse', name: '資訊工程學系', shortName: '資工', college: '電機資訊學院', url: 'https://cse.ntou.edu.tw/' },
  { id: 'cnce', name: '通訊與導航工程學系', shortName: '通訊導航', college: '電機資訊學院', url: 'https://cnce.ntou.edu.tw/' },
  { id: 'omt', name: '光電與材料科技學系', shortName: '光電材料', college: '電機資訊學院', url: 'https://omt.ntou.edu.tw/' },
  { id: 'ccdi', name: '海洋文創設計產業學士學位學程', shortName: '海洋文創', college: '人文社會科學院', url: 'https://ccdi.ntou.edu.tw/' },
  { id: 'dolp', name: '海洋法政學士學位學程', shortName: '海洋法政', college: '海洋法律與政策學院', url: 'https://dolp.ntou.edu.tw/' },
]

export const DEPARTMENT_COLLEGES: DepartmentCollege[] = [
  '海運暨管理學院',
  '生命科學院',
  '海洋科學與資源學院',
  '工學院',
  '電機資訊學院',
  '人文社會科學院',
  '海洋法律與政策學院',
]

const departmentById = new Map(DEPARTMENT_SITES.map((site) => [site.id, site]))
const mockMode = import.meta.env.VITE_NTOU_AUTH_MODE === 'mock'
const cleanText = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()

const safeNtouUrl = (value: string, baseUrl: string) => {
  try {
    const parsed = new URL(value, baseUrl)
    if (parsed.protocol !== 'https:' || !(parsed.hostname === 'ntou.edu.tw' || parsed.hostname.endsWith('.ntou.edu.tw'))) return null
    return parsed.toString()
  } catch {
    return null
  }
}

const publishedAtFrom = (node: Element) => {
  const nearby = cleanText(node.querySelector('.mdate, .date, time, .date-pos')?.textContent)
  const source = nearby || cleanText(node.textContent)
  const match = source.match(/(?:20\d{2}[./-]\d{1,2}[./-]\d{1,2}|\d{3}[./-]\d{1,2}[./-]\d{1,2})/)
  return match?.[0]?.replace(/[./]/g, '-') ?? '未標日期'
}

const postId = (url: string, categoryId: string, index: number) => {
  const match = url.match(/\/(?:p\/)?(?:40[356]|45\d)-[^/]*?(\d+)(?:,|\.|\?|$)/)
  return `${categoryId}-${match?.[1] ?? index}-${url.length}`
}

const parsePostsWithin = (root: ParentNode, baseUrl: string, categoryId: string) => {
  const containers = [...root.querySelectorAll('.mtitle')]
  const fallbacks = containers.length
    ? containers
    : [...root.querySelectorAll('.d-title, .listTB li, .listTB tr, article, .news-item, .post-item')]
  const seen = new Set<string>()
  const posts: DepartmentPost[] = []

  fallbacks.forEach((container, index) => {
    const anchor = container.querySelector<HTMLAnchorElement>('a[href]')
    if (!anchor) return
    const title = cleanText(anchor.textContent || anchor.getAttribute('title'))
    const url = safeNtouUrl(anchor.getAttribute('href') ?? '', baseUrl)
    if (!url || title.length < 3 || title.length > 240 || seen.has(url)) return
    seen.add(url)
    posts.push({
      id: postId(url, categoryId, index),
      title,
      publishedAt: publishedAtFrom(container),
      url,
    })
  })

  return posts.slice(0, 30)
}

export const parseDepartmentPosts = (html: string, baseUrl: string, categoryId: string) => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  return parsePostsWithin(document, baseUrl, categoryId)
}

const ignoredStaticSection = /相關連結|網站連結|常用連結|分眾入口|聯繫我們|失物招領|影音專區|活動剪影|海大資工|運輸最愛|國際交換生心得/i

export const parseDepartmentHomepage = (html: string, site: PublicContentSite): DepartmentOverview => {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const baseUrl = site.homeUrl ?? site.url
  const categories: DepartmentCategory[] = []
  const labels = new Set<string>()

  document.querySelectorAll<HTMLAnchorElement>('a[href^="#cmb_"]').forEach((anchor) => {
    const label = cleanText(anchor.textContent || anchor.title)
    const selector = anchor.getAttribute('href')
    if (!label || !selector || labels.has(label)) return
    const target = document.getElementById(selector.slice(1))
    const source = target?.innerHTML ?? ''
    const number = source.match(/mobileloadmod(?:[^'"\s]|&amp;)*?Nbr=(\d+)/i)?.[1]
    if (!number) return
    const endpoint = safeNtouUrl(`/app/index.php?Action=mobileloadmod&Type=mobile_rcg_mstr&Nbr=${number}`, baseUrl)
    if (!endpoint) return
    labels.add(label)
    categories.push({ id: `${site.id}-${number}`, label, endpoint })
  })

  if (!categories.length) {
    document.querySelectorAll('.module').forEach((module, index) => {
      const label = cleanText(module.querySelector('.mt-title, h1, h2, h3')?.textContent)
      if (!label || labels.has(label) || ignoredStaticSection.test(label)) return
      const id = `${site.id}-static-${index}`
      const initialPosts = parsePostsWithin(module, baseUrl, id)
      if (!initialPosts.length) return
      labels.add(label)
      categories.push({ id, label, initialPosts })
    })
  }

  if (!categories.length) {
    const id = `${site.id}-latest`
    const initialPosts = parsePostsWithin(document, baseUrl, id)
    if (initialPosts.length) categories.push({ id, label: '最新資訊', initialPosts })
  }

  return { siteId: site.id, categories, fetchedAt: new Date().toISOString() }
}

const requireSite = (siteId: string) => {
  const site = departmentById.get(siteId)
  if (!site) throw new ApiError('找不到這個系所網站', 404, 'DEPARTMENT_SITE_NOT_FOUND')
  return site
}

const mockOverview = (site: DepartmentSite): DepartmentOverview => ({
  siteId: site.id,
  fetchedAt: new Date().toISOString(),
  categories: [
    {
      id: `${site.id}-mock-news`,
      label: site.id === 'cse' ? '學業資訊' : site.id === 'dstm' ? '課程資訊' : '系所公告',
      initialPosts: [
        { id: `${site.id}-mock-1`, title: '115 學年度第 1 學期重要事項公告', publishedAt: '2026-08-25', url: site.url },
        { id: `${site.id}-mock-2`, title: '新生課程與選課說明', publishedAt: '2026-08-18', url: site.url },
        { id: `${site.id}-mock-3`, title: '系所活動與獎學金資訊', publishedAt: '2026-08-11', url: site.url },
      ],
    },
    {
      id: `${site.id}-mock-recruit`,
      label: site.id === 'cse' ? '實習徵才' : '招生資訊',
      initialPosts: [
        { id: `${site.id}-mock-4`, title: '系所招生與實習機會整理', publishedAt: '2026-08-08', url: site.url },
      ],
    },
  ],
})

export const fetchDepartmentOverview = async (siteId: string): Promise<DepartmentOverview> => {
  const site = requireSite(siteId)
  if (mockMode) return mockOverview(site)
  const response = await publicPageRequest({
    url: site.homeUrl ?? site.url,
    method: 'GET',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Encoding': 'identity',
    },
    timeoutMs: 30000,
  }, `${site.shortName}系網`)
  assertOk(response, `無法取得${site.shortName}系網`)
  const overview = parseDepartmentHomepage(response.data, site)
  if (!overview.categories.length) {
    throw new ApiError(`${site.shortName}系網目前沒有可讀取的消息區`, 502, 'DEPARTMENT_CATEGORIES_EMPTY')
  }
  return overview
}

export const fetchDepartmentCategory = async (siteId: string, category: DepartmentCategory) => {
  const site = requireSite(siteId)
  if (category.initialPosts) return category.initialPosts
  if (!category.endpoint) return []
  const endpoint = safeNtouUrl(category.endpoint, site.homeUrl ?? site.url)
  if (!endpoint || new URL(endpoint).hostname !== new URL(site.url).hostname) {
    throw new ApiError('系所消息網址不在允許的網域內', 400, 'DEPARTMENT_CATEGORY_URL_INVALID')
  }
  const response = await publicPageRequest({
    url: endpoint,
    method: 'POST',
    data: '',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Encoding': 'identity',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: site.homeUrl ?? site.url,
      'X-Requested-With': 'XMLHttpRequest',
    },
    timeoutMs: 30000,
  }, `${site.shortName}－${category.label}`)
  assertOk(response, `無法取得${site.shortName}的${category.label}`)
  return parseDepartmentPosts(response.data, site.url, category.id)
}
