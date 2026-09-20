import type { LayerSpecification, Map } from 'maplibre-gl'

// Keep water, railways and building geometry intact; brighten only street/path layers.
export function campusRoadColor(layer: LayerSpecification): string | null {
  if (layer.type !== 'line' || layer['source-layer'] !== 'transportation') return null
  if (!/^(highway_|road_pier)/.test(layer.id)) return null
  if (/casing/.test(layer.id)) return '#344b5c'
  if (/path|pier/.test(layer.id)) return '#e6c98d'
  return '#849baa'
}

export function applyCampusRoadStyle(map: Map) {
  for (const layer of map.getStyle().layers) {
    const color = campusRoadColor(layer)
    if (!color) continue
    map.setPaintProperty(layer.id, 'line-color', color)
    map.setPaintProperty(layer.id, 'line-opacity', 1)
  }
}
