import { expect, it } from 'vitest'
import { campusRoadColor } from './ntouMapStyle'
it('brightens roads without changing water or railways', () => {
  const line = { type: 'line' as const, source: 'openmaptiles', 'source-layer': 'transportation' }
  expect(campusRoadColor({ ...line, id: 'highway_minor' })).toBe('#849baa')
  expect(campusRoadColor({ ...line, id: 'highway_path' })).toBe('#e6c98d')
  expect(campusRoadColor({ ...line, id: 'railway' })).toBeNull()
  expect(campusRoadColor({ ...line, id: 'waterway', 'source-layer': 'waterway' })).toBeNull()
})
