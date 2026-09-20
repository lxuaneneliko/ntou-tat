// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake = vi.hoisted(() => ({
  worker: vi.fn(),
  features: [] as { source: string }[],
  events: {} as Record<string, () => void>,
  setData: vi.fn(),
  resize: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: '/assets/map-worker.js' }))
vi.mock('maplibre-gl', () => ({
  setWorkerUrl: fake.worker,
  Map: class {
    once(event: string, callback: () => void) { fake.events[event] = callback }
    on(event: string, layerOrCallback: string | (() => void)) {
      if (typeof layerOrCallback === 'function') fake.events[event] = layerOrCallback
    }
    isStyleLoaded() { return true }
    getStyle() { return { layers: [] } }
    getSource() { return { setData: fake.setData } }
    getLayer() { return true }
    addSource() {}
    addLayer() {}
    queryRenderedFeatures() { return fake.features }
    resize = fake.resize
    remove = fake.remove
    getZoom() { return 16 }
    easeTo() {}
    jumpTo() {}
  },
  LngLatBounds: class {},
}))

import { NtouMapTabScreen } from './NtouMapTabScreen'

let root: Root
let host: HTMLDivElement
const click = async (selector: string) => act(async () => host.querySelector<HTMLButtonElement>(selector)!.click())
const fill = async (selector: string, value: string) => act(async () => {
  const input = host.querySelector<HTMLInputElement>(selector)!
  input.focus()
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
})

describe('mobile interactive campus map', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    fake.features = []
    fake.events = {}
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    await act(async () => root.render(<NtouMapTabScreen onOpenStaticMap={() => {}} />))
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('configures the bundled worker and never substitutes a static image', () => {
    expect(fake.worker).toHaveBeenCalledWith('/assets/map-worker.js')
    expect(host.querySelector('.ntou-map-canvas')).not.toBeNull()
    expect(host.querySelector('img')).toBeNull()
  })

  it('waits for actual rendered vector tiles, not merely a loaded style', async () => {
    await act(async () => fake.events['style.load']())
    expect(host.textContent).toContain('正在準備校園地圖')
    fake.features = [{ source: 'tat-campus-places' }]
    await act(async () => fake.events.render())
    expect(host.textContent).toContain('正在準備校園地圖')
    fake.features = [{ source: 'openmaptiles' }]
    await act(async () => fake.events.render())
    expect(host.textContent).not.toContain('正在準備校園地圖')
  })

  it('reports a worker/tile stall and retries with a new map', async () => {
    await act(async () => fake.events['style.load']())
    await act(async () => vi.advanceTimersByTime(20_000))
    expect(host.textContent).toContain('地圖底圖暫時無法載入')
    const retry = [...host.querySelectorAll('button')].find(button => button.textContent === '重新載入')!
    await act(async () => retry.click())
    expect(fake.remove).toHaveBeenCalled()
    expect(host.textContent).toContain('正在準備校園地圖')
  })

  it('allows both colored endpoint fields to search and select buildings directly', async () => {
    expect(host.querySelectorAll('input')).toHaveLength(2)
    await fill('input[aria-label="起點"]', 'BOH')
    await click('[role="option"]')
    expect(host.querySelector<HTMLInputElement>('input[aria-label="起點"]')!.value).toBe('人文大樓')
    await fill('input[aria-label="終點"]', 'MEB')
    await click('[role="option"]')
    expect(host.querySelector<HTMLInputElement>('input[aria-label="終點"]')!.value).toBe('機械B館、圖資處')
    expect(host.querySelector<HTMLButtonElement>('.ntou-map-route-submit')!.disabled).toBe(false)
    await fill('input[aria-label="終點"]', '未選定地點')
    expect(host.querySelector<HTMLButtonElement>('.ntou-map-route-submit')!.disabled).toBe(true)
  })

  it('never carries professor suggestions into the other input or reopens a selected result', async () => {
    await fill('input[aria-label="起點"]', '馬尚彬')
    expect(host.querySelector('[role="listbox"]')?.textContent).toContain('馬尚彬')
    await act(async () => host.querySelector<HTMLInputElement>('input[aria-label="終點"]')!.focus())
    expect(host.querySelector('[role="listbox"]')).toBeNull()
    expect(host.querySelector<HTMLInputElement>('input[aria-label="起點"]')!.value).toBe('馬尚彬')
    await fill('input[aria-label="終點"]', 'MEB')
    expect(host.querySelector('[role="listbox"]')?.textContent).not.toContain('馬尚彬')
    await click('[role="option"]')
    await act(async () => host.querySelector<HTMLInputElement>('input[aria-label="終點"]')!.focus())
    expect(host.querySelector('[role="listbox"]')).toBeNull()
  })

  it('does not request location until the user chooses it', async () => {
    expect(host.querySelector('[role="dialog"]')).toBeNull()
    await click('[aria-label="定位我的位置"]')
    expect(host.querySelector('[role="dialog"]')?.textContent).toContain('允許海大地圖使用目前位置？')
  })
})
