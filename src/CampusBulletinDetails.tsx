import { useEffect, useRef } from 'react'
import type { MouseEvent } from 'react'
import { Browser } from '@capacitor/browser'
import { Capacitor } from '@capacitor/core'
import { CalendarDays, ExternalLink, MapPin, Users, X } from 'lucide-react'
import { bulletinDateLabel, type CampusBulletinItem } from './campusBulletinData'
import { ActivityPoster } from './ActivityPoster'

const openLink = (event: MouseEvent<HTMLAnchorElement>, url: string) => {
  if (!Capacitor.isNativePlatform()) return
  event.preventDefault()
  void Browser.open({ url })
}
export function CampusBulletinDetails({ item, onClose, onStartMeetup }: { item: CampusBulletinItem; onClose: () => void; onStartMeetup?: (item: CampusBulletinItem) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current, previousFocus = document.activeElement, previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    element?.showModal()
    return () => { element?.close(); document.body.style.overflow = previousOverflow; if (previousFocus instanceof HTMLElement) previousFocus.focus({ preventScroll: true }) }
  }, [])
  const registrationOpen = item.registrationUrl && (!item.registrationEndsAt || Date.parse(item.registrationEndsAt) > Date.now())
  return <dialog ref={dialog} className="campus-bulletin-dialog" aria-labelledby="campus-bulletin-heading" onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => { if (event.target === event.currentTarget) { const bounds = event.currentTarget.getBoundingClientRect(); if (event.clientY < bounds.top || event.clientX < bounds.left || event.clientX > bounds.right) onClose() } }}>
    <button className="campus-bulletin-close" type="button" aria-label="關閉活動詳情" onClick={onClose}><X size={20} /></button>
    <small className="campus-bulletin-organizer">{item.organizer}{item.category ? ` · ${item.category}` : ''}</small>
    <h2 id="campus-bulletin-heading">{item.title}</h2>
    <ActivityPoster item={item} detail />
    <dl className="campus-bulletin-facts"><div><dt><CalendarDays size={17} />日期</dt><dd>{bulletinDateLabel(item)}</dd></div>{item.location ? <div><dt><MapPin size={17} />地點</dt><dd>{item.location}</dd></div> : null}<div><dt><Users size={17} />對象</dt><dd>{item.audience || '請向主辦單位確認'}</dd></div></dl>
    {item.dateNote ? <p className="campus-bulletin-note">{item.dateNote}</p> : null}
    {item.description ? <p className="campus-bulletin-description">{item.description}</p> : null}
    {onStartMeetup ? <button type="button" className="meetup-primary" onClick={() => onStartMeetup(item)}>發起揪團一起參加</button> : null}
    <div className="campus-bulletin-links"><a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={(event) => openLink(event, item.sourceUrl)}>原始公告<ExternalLink size={16} /></a>{registrationOpen ? <a href={item.registrationUrl!} target="_blank" rel="noopener noreferrer" onClick={(event) => openLink(event, item.registrationUrl!)}>報名資訊<ExternalLink size={16} /></a> : null}</div>
    <p className="campus-bulletin-disclaimer">場次、參加資格與報名狀態以主辦單位最新公告為準。</p>
  </dialog>
}
