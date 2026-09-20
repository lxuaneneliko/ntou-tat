import { Capacitor } from '@capacitor/core'
import { Geolocation } from '@capacitor/geolocation'
import type { FeatureCollection, LineString, Point } from 'geojson'
import {
  ArrowRightLeft,
  Building2,
  Crosshair,
  Footprints,
  Info,
  LocateFixed,
  LoaderCircle,
  MapPinned,
  Navigation,
  Search,
  UserRound,
  X,
} from 'lucide-react'
import {
  LngLatBounds,
  Map as MapLibreMap,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
  NTOU_CAMPUS_CENTER,
  NTOU_MAP_DATA_RETRIEVED_AT,
  NTOU_MAP_STYLE_URL,
  buildingFeatureCollection,
  campusBuildings,
  fetchWalkingRoute,
  formatDistance,
  formatWalkingTime,
  searchCampus,
  type CampusBuilding,
  type CampusSearchResult,
  type MapCoordinate,
  type WalkingRoute,
} from './ntouCampusMap'
import './NtouMapTabScreen.css'
import { applyCampusRoadStyle } from './ntouMapStyle'

// v6 cannot discover its worker after Vite bundles the app. The worker pipeline
// also bundles its shared-module dependency, including in the offline APK assets.
setWorkerUrl(mapWorkerUrl)

type SearchTarget = 'start' | 'destination'

type RouteEndpoint =
  | { kind: 'location' }
  | { kind: 'building'; building: CampusBuilding; label?: string }

type ActiveRoute = {
  route: WalkingRoute
  start: MapCoordinate
  destination: MapCoordinate
  startLabel: string
  destinationLabel: string
}

type LocationIntent = 'center' | 'route'

export type NtouMapTabScreenHandle = {
  goBack: () => boolean
}

const emptyPointCollection = (): FeatureCollection<Point> => ({
  type: 'FeatureCollection',
  features: [],
})

const emptyLineCollection = (): FeatureCollection<LineString> => ({
  type: 'FeatureCollection',
  features: [],
})

const buildingResult = (building: CampusBuilding): CampusSearchResult => ({
  id: building.id,
  kind: 'building',
  title: building.nameZh || building.name,
  subtitle: [building.code, building.grid].filter(Boolean).join(' · '),
  building,
  professor: null,
  room: '',
  score: 100,
})

const endpointLabel = (endpoint: RouteEndpoint | null) => {
  if (!endpoint) return '選擇地點'
  if (endpoint.kind === 'location') return '我的位置'
  return endpoint.label || endpoint.building.nameZh || endpoint.building.name
}

