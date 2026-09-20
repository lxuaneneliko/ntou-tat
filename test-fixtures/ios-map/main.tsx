// Test-only entry: actual component, vector tiles, worker, routing and native bridge.
// No AIS account and no mocked map. Never included in the device archive.
import { createRoot } from 'react-dom/client'
import { Map } from 'maplibre-gl'
import { NtouMapTabScreen } from '../../src/NtouMapTabScreen'
import '../../src/index.css'
import '../../src/App.css'

let lastReport = 0
const originalFire = Map.prototype.fire
Map.prototype.fire = function (...args) {
  const result = originalFire.apply(this, args)
  if (Date.now() - lastReport > 300 && this.isStyleLoaded()) {
    lastReport = Date.now()
    const features = this.queryRenderedFeatures()
    const report = document.querySelector<HTMLElement>('#map-evidence')
    if (report) {
      report.dataset.tiles = String(features.filter(f => f.source === 'openmaptiles').length)
      report.dataset.routes = String(features.filter(f => f.source === 'tat-walking-route').length)
      report.textContent = `向量圖資 ${report.dataset.tiles} · 路線 ${report.dataset.routes}`
    }
  }
  return result
}
createRoot(document.getElementById('root')!).render(
  <div className="app-shell">
    <header className="app-header"><h1>海大地圖 · iOS 測試</h1></header>
    <main className="main-content"><div className="view-transition">
      <NtouMapTabScreen onOpenStaticMap={() => {}} />
    </div></main>
    <footer id="map-evidence" style={{ height: 68, padding: 12, fontSize: 12 }}>等待實際圖資</footer>
  </div>,
)
