import { useCallback, useEffect, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { activeBulletins, BULLETIN_REFRESH_MS, fetchCampusBulletins, readBulletinCache, writeBulletinCache } from './campusBulletinData'

export function useCampusBulletins(enabled = true) {
  const [items, setItems] = useState(() => readBulletinCache(localStorage))
  const [status, setStatus] = useState<'loading' | 'live' | 'cached' | 'unavailable'>(() => items.length ? 'cached' : 'loading')
  const [active, setActive] = useState(() => !document.hidden)
  const [refreshing, setRefreshing] = useState(false)
  const activeRef = useRef(active), refreshRef = useRef<() => void>(() => {})
  useEffect(() => {
    if (!enabled) return
    activeRef.current = !document.hidden
    setActive(activeRef.current)
    let disposed = false, controller: AbortController | undefined
    const refresh = async () => {
      if (disposed || !activeRef.current || controller) return
      const request = new AbortController()
      controller = request
      setRefreshing(true)
      const timeout = window.setTimeout(() => request.abort(), 12000)
      try {
        const latest = await fetchCampusBulletins(request.signal)
        if (disposed || controller !== request) return
        setItems(latest); setStatus('live'); writeBulletinCache(localStorage, latest)
      } catch {
        if (!disposed && controller === request) {
          const cached = readBulletinCache(localStorage)
          setItems(cached)
          setStatus(cached.length ? 'cached' : 'unavailable')
        }
      } finally { window.clearTimeout(timeout); if (controller === request) { controller = undefined; if (!disposed) setRefreshing(false) } }
    }
    refreshRef.current = () => { void refresh() }
    const changeActive = (visible: boolean) => {
      activeRef.current = visible; setActive(visible)
      if (visible) { setItems((current) => activeBulletins(current)); void refresh() }
      else { controller?.abort(); controller = undefined; setRefreshing(false) }
    }
    const visibility = () => changeActive(!document.hidden)
    const online = () => { void refresh() }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('online', online)
    const nativeListener = Capacitor.isNativePlatform() ? CapApp.addListener('appStateChange', ({ isActive }) => changeActive(isActive)) : null
    const interval = window.setInterval(() => { void refresh() }, BULLETIN_REFRESH_MS)
    const expiry = window.setInterval(() => setItems((current) => {
      const remaining = activeBulletins(current)
      return remaining.length === current.length ? current : remaining
    }), 30000)
    void refresh()
    return () => {
      disposed = true; controller?.abort(); refreshRef.current = () => {}
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('online', online)
      window.clearInterval(interval); window.clearInterval(expiry)
      if (nativeListener) void nativeListener.then((listener) => listener.remove())
    }
  }, [enabled])
  const refresh = useCallback(() => refreshRef.current(), [])
  return { items, status, active, refresh, refreshing }
}
export type CampusBulletinFeed = ReturnType<typeof useCampusBulletins>