const endpointCoordinate = (
  endpoint: RouteEndpoint,
  userPosition: MapCoordinate | null,
): MapCoordinate | null => {
  if (endpoint.kind === 'building') return endpoint.building.coordinate
  return userPosition
}

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const NtouMapTabScreen = forwardRef<NtouMapTabScreenHandle, { onOpenStaticMap: () => void }>(
  function NtouMapTabScreen({ onOpenStaticMap }, ref) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const topPanelRef = useRef<HTMLDivElement>(null)
  const bottomCardRef = useRef<HTMLElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const startInputRef = useRef<HTMLInputElement>(null)
  const destinationInputRef = useRef<HTMLInputElement>(null)
  const routeAbortRef = useRef<AbortController | null>(null)
  const locationConsentRef = useRef(false)

  const [mapRevision, setMapRevision] = useState(0)
  const [mapReady, setMapReady] = useState(false)
  const [mapError, setMapError] = useState('')
  const [baseMapReady, setBaseMapReady] = useState(false)
  const [editingEndpoint, setEditingEndpoint] = useState<SearchTarget | null>(null)
  const [activeResultIndex, setActiveResultIndex] = useState(0)
  const [selectedResult, setSelectedResult] = useState<CampusSearchResult | null>(null)
  const [routeStart, setRouteStart] = useState<RouteEndpoint>({ kind: 'location' })
  const [routeDestination, setRouteDestination] = useState<RouteEndpoint | null>(null)
  const [routeStartText, setRouteStartText] = useState('我的位置')
  const [routeDestinationText, setRouteDestinationText] = useState('')
  const [activeRoute, setActiveRoute] = useState<ActiveRoute | null>(null)
  const [routeBusy, setRouteBusy] = useState(false)
  const [routeError, setRouteError] = useState('')
  const [userPosition, setUserPosition] = useState<MapCoordinate | null>(null)
  const [locationBusy, setLocationBusy] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [locationIntent, setLocationIntent] = useState<LocationIntent | null>(null)

  // Each field owns its text. Switching focus cannot reuse the other field's results.
  const query = editingEndpoint === 'start' ? routeStartText
    : editingEndpoint === 'destination' ? routeDestinationText : ''
  const editingSelection = editingEndpoint === 'start' ? routeStart : routeDestination
  const results = useMemo(
    () => searchCampus(query, 'all', 12),
    [query],
  )
  const resultsVisible = Boolean(editingEndpoint && query.trim()
    && (!editingSelection || query !== endpointLabel(editingSelection)))

  useEffect(() => setActiveResultIndex(0), [query, editingEndpoint])

  useEffect(() => {
    routeAbortRef.current?.abort()
    setActiveRoute(null)
    setRouteBusy(false)
    setRouteError('')
  }, [routeStartText, routeDestinationText])

  useEffect(() => {
    const container = mapContainerRef.current
    if (!container) return

    setMapReady(false)
    setMapError('')
    setBaseMapReady(false)

    let styleFailureDetail = ''
    let mapDataSeen = false
    let map: MapLibreMap
    try {
      map = new MapLibreMap({
        container,
        style: NTOU_MAP_STYLE_URL,
        center: NTOU_CAMPUS_CENTER,
        zoom: 16.55,
        minZoom: 12,
        maxZoom: 20,
        pitch: 42,
        bearing: 18,
        attributionControl: false,
      })
    } catch {
      setMapError('無法啟用互動地圖，請更新手機系統與瀏覽器後重新開啟 App 再試')
      return
    }
    mapRef.current = map
    const styleTimeout = globalThis.setTimeout(() => {
      if (!mapDataSeen) {
        setMapError(styleFailureDetail || '地圖底圖連線逾時，請檢查網路後重試')
      }
    }, 20_000)

    const markMapDataSeen = () => {
      if (mapDataSeen) return
      // A style document loading is not proof that its worker decoded any tiles.
      // Failed sources can also report "loaded"; require real rendered basemap features.
      if (!map.isStyleLoaded() || !map.queryRenderedFeatures().some((feature) => feature.source === 'openmaptiles')) return
      mapDataSeen = true
      globalThis.clearTimeout(styleTimeout)
      setBaseMapReady(true)
      setMapError('')
    }

    const setCanvasPointer = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const clearCanvasPointer = () => {
      map.getCanvas().style.cursor = ''
    }

    map.once('style.load', () => {
      // On Android the WebView can finish laying out the tab after MapLibre's
      // first frame. Resize before adding the overlays so the map is not left
      // with an old or zero-sized canvas.
      map.resize()
      applyCampusRoadStyle(map)
      const firstLabelLayer = map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id

      if (map.getSource('openmaptiles') && !map.getLayer('tat-3d-buildings')) {
        map.addLayer(
          {
            id: 'tat-3d-buildings',
            source: 'openmaptiles',
            'source-layer': 'building',
            type: 'fill-extrusion',
            minzoom: 15,
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['coalesce', ['get', 'render_height'], 5],
                0,
                '#1b2e39',
                40,
                '#315468',
              ],
              'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 5],
              'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
              'fill-extrusion-opacity': 0.78,
            },
          },
          firstLabelLayer,
        )
      }

      map.addSource('tat-campus-places', {
        type: 'geojson',
        data: buildingFeatureCollection(),
      })
      map.addLayer({
        id: 'tat-campus-place-halo',
        type: 'circle',
        source: 'tat-campus-places',
        minzoom: 15.3,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 15.3, 3, 18, 7],
          'circle-color': '#07131b',
          'circle-opacity': 0.78,
          'circle-stroke-color': '#66c6ff',
          'circle-stroke-width': 1.5,
        },
      })
      map.addLayer({
        id: 'tat-campus-place-label',
        type: 'symbol',
        source: 'tat-campus-places',
        minzoom: 16.25,
        layout: {
          'text-field': ['coalesce', ['get', 'code'], ['get', 'number']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 16.25, 9, 18, 12],
          'text-offset': [0, 1.15],
          'text-anchor': 'top',
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#d9effc',
          'text-halo-color': '#0a1720',
          'text-halo-width': 1.5,
        },
      })

      map.addSource('tat-selected-place', { type: 'geojson', data: emptyPointCollection() })
      map.addLayer({
        id: 'tat-selected-place-ring',
        type: 'circle',
        source: 'tat-selected-place',
        paint: {
          'circle-radius': 13,
          'circle-color': '#66c6ff',
          'circle-opacity': 0.2,
          'circle-stroke-color': '#9bdcff',
          'circle-stroke-width': 3,
        },
      })

      map.addSource('tat-user-position', { type: 'geojson', data: emptyPointCollection() })
      map.addLayer({
        id: 'tat-user-position-halo',
        type: 'circle',
        source: 'tat-user-position',
        paint: {
          'circle-radius': 13,
          'circle-color': '#51d6ae',
          'circle-opacity': 0.22,
        },
      })
      map.addLayer({
        id: 'tat-user-position-dot',
        type: 'circle',
        source: 'tat-user-position',
        paint: {
          'circle-radius': 6,
          'circle-color': '#51d6ae',
          'circle-stroke-color': '#ecfff9',
          'circle-stroke-width': 2,
        },
      })

      map.addSource('tat-walking-route', { type: 'geojson', data: emptyLineCollection() })
      map.addLayer({
        id: 'tat-walking-route-shadow',
        type: 'line',
        source: 'tat-walking-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#062e48', 'line-width': 11, 'line-opacity': 1 },
      })
      map.addLayer({
        id: 'tat-walking-route-line',
        type: 'line',
        source: 'tat-walking-route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#32ddff', 'line-width': 6, 'line-opacity': 1 },
      })

      map.addSource('tat-route-endpoints', { type: 'geojson', data: emptyPointCollection() })
      map.addLayer({
        id: 'tat-route-endpoint-dots',
        type: 'circle',
        source: 'tat-route-endpoints',
        paint: {
          'circle-radius': 10,
          'circle-color': [
            'match',
            ['get', 'kind'],
            'start',
            '#51d6ae',
            '#f2b84b',
          ],
          'circle-stroke-color': '#07131b',
          'circle-stroke-width': 3,
        },
      })
      map.addLayer({
        id: 'tat-route-endpoint-labels',
        type: 'symbol',
        source: 'tat-route-endpoints',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': '#07131b' },
      })

      map.on('mouseenter', 'tat-campus-place-halo', setCanvasPointer)
      map.on('mouseleave', 'tat-campus-place-halo', clearCanvasPointer)
      map.on('click', 'tat-campus-place-halo', (event) => {
        const id = String(event.features?.[0]?.properties?.id ?? '')
        const building = campusBuildings.find((candidate) => candidate.id === id)
        if (!building) return
        setSelectedResult(buildingResult(building))
        setEditingEndpoint(null)
      })
      setMapReady(true)
      markMapDataSeen()
    })

    map.on('sourcedata', (event) => {
      if (event.sourceId === 'openmaptiles' && event.isSourceLoaded) markMapDataSeen()
    })
    map.on('render', markMapDataSeen)

    map.on('error', (event) => {
      if (!mapDataSeen) styleFailureDetail = '地圖圖資載入失敗，請確認網路後重新載入'
      console.warn('Campus map resource failed', event.error)
    })
    map.on('webglcontextlost', () => setMapError('地圖繪圖暫時中斷，請重新載入'))

    return () => {
      globalThis.clearTimeout(styleTimeout)
      routeAbortRef.current?.abort()
      mapRef.current = null
      map.remove()
    }
  }, [mapRevision])

  const viewportPadding = useCallback(() => {
    const container = mapContainerRef.current
    if (!container) return { top: 100, bottom: 100, left: 24, right: 24 }
    const height = container.clientHeight
    const top = (topPanelRef.current?.offsetHeight ?? 90) + 26
    const bottom = (bottomCardRef.current?.offsetHeight ?? 0) + 58
    // Keep a usable viewport even while the Android keyboard reduces its height.
    const scale = Math.min(1, Math.max(0, height - 48) / (top + bottom))
    return { top: Math.round(top * scale), bottom: Math.round(bottom * scale), left: 30, right: 30 }
  }, [])

  const fitActiveRoute = useCallback((duration = 0) => {
    const map = mapRef.current
    if (!map || !activeRoute) return
    const bounds = new LngLatBounds(activeRoute.start, activeRoute.start)
    activeRoute.route.geometry.coordinates.forEach((coordinate) => bounds.extend(coordinate as MapCoordinate))
    bounds.extend(activeRoute.destination)
    map.fitBounds(bounds, {
      padding: viewportPadding(),
      pitch: 0,
      bearing: 0,
      maxZoom: 18.2,
      duration,
    })
  }, [activeRoute, viewportPadding])

  useEffect(() => {
    const map = mapRef.current
    const container = mapContainerRef.current
    if (!mapReady || !map || !container) return

    let frame = 0
    const resizeMap = () => {
      globalThis.cancelAnimationFrame(frame)
      frame = globalThis.requestAnimationFrame(() => {
        map.resize()
        // Reframe after the mobile keyboard closes or the device rotates.
        fitActiveRoute()
      })
    }
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resizeMap) : null
    observer?.observe(container)
    window.addEventListener('resize', resizeMap)
    window.visualViewport?.addEventListener('resize', resizeMap)
    window.visualViewport?.addEventListener('scroll', resizeMap)
    resizeMap()

    return () => {
      globalThis.cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', resizeMap)
      window.visualViewport?.removeEventListener('resize', resizeMap)
      window.visualViewport?.removeEventListener('scroll', resizeMap)
    }
  }, [mapReady, fitActiveRoute])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    const source = map.getSource('tat-selected-place') as GeoJSONSource | undefined
    const building = selectedResult?.building
    if (!source || !building) {
      source?.setData(emptyPointCollection())
      return
    }
    source.setData({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: building.coordinate },
      properties: {},
    })
    const padding = viewportPadding()
    map[prefersReducedMotion() ? 'jumpTo' : 'easeTo']({
      center: building.coordinate,
      zoom: Math.max(map.getZoom(), 17.25),
      pitch: 48,
      offset: [0, (padding.top - padding.bottom) / 2],
      duration: prefersReducedMotion() ? 0 : 650,
    })
  }, [mapReady, selectedResult, viewportPadding])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    const source = map.getSource('tat-user-position') as GeoJSONSource | undefined
    if (!source) return
    source.setData(
      userPosition
        ? {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: userPosition },
            properties: {},
          }
        : emptyPointCollection(),
    )
  }, [mapReady, userPosition])

  useEffect(() => {
    const map = mapRef.current
    if (!mapReady || !map) return
    const routeSource = map.getSource('tat-walking-route') as GeoJSONSource | undefined
    const endpointSource = map.getSource('tat-route-endpoints') as GeoJSONSource | undefined
    if (!routeSource || !endpointSource) return

    if (!activeRoute) {
      routeSource.setData(emptyLineCollection())
      endpointSource.setData(emptyPointCollection())
      return
    }

    routeSource.setData({
      type: 'Feature',
      geometry: activeRoute.route.geometry,
      properties: {},
    })
    endpointSource.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: activeRoute.start },
          properties: { kind: 'start', label: '起' },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: activeRoute.destination },
          properties: { kind: 'destination', label: '終' },
        },
      ],
    })

    fitActiveRoute(prefersReducedMotion() ? 0 : 760)
  }, [activeRoute, mapReady, fitActiveRoute])

  const chooseSearchTarget = useCallback((target: SearchTarget) => {
    setEditingEndpoint(target)
    ;(target === 'start' ? startInputRef : destinationInputRef).current?.focus()
  }, [])

  const beginEndpointEdit = useCallback((target: SearchTarget) => {
    setEditingEndpoint(target)
  }, [])

  const selectSearchResult = useCallback((result: CampusSearchResult) => {
    setSelectedResult(result)
    setEditingEndpoint(null)
    ;(document.activeElement as HTMLElement | null)?.blur()
    if (!result.building) {
      return
    }

    if (editingEndpoint === 'start') {
      setRouteStart({ kind: 'building', building: result.building, label: result.title })
      setRouteStartText(result.title)
      setActiveRoute(null)
      setRouteError('')
    } else if (editingEndpoint === 'destination') {
      setRouteDestination({ kind: 'building', building: result.building, label: result.title })
      setRouteDestinationText(result.title)
      setActiveRoute(null)
      setRouteError('')
    }
  }, [editingEndpoint])

  const calculateRoute = useCallback(async (positionOverride?: MapCoordinate) => {
    if (!routeDestination) {
      setRouteError('請先選擇終點')
      return
    }
    const currentPosition = positionOverride ?? userPosition
    const start = endpointCoordinate(routeStart, currentPosition)
    const destination = endpointCoordinate(routeDestination, currentPosition)
    if (!start || !destination) {
      setRouteError('需要目前位置才能計算這條路線')
      return
    }

    routeAbortRef.current?.abort()
    const controller = new AbortController()
    let timedOut = false
    const timeout = globalThis.setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 15_000)
    routeAbortRef.current = controller
    setRouteBusy(true)
    setRouteError('')
    try {
      const route = await fetchWalkingRoute(start, destination, controller.signal)
      if (controller.signal.aborted || routeAbortRef.current !== controller) return
      setActiveRoute({
        route,
        start,
        destination,
        startLabel: endpointLabel(routeStart),
        destinationLabel: endpointLabel(routeDestination),
      })
    } catch (error) {
      if (controller.signal.aborted && !timedOut) return
      if (timedOut) {
        setRouteError('路線服務逾時，請稍後再試')
        return
      }
      setRouteError(error instanceof Error ? error.message : '路線計算失敗')
    } finally {
      globalThis.clearTimeout(timeout)
      if (routeAbortRef.current === controller) {
        routeAbortRef.current = null
        setRouteBusy(false)
      }
    }
  }, [routeDestination, routeStart, userPosition])

  const getCurrentCoordinate = useCallback(async (): Promise<MapCoordinate> => {
    if (Capacitor.isNativePlatform()) {
      let permissions = await Geolocation.checkPermissions()
      if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
        permissions = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] })
      }
      if (permissions.location !== 'granted' && permissions.coarseLocation !== 'granted') {
        throw new Error('定位權限未開啟，請改選館樓作為起點')
      }
      const position = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 12_000,
      })
      return [position.coords.longitude, position.coords.latitude]
    }

    if (!navigator.geolocation) throw new Error('這台裝置不支援定位')
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve([position.coords.longitude, position.coords.latitude]),
        () => reject(new Error('無法取得目前位置，請確認瀏覽器定位權限')),
        { enableHighAccuracy: true, maximumAge: 30_000, timeout: 12_000 },
      )
    })
  }, [])

  const performLocation = useCallback(async (intent: LocationIntent) => {
    setLocationBusy(true)
    setLocationError('')
    try {
      const coordinate = await getCurrentCoordinate()
      setUserPosition(coordinate)
      if (intent === 'route') {
        await calculateRoute(coordinate)
      } else {
        const map = mapRef.current
        map?.[prefersReducedMotion() ? 'jumpTo' : 'easeTo']({
          center: coordinate,
          zoom: 18,
          pitch: 36,
          duration: prefersReducedMotion() ? 0 : 650,
        })
      }
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : '定位失敗')
    } finally {
      setLocationBusy(false)
    }
  }, [calculateRoute, getCurrentCoordinate])

  const requestLocation = useCallback((intent: LocationIntent) => {
    if (locationConsentRef.current) {
      void performLocation(intent)
      return
    }
    setLocationIntent(intent)
  }, [performLocation])

  const startRoute = useCallback(() => {
    const startIsValid = routeStartText === endpointLabel(routeStart)
    const destinationIsValid = Boolean(
      routeDestination && routeDestinationText === endpointLabel(routeDestination),
    )
    if (!startIsValid || !destinationIsValid) {
      setRouteError('請從搜尋結果選擇起點與終點')
      return
    }
    const usesLocation = routeStart.kind === 'location' || routeDestination?.kind === 'location'
    if (usesLocation && !userPosition) {
      requestLocation('route')
      return
    }
    ;(document.activeElement as HTMLElement | null)?.blur()
    void calculateRoute()
  }, [calculateRoute, requestLocation, routeDestination, routeDestinationText, routeStart, routeStartText, userPosition])

  const clearRoute = useCallback(() => {
    routeAbortRef.current?.abort()
    setActiveRoute(null)
    setRouteError('')
    setRouteBusy(false)
  }, [])

  useImperativeHandle(ref, () => ({
    goBack: () => {
      if (locationIntent) {
        setLocationIntent(null)
        return true
      }
      if (editingEndpoint) {
        setEditingEndpoint(null)
        ;(document.activeElement as HTMLElement | null)?.blur()
        return true
      }
      if (activeRoute) {
        clearRoute()
        return true
      }
      if (selectedResult) {
        setSelectedResult(null)
        return true
      }
      return false
    },
  }), [activeRoute, clearRoute, editingEndpoint, locationIntent, selectedResult])

  const setBuildingAsStart = (building: CampusBuilding) => {
    setRouteStart({ kind: 'building', building })
    setRouteStartText(endpointLabel({ kind: 'building', building }))
    setEditingEndpoint(null)
    setActiveRoute(null)
    setRouteError('')
  }

  const setBuildingAsDestination = (building: CampusBuilding) => {
    setRouteDestination({ kind: 'building', building })
    setRouteDestinationText(endpointLabel({ kind: 'building', building }))
    setEditingEndpoint(null)
    setActiveRoute(null)
    setRouteError('')
  }

  const swapRouteEndpoints = () => {
    if (!routeDestination) return
    setRouteStart(routeDestination)
    setRouteDestination(routeStart)
    setRouteStartText(endpointLabel(routeDestination))
    setRouteDestinationText(endpointLabel(routeStart))
    setEditingEndpoint(null)
    clearRoute()
  }

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!resultsVisible || !results.length) {
      if (event.key === 'Escape') setEditingEndpoint(null)
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveResultIndex((index) => (index + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveResultIndex((index) => (index - 1 + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      selectSearchResult(results[activeResultIndex] || results[0])
    } else if (event.key === 'Escape') {
      setEditingEndpoint(null)
    }
  }

  const startEndpointReady = routeStartText === endpointLabel(routeStart)
  const destinationEndpointReady = Boolean(
    routeDestination && routeDestinationText === endpointLabel(routeDestination),
  )

  const liveStatus = routeBusy
    ? '正在計算步行路線'
    : locationBusy
      ? '正在取得目前位置'
      : routeError || locationError || (activeRoute ? '步行路線已完成' : '')

  return (
    <section className="ntou-map-tab" aria-label="海大校園地圖">
      <div className="ntou-map-canvas-shell">
        <div ref={mapContainerRef} className="ntou-map-canvas" aria-label="互動式海大校園地圖" />
      </div>

      <div className="ntou-map-top-panel" ref={topPanelRef}>
          <div className="ntou-map-route-planner">
            <div className="ntou-map-route-fields">
              <label className={`ntou-map-route-field start ${editingEndpoint === 'start' ? 'editing' : ''}`}>
                <span className="ntou-map-endpoint-dot start">起</span>
                <span className="ntou-map-route-field-copy">
                  <small>起點</small>
                  <input
                    ref={startInputRef}
                    aria-label="起點"
                    value={routeStartText}
                    placeholder="輸入館樓、教室或教授"
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls="ntou-map-search-results"
                    aria-expanded={editingEndpoint === 'start' && resultsVisible}
                    onFocus={(event) => {
                      beginEndpointEdit('start')
                      event.currentTarget.select()
                    }}
                    onChange={(event) => {
                      setEditingEndpoint('start')
                      setRouteStartText(event.target.value)
                    }}
                    onKeyDown={handleSearchKeyDown}
                    onBlur={() => {
                      setEditingEndpoint((target) => target === 'start' ? null : target)
                    }}
                  />
                </span>
              </label>
              <label className={`ntou-map-route-field destination ${editingEndpoint === 'destination' ? 'editing' : ''}`}>
                <span className="ntou-map-endpoint-dot destination">終</span>
                <span className="ntou-map-route-field-copy">
                  <small>終點</small>
                  <input
                    ref={destinationInputRef}
                    aria-label="終點"
                    value={routeDestinationText}
                    placeholder="輸入館樓、教室或教授"
                    autoComplete="off"
                    role="combobox"
                    aria-autocomplete="list"
                    aria-controls="ntou-map-search-results"
                    aria-expanded={editingEndpoint === 'destination' && resultsVisible}
                    onFocus={(event) => {
                      beginEndpointEdit('destination')
                      event.currentTarget.select()
                    }}
                    onChange={(event) => {
                      setEditingEndpoint('destination')
                      setRouteDestinationText(event.target.value)
                    }}
                    onKeyDown={handleSearchKeyDown}
                    onBlur={() => {
                      setEditingEndpoint((target) => target === 'destination' ? null : target)
                    }}
                  />
                </span>
              </label>
            </div>
            <div className="ntou-map-endpoint-actions">
            <button
              className="ntou-map-swap-route"
              type="button"
              aria-label="交換起點與終點"
              disabled={!routeDestination}
              onClick={swapRouteEndpoints}
            >
              <ArrowRightLeft size={18} />
            </button>
            <button type="button" className="ntou-map-swap-route" aria-label="以我的位置為起點"
              onClick={() => {
                setRouteStart({ kind: 'location' })
                setRouteStartText('我的位置')
                setEditingEndpoint(null)
              }}><LocateFixed size={18} /></button>
            </div>
            <button
              className="ntou-map-route-submit"
              type="button"
              disabled={!routeDestination || !startEndpointReady || !destinationEndpointReady || routeBusy}
              onClick={startRoute}
            >
              {routeBusy ? <LoaderCircle className="spin" size={18} /> : <Navigation size={18} />}
              {routeBusy ? '計算中' : '規劃路線'}
            </button>
          </div>
      {resultsVisible ? (
        <div id="ntou-map-search-results" className="ntou-map-results" role="listbox">
          <div className="ntou-map-results-heading">
            <span>{results.length ? `${results.length} 筆符合結果` : '沒有符合結果'}</span>
            <small>正在選擇{editingEndpoint === 'start' ? '起點' : '終點'}</small>
          </div>
          {results.length ? results.map((result, index) => (
            <button
              id={`ntou-map-result-${result.id}`}
              key={result.id}
              type="button"
              role="option"
              aria-selected={index === activeResultIndex}
              className={index === activeResultIndex ? 'active' : ''}
              onMouseEnter={() => setActiveResultIndex(index)}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => selectSearchResult(result)}
            >
              <span className="ntou-map-result-icon">
                {result.kind === 'professor' ? <UserRound size={20} /> : <Building2 size={20} />}
              </span>
              <span>
                <strong>{result.title}</strong>
                <small>{result.subtitle}</small>
              </span>
              <span className="ntou-map-result-kind">
                {result.kind === 'professor' ? '教授' : result.room ? '教室' : '館樓'}
              </span>
            </button>
          )) : (
            <div className="ntou-map-empty-result">
              <Search size={25} />
              <strong>找不到相符地點</strong>
              <span>試試館樓簡稱、教室代碼或完整教授姓名。</span>
            </div>
          )}
        </div>
      ) : null}
      </div>

      <div className="ntou-map-controls" aria-label="地圖控制">
        <button
          type="button"
          aria-label="定位我的位置"
          disabled={locationBusy}
          onClick={() => requestLocation('center')}
        >
          {locationBusy ? <LoaderCircle className="spin" size={21} /> : <LocateFixed size={21} />}
        </button>
        <button
          type="button"
          aria-label="回到海大校園全圖"
          onClick={() => {
            mapRef.current?.[prefersReducedMotion() ? 'jumpTo' : 'easeTo']({
              center: NTOU_CAMPUS_CENTER,
              zoom: 16.55,
              pitch: 42,
              bearing: 18,
              padding: { top: 0, right: 0, bottom: 0, left: 0 },
              duration: prefersReducedMotion() ? 0 : 600,
            })
          }}
        >
          <Crosshair size={21} />
        </button>
      </div>

      {!baseMapReady && !mapError ? (
        <div className="ntou-map-loading" role="status">
          <LoaderCircle className="spin" size={28} />
          <span>正在準備校園地圖</span>
        </div>
      ) : null}

      {mapError ? (
        <div className="ntou-map-error" role="alert">
          <MapPinned size={28} />
          <strong>地圖底圖暫時無法載入</strong>
          <span>{mapError}</span>
          <button type="button" onClick={() => setMapRevision((revision) => revision + 1)}>重新載入</button>
        </div>
      ) : null}

      {!resultsVisible && activeRoute ? (
        <article ref={bottomCardRef} className="ntou-map-bottom-card ntou-map-route-summary">
          <div className="ntou-map-card-handle" aria-hidden="true" />
          <div className="ntou-map-route-summary-heading">
            <span className="ntou-map-summary-icon"><Footprints size={22} /></span>
            <div>
              <strong title={`${activeRoute.startLabel} → ${activeRoute.destinationLabel}`}>
                {activeRoute.startLabel} → {activeRoute.destinationLabel}
              </strong>
              <span>{formatWalkingTime(activeRoute.route.durationSeconds)} · {formatDistance(activeRoute.route.distanceMeters)}</span>
            </div>
            <button type="button" onClick={clearRoute}>結束路線</button>
          </div>
          <p>
            此為約略步行路線；路線由 FOSSGIS 的 OpenStreetMap 服務計算，請以現場道路及校方公告為準。
            <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noreferrer">回報地圖問題</a>
          </p>
        </article>
      ) : !resultsVisible && selectedResult ? (
        <article ref={bottomCardRef} className="ntou-map-bottom-card ntou-map-place-card">
          <div className="ntou-map-card-handle" aria-hidden="true" />
          <button
            className="ntou-map-card-close"
            type="button"
            aria-label="關閉地點資訊"
            onClick={() => setSelectedResult(null)}
          >
            <X size={19} />
          </button>
          <span className="ntou-map-place-type">
            {selectedResult.kind === 'professor' ? '教授辦公室' : selectedResult.room ? '上課教室' : '校園館樓'}
          </span>
          <h2>{selectedResult.title}</h2>
          {selectedResult.professor?.nameEn ? <p>{selectedResult.professor.nameEn}</p> : null}
          <div className="ntou-map-place-meta">
            {selectedResult.building?.code ? <span>館樓代碼 <strong>{selectedResult.building.code}</strong></span> : null}
            {selectedResult.room ? <span>室號 <strong>{selectedResult.room}</strong></span> : null}
            {selectedResult.building?.grid ? <span>平面圖 <strong>{selectedResult.building.grid}</strong></span> : null}
          </div>
          {selectedResult.professor ? (
            <div className="ntou-map-professor-note">
              <Info size={17} />
              <span>辦公室：{selectedResult.professor.office}。步行路線只導航到館樓附近，入館後請依現場指示。</span>
            </div>
          ) : null}
          {selectedResult.building ? (
            <div className="ntou-map-place-actions">
              <button type="button" onClick={() => setBuildingAsDestination(selectedResult.building!)}>
                <Navigation size={18} />
                到這裡
              </button>
              <button type="button" onClick={() => setBuildingAsStart(selectedResult.building!)}>
                <MapPinned size={18} />
                設為起點
              </button>
            </div>
          ) : (
            <p className="ntou-map-unresolved-office">這筆辦公室代碼尚未對應到可驗證的館樓座標。</p>
          )}
        </article>
      ) : null}

      <div className="ntou-map-credit">
        <button type="button" onClick={onOpenStaticMap}>官方平面圖</button>
        <span>資料 <a href="https://ntoumap.com/" target="_blank" rel="noreferrer">ntoumap.com</a> · {NTOU_MAP_DATA_RETRIEVED_AT}</span>
        <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a>
        <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a>
        <span>©</span>
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OSM</a>
      </div>

      {(routeError || locationError) && !resultsVisible ? (
        <div className="ntou-map-toast" role="alert">
          <Info size={17} />
          <span>{routeError || locationError}</span>
          <button type="button" aria-label="關閉提示" onClick={() => { setRouteError(''); setLocationError('') }}>
            <X size={16} />
          </button>
        </div>
      ) : null}

      {locationIntent ? (
        <div className="ntou-map-permission-backdrop" role="presentation">
          <section className="ntou-map-permission-dialog" role="dialog" aria-modal="true" aria-labelledby="ntou-map-location-title">
            <span className="ntou-map-permission-icon"><LocateFixed size={25} /></span>
            <h2 id="ntou-map-location-title">允許海大地圖使用目前位置？</h2>
            <p>只在你主動定位或規劃路線時取得一次位置，不會在背景定位，也不會保存位置歷程。</p>
            {locationIntent === 'route' ? (
              <p className="ntou-map-route-privacy">規劃路線時，起終點座標會送至 FOSSGIS 路線服務計算並依該服務政策留下連線紀錄。</p>
            ) : null}
            <div>
              <button
                type="button"
                onClick={() => {
                  const intent = locationIntent
                  setLocationIntent(null)
                  if (intent === 'route') chooseSearchTarget('start')
                }}
              >
                {locationIntent === 'route' ? '改選館樓' : '取消'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const intent = locationIntent
                  locationConsentRef.current = true
                  setLocationIntent(null)
                  void performLocation(intent)
                }}
              >
                繼續
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <span className="sr-only" aria-live="polite">{liveStatus}</span>
    </section>
  )
})
