import rawBuildings from './data/ntou-map-buildings.json'
import rawProfessors from './data/ntou-map-professors.json'
import type { FeatureCollection, LineString, Point } from 'geojson'

export const NTOU_MAP_DATA_RETRIEVED_AT = '2026-09-16'
export const NTOU_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'
export const NTOU_CAMPUS_CENTER: MapCoordinate = [121.77559, 25.14939]
export const NTOU_CAMPUS_BOUNDS: [MapCoordinate, MapCoordinate] = [
  [121.764, 25.143],
  [121.796, 25.153],
]

const WALKING_ROUTE_ENDPOINT =
  'https://routing.openstreetmap.de/routed-foot/route/v1/driving'
let lastWalkingRouteRequestAt = 0

type RawBuilding = {
  number?: string
  'number  '?: string
  name?: string
  name_ch?: string
  code_id?: string
  name_id?: string
  location_code?: string
  lat?: number
  lon?: number
}

type RawProfessor = {
  name?: string
  name_EN?: string
  office?: string
}

export type MapCoordinate = [longitude: number, latitude: number]

export type CampusBuilding = {
  id: string
  number: string
  name: string
  nameZh: string
  code: string
  grid: string
  coordinate: MapCoordinate
}

export type CampusProfessor = {
  id: string
  name: string
  nameEn: string
  office: string
  buildingCode: string
  building: CampusBuilding | null
}

export type CampusSearchKind = 'building' | 'professor'

export type CampusSearchResult = {
  id: string
  kind: CampusSearchKind
  title: string
  subtitle: string
  building: CampusBuilding | null
  professor: CampusProfessor | null
  room: string
  score: number
}

export type WalkingRoute = {
  geometry: LineString
  distanceMeters: number
  durationSeconds: number
}

type RouteResponse = {
  code?: string
  routes?: Array<{
    distance?: number
    duration?: number
    geometry?: LineString
  }>
}

const officeBuildingAliases: Record<string, string> = {
  FE: 'MFE',
  FS: 'MFS',
}

const buildingSearchAliases: Record<string, string[]> = {
  MFE: ['FE'],
  MFS: ['FS'],
}

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('zh-Hant')
    .replace(/[\s_./·、，,()（）-]+/g, '')

const asFiniteNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeBuilding = (row: RawBuilding, index: number): CampusBuilding | null => {
  const longitude = asFiniteNumber(row.lon)
  const latitude = asFiniteNumber(row.lat)
  if (longitude === null || latitude === null) return null

  const number = String(row.number ?? row['number  '] ?? '').trim()
  const code = String(row.code_id ?? row.name_id ?? '').trim().toUpperCase()
  const name = String(row.name ?? '').trim()
  const nameZh = String(row.name_ch ?? '').trim()
  if (number === '75' && normalizeText(name) === 'amungus') return null

  return {
    id: number ? `building-${number}` : `building-${index + 1}`,
    number,
    name,
    nameZh,
    code,
    grid: String(row.location_code ?? '').trim().toUpperCase(),
    coordinate: [longitude, latitude],
  }
}

export const campusBuildings = (rawBuildings as RawBuilding[])
  .map(normalizeBuilding)
  .filter((building): building is CampusBuilding => Boolean(building))

const buildingByCode = new Map(
  campusBuildings
    .filter((building) => building.code)
    .map((building) => [building.code, building] as const),
)

const parseOffice = (office: string) => {
  const [rawCode = '', ...roomParts] = office.trim().split(/\s+/)
  const buildingCode = (officeBuildingAliases[rawCode.toUpperCase()] || rawCode).toUpperCase()
  return { buildingCode, room: roomParts.join(' ') }
}

export const campusProfessors = (rawProfessors as RawProfessor[]).map((row, index) => {
  const office = String(row.office ?? '').trim()
  const { buildingCode } = parseOffice(office)
  const name = String(row.name ?? '').trim()
  const nameEn = String(row.name_EN ?? '').trim()
  return {
    id: `professor-${index + 1}-${normalizeText(name)}`,
    name,
    nameEn,
    office,
    buildingCode,
    building: buildingByCode.get(buildingCode) ?? null,
  } satisfies CampusProfessor
})

const textScore = (candidate: string, query: string) => {
  const normalized = normalizeText(candidate)
  if (!normalized || !query) return 0
  if (normalized === query) return 120
  if (normalized.startsWith(query)) return 92
  if (normalized.includes(query)) return 72 + Math.min(12, query.length)
  return 0
}

const roomFromBuildingQuery = (building: CampusBuilding, query: string) => {
  if (!building.code) return ''
  const matchedCode = [building.code, ...(buildingSearchAliases[building.code] || [])]
    .map(normalizeText)
    .find((code) => query.startsWith(code) && query.length > code.length)
  if (!matchedCode) return ''
  return query.slice(matchedCode.length).toUpperCase()
}

