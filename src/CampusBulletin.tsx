import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Megaphone, RefreshCw } from 'lucide-react'
import { activeBulletins, shuffleBulletins, type CampusBulletinItem } from './campusBulletinData'
import type { CampusBulletinFeed } from './useCampusBulletins'

export function CampusBulletin({ feed, autoRotate, detailOpen, onOpen }: { feed: CampusBulletinFeed; autoRotate: boolean; detailOpen: boolean; onOpen: (item: CampusBulletinItem) => void }) {
  const { items, status, active, refresh } = feed
  const order = useMemo(() => shuffleBulletins(items), [items])
  const [index, setIndex] = useState(0), [focused, setFocused] = useState(false), [hovered, setHovered] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const currentIndex = order.length ? index % order.length : 0, item = order[currentIndex]
  const rotating = autoRotate && !focused && !hovered && !detailOpen && active && !reducedMotion
  const next = () => setIndex((value) => value + 1)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const changed = () => setReducedMotion(media.matches)
    media.addEventListener('change', changed)
    return () => media.removeEventListener('change', changed)
  }, [])
  useEffect(() => {
    if (!rotating || order.length < 2) return
    const timer = window.setTimeout(() => setIndex((value) => value + 1), 6500)
    return () => window.clearTimeout(timer)
  }, [rotating, order, index])
  const openCurrent = () => { if (item && activeBulletins([item]).length) onOpen(item); else refresh() }
  return <section className="campus-bulletin" aria-label="校園快報" onMouseEnter={() => { if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) setHovered(true) }} onMouseLeave={() => setHovered(false)} onFocus={(event) => { if (event.target.matches(':focus-visible')) setFocused(true) }} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
    <button type="button" className="campus-bulletin-open" onClick={item ? openCurrent : refresh} aria-label={item ? `校園快報：${item.organizer}｜${item.title}，查看活動詳情` : '重新載入校園快報'}>
      <span className="campus-bulletin-meta"><Megaphone size={12} />校園快報{status === 'cached' ? <small>離線快取</small> : null}</span>
      <span className="campus-bulletin-headline" key={item?.id || status}>{item ? <>{item.organizer}<span className="campus-bulletin-divider">｜</span>{item.title}</> : status === 'loading' ? '正在讀取活動…' : status === 'live' ? '目前沒有近期活動' : '快報暫時無法載入，點此重試'}</span>
    </button>
    <button type="button" className="campus-bulletin-control" aria-label={item ? '下一則校園快報' : '重新整理校園快報'} disabled={order.length === 1} onClick={item ? next : refresh}>{item ? <ChevronRight size={20} /> : <RefreshCw size={17} />}</button>
  </section>
}
