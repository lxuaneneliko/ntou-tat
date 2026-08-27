import { ApiError } from './errors'
import {
  parseDepartmentHomepage,
  parseDepartmentPosts,
  type DepartmentCategory,
  type DepartmentOverview,
  type DepartmentPost,
  type PublicContentSite,
} from './departmentSites'
import { assertOk, publicPageRequest } from './portalHttp'

export type AdministrativeGroup = '校級單位' | '行政處室' | '行政中心' | '附屬學校'

export type AdministrativeUnit = PublicContentSite & {
  group: AdministrativeGroup
  feedUrl?: string
  children?: AdministrativeUnit[]
}

const unit = (
  id: string,
  name: string,
  shortName: string,
  group: AdministrativeGroup,
  url: string,
  options: Pick<AdministrativeUnit, 'feedUrl' | 'children'> = {},
): AdministrativeUnit => ({ id, name, shortName, group, url, ...options })

const child = (
  id: string,
  name: string,
  shortName: string,
  url: string,
  feedUrl?: string,
): AdministrativeUnit => unit(id, name, shortName, '行政處室', url, { feedUrl })

export const ADMINISTRATIVE_GROUPS: AdministrativeGroup[] = [
  '校級單位',
  '行政處室',
  '行政中心',
  '附屬學校',
]