export function searchCampus(
  value: string,
  kind: CampusSearchKind | 'all' = 'all',
  limit = 10,
): CampusSearchResult[] {
  const query = normalizeText(value)
  if (!query) return []

  const results: CampusSearchResult[] = []

  if (kind !== 'professor') {
    campusBuildings.forEach((building) => {
      const room = roomFromBuildingQuery(building, query)
      const codeRoomScore = room ? 116 : 0
      const score = Math.max(
        codeRoomScore,
        textScore(building.number, query),
        textScore(building.name, query),
        textScore(building.nameZh, query),
        textScore(building.code, query),
        ...(buildingSearchAliases[building.code] || []).map((alias) => textScore(alias, query)),
        textScore(building.grid, query),
      )
      if (!score) return
      const meta = [building.code, room ? `教室 ${room}` : building.grid]
        .filter(Boolean)
        .join(' · ')
      results.push({
        id: room ? `${building.id}-room-${room}` : building.id,
        kind: 'building',
        title: building.nameZh || building.name,
        subtitle: meta || building.name,
        building,
        professor: null,
        room,
        score,
      })
    })
  }

  if (kind !== 'building') {
    campusProfessors.forEach((professor) => {
      const score = Math.max(
        textScore(professor.name, query),
        textScore(professor.nameEn, query),
        textScore(professor.office, query),
      )
      if (!score) return
      const subtitle = professor.building
        ? `${professor.office} · ${professor.building.nameZh}`
        : professor.office
      results.push({
        id: professor.id,
        kind: 'professor',
        title: professor.name,
        subtitle,
        building: professor.building,
        professor,
        room: parseOffice(professor.office).room,
        score: score + 2,
      })
    })
  }

  return results
    .sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, 'zh-Hant'))
    .slice(0, Math.max(1, limit))
}

const assertCoordinate = (coordinate: MapCoordinate) => {
  if (!coordinate.every(Number.isFinite)) throw new Error('路線座標格式不正確')
}

export function buildWalkingRouteUrl(start: MapCoordinate, destination: MapCoordinate) {
  assertCoordinate(start)
  assertCoordinate(destination)
  const points = [start, destination]
    .map(([longitude, latitude]) => `${longitude},${latitude}`)
    .join(';')
  return `${WALKING_ROUTE_ENDPOINT}/${points}?geometries=geojson&overview=full&steps=false`
}

export async function fetchWalkingRoute(
  start: MapCoordinate,
  destination: MapCoordinate,
  signal?: AbortSignal,
): Promise<WalkingRoute> {
  const waitMs = Math.max(0, 1000 - (Date.now() - lastWalkingRouteRequestAt))
  if (waitMs) {
    await new Promise<void>((resolve, reject) => {
      const handleAbort = () => {
        globalThis.clearTimeout(timeout)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      const timeout = globalThis.setTimeout(() => {
        signal?.removeEventListener('abort', handleAbort)
        resolve()
      }, waitMs)
      signal?.addEventListener('abort', handleAbort, { once: true })
    })
  }
  lastWalkingRouteRequestAt = Date.now()
  const response = await fetch(buildWalkingRouteUrl(start, destination), {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) throw new Error(`路線服務暫時無法使用（${response.status}）`)

  const payload = (await response.json()) as RouteResponse
  const route = payload.routes?.[0]
  if (
    payload.code !== 'Ok' ||
    !route?.geometry ||
    route.geometry.type !== 'LineString' ||
    !Array.isArray(route.geometry.coordinates)
  ) {
    throw new Error('找不到可步行的校園路線')
  }

  return {
    geometry: route.geometry,
    distanceMeters: Math.max(0, Math.round(Number(route.distance) || 0)),
    durationSeconds: Math.max(0, Math.round(Number(route.duration) || 0)),
  }
}

export const formatDistance = (distanceMeters: number) =>
  distanceMeters >= 1000
    ? `${(distanceMeters / 1000).toFixed(distanceMeters >= 10_000 ? 0 : 1)} 公里`
    : `${Math.max(0, Math.round(distanceMeters))} 公尺`

export const formatWalkingTime = (durationSeconds: number) => {
  const minutes = Math.max(1, Math.round(durationSeconds / 60))
  return `步行約 ${minutes} 分鐘`
}

export const buildingFeatureCollection = (): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: campusBuildings.map((building) => ({
    type: 'Feature',
    id: building.id,
    geometry: { type: 'Point', coordinates: building.coordinate },
    properties: {
      id: building.id,
      code: building.code,
      name: building.nameZh || building.name,
      number: building.number,
    },
  })),
})
