const buildingNames: Record<string, string> = {
  AAC: '水生動物實驗中心',
  ADM: '行政大樓',
  BOH: '人文大樓',
  CC3: '電算中心（圖資處）三樓',
  'CE-': '工學院大樓',
  CLS: '生命科學院館',
  ECG: '電資暨綜合教學大樓',
  EE1: '電機一館',
  EE2: '電機二館',
  FRB: '第一餐廳',
  FSB: '食安所館',
  FSH: '環漁系館',
  GH1: '綜合一館',
  GH2: '綜合二館',
  GH3: '綜合三館',
  GRC: '綜合研究中心',
  GYM: '體育館',
  HR1: '河工一館',
  HR2: '河工二館',
  HRE: '海工館',
  INS: '資工系館',
  IVY: '沛華大樓',
  LIB: '圖書館大樓',
  MAF: '海事大樓',
  MEA: '機械A館',
  MEB: '機械B館',
  MFE: '食科工程館',
  MFS: '食品科學館',
  'MZ-': '馬祖校區教學大樓',
  NAV: '商船大樓',
  NVA: '造船系館',
  OCE: '海洋系館',
  ODB: '海大意象館（海洋夢想基地）',
  SAC: '學生活動中心',
  SAH: '海空大樓',
  SPF: '體育場地',
  STA: '育樂館',
  STM: '航管大樓',
  TEC: '技術大樓',
  UAH: '空蝕水槽',
}

const aliases: Record<string, string> = {
  MZ: 'MZ-',
}

const codePrefixes = [...Object.keys(buildingNames), ...Object.keys(aliases)]
  .sort((left, right) => right.length - left.length)

const normalizedClassroomCode = (value: string) => value
  .normalize('NFKC')
  .toUpperCase()
  .replace(/[‐‑‒–—―－]/g, '-')
  .replace(/\s+/g, '')

export type ClassroomDescription = {
  building: string
  room: string
}

export const describeClassroom = (value: string): ClassroomDescription | null => {
  const normalized = normalizedClassroomCode(value)
  if (!normalized || /[\u3400-\u9fff]/u.test(normalized)) return null

  if (normalized === 'ADM001') return { building: '海洋廳', room: '' }
  if (normalized === 'ADM002') return { building: '第一演講廳', room: '' }
  if (normalized === 'ADM003') return { building: '第二演講廳', room: '' }

  const prefix = codePrefixes.find((candidate) => normalized.startsWith(candidate))
  if (!prefix) return null
  const canonical = aliases[prefix] ?? prefix
  const building = buildingNames[canonical]
  if (!building) return null

  const room = normalized.slice(prefix.length).replace(/^-+/, '')
  if (!/^[A-Z0-9-]*$/.test(room)) return null
  return { building, room }
}

export const formatClassroom = (value: string) => {
  const raw = value.trim()
  if (!raw) return ''
  const description = describeClassroom(raw)
  if (description) {
    const chinese = description.room
      ? `${description.building} ${description.room}`
      : description.building
    return `${raw}（${chinese}）`
  }

  const parts = raw.split(/([、,，/／;；\n]+)/)
  if (parts.length === 1) return raw
  let mapped = false
  const formatted = parts.map((part) => {
    if (/^[、,，/／;；\n]+$/.test(part)) return part
    const item = describeClassroom(part)
    if (!item) return part
    mapped = true
    const chinese = item.room ? `${item.building} ${item.room}` : item.building
    return `${part.trim()}（${chinese}）`
  })
  return mapped ? formatted.join('') : raw
}

export const NTOU_BUILDING_NAMES = buildingNames