export const ADMINISTRATIVE_UNITS: AdministrativeUnit[] = [
  unit('president', '校長室', '校長室', '校級單位', 'https://president.ntou.edu.tw/'),
  unit('vp-li', '李明安副校長室', '李副校長', '校級單位', 'https://vpresi.ntou.edu.tw/p/412-1004-6744.php?Lang=zh-tw', { feedUrl: 'https://vpresi.ntou.edu.tw/' }),
  unit('vp-chuang', '莊季高副校長室', '莊副校長', '校級單位', 'https://vpresi.ntou.edu.tw/p/412-1004-4327.php?Lang=zh-tw', { feedUrl: 'https://vpresi.ntou.edu.tw/' }),
  unit('vp-jan', '冉繁華副校長室', '冉副校長', '校級單位', 'https://vpresi.ntou.edu.tw/p/412-1004-10854.php?Lang=zh-tw', { feedUrl: 'https://vpresi.ntou.edu.tw/' }),
  unit('vp-ku', '顧承宇副校長室', '顧副校長', '校級單位', 'https://vpresi.ntou.edu.tw/p/412-1004-10855.php?Lang=zh-tw', { feedUrl: 'https://vpresi.ntou.edu.tw/' }),
  unit('academic', '教務處', '教務處', '行政處室', 'https://academic.ntou.edu.tw/', {
    children: [
      child('academic-registration', '註冊課務組', '註課組', 'https://academic.ntou.edu.tw/p/412-1005-3031.php?Lang=zh-tw'),
      child('academic-admission', '招生組', '招生組', 'https://academic.ntou.edu.tw/p/412-1005-3049.php?Lang=zh-tw'),
      child('academic-services', '學術服務組', '學服組', 'https://academic.ntou.edu.tw/p/412-1005-3050.php?Lang=zh-tw'),
      child('academic-career', '實習暨就業輔導組', '實就組', 'https://academic.ntou.edu.tw/p/412-1005-3051.php?Lang=zh-tw'),
      child('academic-extension', '進修推廣組', '進推組', 'https://academic.ntou.edu.tw/p/412-1005-1031.php?Lang=zh-tw'),
      child('academic-teaching', '教學中心', '教學中心', 'https://academic.ntou.edu.tw/p/412-1005-3052.php?Lang=zh-tw'),
    ],
  }),
  unit('research', '研究發展處', '研發處', '行政處室', 'https://research.ntou.edu.tw/', {
    children: [
      child('research-planning', '企劃暨學術合作組', '企合組', 'https://research.ntou.edu.tw/p/412-1021-6858.php?Lang=zh-tw'),
      child('research-projects', '計畫業務組', '計畫組', 'https://research.ntou.edu.tw/p/412-1021-6859.php?Lang=zh-tw'),
      child('research-journal', '海洋學刊編輯組', '學刊組', 'https://research.ntou.edu.tw/p/412-1021-6861.php?Lang=zh-tw'),
      child('research-vessel', '研究船船務中心', '船務中心', 'https://research.ntou.edu.tw/p/412-1021-7245.php?Lang=zh-tw'),
    ],
  }),
  unit('student-affairs', '學生事務處', '學務處', '行政處室', 'https://stu.ntou.edu.tw/', {
    children: [
      child('student-counseling', '諮商輔導組', '諮輔組', 'https://stu.ntou.edu.tw/p/412-1023-7462.php?Lang=zh-tw'),
      child('student-life', '生活輔導組', '生輔組', 'https://stu.ntou.edu.tw/p/412-1023-7511.php?Lang=zh-tw'),
      child('student-activities', '課外活動指導組', '課指組', 'https://stu.ntou.edu.tw/p/412-1023-7602.php?Lang=zh-tw'),
      child('student-health', '衛生保健組', '衛保組', 'https://stu.ntou.edu.tw/p/412-1023-7457.php?Lang=zh-tw'),
      child('student-housing', '住宿輔導組', '住輔組', 'https://stu.ntou.edu.tw/p/412-1023-7545.php?Lang=zh-tw'),
      child('student-security', '校安中心', '校安中心', 'https://stu.ntou.edu.tw/p/412-1023-7595.php?Lang=zh-tw'),
    ],
  }),
  unit('general-affairs', '總務處', '總務處', '行政處室', 'https://ga.ntou.edu.tw/', {
    children: [
      child('general-documents', '文書組', '文書組', 'https://ga.ntou.edu.tw/p/412-1015-7105.php?Lang=zh-tw'),
      child('general-services', '事務組', '事務組', 'https://ga.ntou.edu.tw/p/412-1015-7338.php?Lang=zh-tw'),
      child('general-cashier', '出納組', '出納組', 'https://ga.ntou.edu.tw/p/412-1015-7351.php?Lang=zh-tw'),
      child('general-property', '保管組', '保管組', 'https://ga.ntou.edu.tw/p/412-1015-11111.php?Lang=zh-tw'),
      child('general-construction', '營繕組', '營繕組', 'https://ga.ntou.edu.tw/p/412-1015-7372.php?Lang=zh-tw'),
      child('general-environment', '環安組', '環安組', 'https://ga.ntou.edu.tw/p/412-1015-7378.php?Lang=zh-tw'),
      child('general-guard', '駐衛警察隊', '駐警隊', 'https://ga.ntou.edu.tw/p/412-1015-7391.php?Lang=zh-tw'),
    ],
  }),
  unit('library-information', '圖書暨資訊處', '圖資處', '行政處室', 'https://li.ntou.edu.tw/', {
    children: [
      child('library-acquisition', '採編組', '採編組', 'https://li.ntou.edu.tw/p/412-1029-6928.php?Lang=zh-tw'),
      child('library-reader', '閱覽組', '閱覽組', 'https://li.ntou.edu.tw/p/412-1029-6929.php?Lang=zh-tw'),
      child('library-services', '資訊服務組', '資服組', 'https://li.ntou.edu.tw/p/412-1029-13799.php?Lang=zh-tw'),
      child('library-systems', '校務系統組', '校務組', 'https://li.ntou.edu.tw/p/412-1029-6932.php?Lang=zh-tw'),
      child('library-security', '資安網路組', '資安組', 'https://li.ntou.edu.tw/p/412-1029-13800.php?Lang=zh-tw'),
    ],
  }),
  unit('international', '國際事務處', '國際處', '行政處室', 'https://oia.ntou.edu.tw/', {
    children: [
      child('international-cooperation', '國際合作組', '國合組', 'https://oia.ntou.edu.tw/p/412-1022-6903.php?Lang=zh-tw#國際合作組', 'https://oia.ntou.edu.tw/'),
      child('international-students', '國際學生事務組', '國生組', 'https://oia.ntou.edu.tw/p/412-1022-6903.php?Lang=zh-tw#國際學生事務組', 'https://oia.ntou.edu.tw/'),
      child('international-overseas', '僑陸生事務組', '僑陸組', 'https://oia.ntou.edu.tw/p/412-1022-6903.php?Lang=zh-tw', 'https://oia.ntou.edu.tw/'),
      child('international-planning', '國際企劃組', '國企組', 'https://oia.ntou.edu.tw/p/412-1022-6903.php?Lang=zh-tw', 'https://oia.ntou.edu.tw/'),
    ],
  }),
  unit('physical-education', '體育室', '體育室', '行政處室', 'https://peadmin.ntou.edu.tw/', {
    children: [
      child('physical-teaching', '體育教學組', '體教組', 'https://peadmin.ntou.edu.tw/p/412-1012-2877.php?Lang=zh-tw'),
      child('physical-activities', '體育活動組', '體活組', 'https://peadmin.ntou.edu.tw/p/412-1012-2883.php?Lang=zh-tw'),
    ],
  }),
  unit('secretariat', '秘書室', '秘書室', '行政處室', 'https://secretariat.ntou.edu.tw/', {
    children: [
      child('secretariat-office', '秘書組', '秘書組', 'https://secretariat.ntou.edu.tw/app/home.php?Lang=zh-tw'),
      child('secretariat-alumni', '校友服務中心', '校友中心', 'https://alumni.ntou.edu.tw/'),
      child('secretariat-museum', '校史博物館', '校史館', 'https://secretariat.ntou.edu.tw/p/412-1121-7434.php?Lang=zh-tw'),
      child('secretariat-media', '媒體公關暨出版中心', '媒體中心', 'https://mprp.ntou.edu.tw/'),
    ],
  }),
  unit('personnel', '人事室', '人事室', '行政處室', 'https://personnel.ntou.edu.tw/', {
    children: [
      child('personnel-first', '人事第一組', '第一組', 'https://personnel.ntou.edu.tw/p/412-1007-1374.php?Lang=zh-tw#第一組', 'https://personnel.ntou.edu.tw/'),
      child('personnel-second', '人事第二組', '第二組', 'https://personnel.ntou.edu.tw/p/412-1007-1374.php?Lang=zh-tw#第二組', 'https://personnel.ntou.edu.tw/'),
    ],
  }),
  unit('accounting', '主計室', '主計室', '行政處室', 'https://acc.ntou.edu.tw/', {
    children: [
      child('accounting-budget', '預算組', '預算組', 'https://acc.ntou.edu.tw/p/412-1088-9675.php?Lang=zh-tw'),
      child('accounting-office', '會計組', '會計組', 'https://acc.ntou.edu.tw/p/412-1088-9676.php?Lang=zh-tw'),
    ],
  }),
  unit('occupational-safety', '職業安全衛生中心', '職安中心', '行政中心', 'https://oshc.ntou.edu.tw/'),
  unit('industry-operations', '產學營運總中心', '產總中心', '行政中心', 'https://tlo.ntou.edu.tw/'),
  unit('matsu-office', '馬祖行政處', '馬祖處', '行政中心', 'https://matsu.ntou.edu.tw/'),
  unit('social-responsibility', '社會責任實踐與永續發展中心', 'USR中心', '行政中心', 'https://usrsdg.ntou.edu.tw/', {
    children: [
      child('social-responsibility-practice', '社會責任實踐組', '社責組', 'https://usrsdg.ntou.edu.tw/p/426-1103-8.php?Lang=zh-tw'),
      child('social-responsibility-sustainability', '永續發展組', '永續組', 'https://usrsdg.ntou.edu.tw/p/426-1103-9.php?Lang=zh-tw'),
      child('social-responsibility-research', '校務研究組', '校研組', 'https://usrsdg.ntou.edu.tw/p/426-1103-11.php?Lang=zh-tw'),
    ],
  }),
  unit('affiliated-high-school', '國立臺灣海洋大學附屬基隆海事高級中等學校', '海大附中', '附屬學校', 'https://www.klms.ntou.edu.tw/'),
]

