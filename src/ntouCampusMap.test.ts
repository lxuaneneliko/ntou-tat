import { describe, expect, it } from 'vitest'
import {
  buildWalkingRouteUrl,
  campusBuildings,
  campusProfessors,
  formatDistance,
  formatWalkingTime,
  searchCampus,
} from './ntouCampusMap'

describe('NTOU campus map data', () => {
  it('normalizes the bundled building and professor snapshots', () => {
    expect(campusBuildings).toHaveLength(74)
    expect(campusProfessors).toHaveLength(119)

    const generalAffairs = campusBuildings.find((building) => building.number === '74')
    expect(generalAffairs?.code).toBe('GAO')
    expect(generalAffairs?.nameZh).toContain('總務處')
    expect(campusBuildings.some((building) => building.number === '75')).toBe(false)
  })

  it('understands classroom codes as a building plus room', () => {
    const [result] = searchCampus('BOH412')

    expect(result.kind).toBe('building')
    expect(result.building?.code).toBe('BOH')
    expect(result.room).toBe('412')
  })

  it('understands legacy classroom prefixes used by professor offices', () => {
    const [engineeringResult] = searchCampus('FE101')
    const [scienceResult] = searchCampus('FS305')

    expect(engineeringResult.building?.code).toBe('MFE')
    expect(engineeringResult.room).toBe('101')
    expect(scienceResult.building?.code).toBe('MFS')
    expect(scienceResult.room).toBe('305')
  })

  it('finds professors and resolves their office building', () => {
    const [result] = searchCampus('馬尚彬')

    expect(result.kind).toBe('professor')
    expect(result.professor?.office).toBe('ECG 804')
    expect(result.building?.code).toBe('ECG')
  })
})

describe('NTOU walking routes', () => {
  it('builds the public foot-routing URL from longitude-latitude pairs', () => {
    expect(buildWalkingRouteUrl([121.77622, 25.15019], [121.77583, 25.14976])).toBe(
      'https://routing.openstreetmap.de/routed-foot/route/v1/driving/121.77622,25.15019;121.77583,25.14976?geometries=geojson&overview=full&steps=false',
    )
  })

  it('formats compact walking summaries', () => {
    expect(formatDistance(420)).toBe('420 公尺')
    expect(formatDistance(1420)).toBe('1.4 公里')
    expect(formatWalkingTime(370)).toBe('步行約 6 分鐘')
  })
})