export const ADMINISTRATIVE_CONTENT_UNITS = ADMINISTRATIVE_UNITS.flatMap((parent) => [
  parent,
  ...(parent.children ?? []),
])

const unitById = new Map(ADMINISTRATIVE_CONTENT_UNITS.map((site) => [site.id, site]))
const mockMode = import.meta.env.VITE_NTOU_AUTH_MODE === 'mock'

const requireUnit = (unitId: string) => {
  const selected = unitById.get(unitId)
  if (!selected) throw new ApiError('找不到這個行政單位網站', 404, 'ADMINISTRATIVE_UNIT_NOT_FOUND')
  return selected
}

const contentSite = (selected: AdministrativeUnit): PublicContentSite => ({
  id: selected.id,
  name: selected.name,
  shortName: selected.shortName,
  url: selected.feedUrl ?? selected.url,
  homeUrl: selected.feedUrl ?? selected.url,
})

const mockOverview = (selected: AdministrativeUnit): DepartmentOverview => ({
  siteId: selected.id,
  fetchedAt: new Date().toISOString(),
  categories: [{
    id: `${selected.id}-mock-news`,
    label: selected.id === 'student-activities' ? '最新消息' : '單位公告',
    initialPosts: [
      { id: `${selected.id}-mock-1`, title: `${selected.name}最新消息`, publishedAt: '2026-08-27', url: selected.url },
      { id: `${selected.id}-mock-2`, title: `${selected.shortName}重要事項公告`, publishedAt: '2026-08-25', url: selected.url },
    ],
  }],
})

export const fetchAdministrativeOverview = async (unitId: string): Promise<DepartmentOverview> => {
  const selected = requireUnit(unitId)
  if (mockMode) return mockOverview(selected)
  const site = contentSite(selected)
  const response = await publicPageRequest({
    url: site.url,
    method: 'GET',
    headers: { Accept: 'text/html,application/xhtml+xml', 'Accept-Encoding': 'identity' },
    timeoutMs: 30000,
  }, `${selected.shortName}官網`)
  assertOk(response, `無法取得${selected.shortName}官網`)
  const overview = parseDepartmentHomepage(response.data, site)
  if (!overview.categories.length) {
    throw new ApiError(`${selected.shortName}官網目前沒有可讀取的消息區`, 502, 'ADMINISTRATIVE_CATEGORIES_EMPTY')
  }
  return overview
}

export const fetchAdministrativeCategory = async (
  unitId: string,
  category: DepartmentCategory,
): Promise<DepartmentPost[]> => {
  const selected = requireUnit(unitId)
  if (category.initialPosts) return category.initialPosts
  if (!category.endpoint) return []
  const site = contentSite(selected)
  let endpoint: URL
  try {
    endpoint = new URL(category.endpoint, site.url)
  } catch {
    throw new ApiError('行政單位消息網址格式不正確', 400, 'ADMINISTRATIVE_CATEGORY_URL_INVALID')
  }
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== new URL(site.url).hostname) {
    throw new ApiError('行政單位消息網址不在允許的網域內', 400, 'ADMINISTRATIVE_CATEGORY_URL_INVALID')
  }
  const response = await publicPageRequest({
    url: endpoint.toString(),
    method: 'POST',
    data: '',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Encoding': 'identity',
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Referer: site.url,
      'X-Requested-With': 'XMLHttpRequest',
    },
    timeoutMs: 30000,
  }, `${selected.shortName}－${category.label}`)
  assertOk(response, `無法取得${selected.shortName}的${category.label}`)
  return parseDepartmentPosts(response.data, site.url, category.id)
}

export type AdministrativeOverview = DepartmentOverview
export type AdministrativeCategory = DepartmentCategory
export type AdministrativePost = DepartmentPost
