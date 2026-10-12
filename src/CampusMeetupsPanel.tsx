import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { CalendarDays, MapPin, Plus, Users, X } from 'lucide-react'
import type { StudentProfile } from './types'
import type { CampusBulletinItem } from './campusBulletinData'
import { ActivityPoster } from './ActivityPoster'
import { meetupCategories, meetupRequest, publicMeetups, validMeetup, type CampusMeetup, type MeetupInput } from './campusMeetups'
import './campusMeetups.css'

const dateLabel = (value: string) => new Date(value).toLocaleString('zh-TW', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
const localDate = (value?: string) => { const date = value ? new Date(value) : new Date(Date.now() + 3600000); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
function MeetupDialog({ title, onClose, children, busy }: { title: string; onClose: () => void; children: ReactNode; busy: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => { const el = ref.current, focus = document.activeElement, overflow = document.body.style.overflow; el?.showModal(); document.body.style.overflow = 'hidden'; return () => { el?.close(); document.body.style.overflow = overflow; if (focus instanceof HTMLElement) focus.focus({ preventScroll: true }) } }, [])
  return <dialog ref={ref} className="campus-bulletin-dialog meetup-dialog" data-campus-meetup aria-label={title} onCancel={e => { e.preventDefault(); if (!busy) onClose() }}>
    <button className="campus-bulletin-close" type="button" aria-label="關閉揪團視窗" onClick={onClose} disabled={busy}><X size={20} /></button><h2>{title}</h2>{children}
  </dialog>
}

export function CampusMeetupsPanel({ profile, events, query, draftEvent, onConsumeDraft }: { profile: StudentProfile; events: CampusBulletinItem[]; query: string; draftEvent: CampusBulletinItem | null; onConsumeDraft: () => void }) {
  const [items, setItems] = useState<CampusMeetup[]>([]), [loaded, setLoaded] = useState(false), [feedError, setFeedError] = useState('')
  const [active, setActive] = useState<CampusMeetup | null>(null), [userId, setUserId] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false), [editing, setEditing] = useState<CampusMeetup | null>(null), [linked, setLinked] = useState<CampusBulletinItem | null>(null)
  const [reportOpen, setReportOpen] = useState(false), [confirmCancel, setConfirmCancel] = useState(false), [notice, setNotice] = useState('')
  const [title, setTitle] = useState(''), [description, setDescription] = useState(''), [category, setCategory] = useState<string>('讀書會'), [location, setLocation] = useState('海大圖書館'), [startsAt, setStartsAt] = useState(localDate()), [endsAt, setEndsAt] = useState(localDate(new Date(Date.now() + 7200000).toISOString())), [capacity, setCapacity] = useState(4)
  const mounted = useRef(true), requestSequence = useRef(0)
  const refresh = useCallback(async () => {
    const seq = ++requestSequence.current
    try { const next = await publicMeetups(AbortSignal.timeout(12000)); if (mounted.current && seq === requestSequence.current) { setItems(next); setLoaded(true); setFeedError('') } }
    catch { if (mounted.current && seq === requestSequence.current) { setLoaded(true); setFeedError('揪團暫時無法載入') } }
  }, [])
  useEffect(() => {
    mounted.current = true; void refresh()
    const visible = () => { if (!document.hidden) void refresh() }
    const interval = window.setInterval(visible, 60000); document.addEventListener('visibilitychange', visible); window.addEventListener('online', visible)
    return () => { mounted.current = false; window.clearInterval(interval); document.removeEventListener('visibilitychange', visible); window.removeEventListener('online', visible) }
  }, [refresh])
  const create = useCallback((event: CampusBulletinItem | null, edit: CampusMeetup | null = null) => {
    setTitle(edit?.title ?? (event ? `一起參加｜${event.title}`.slice(0, 100) : '')); setDescription(edit?.description ?? ''); setCategory(edit?.category ?? (event ? '一起參加' : '讀書會')); setLocation(edit?.location ?? event?.location ?? '海大圖書館');
    const futureStart = event?.startsAt && Date.parse(event.startsAt) > Date.now() ? event.startsAt : undefined
    setStartsAt(localDate(edit?.startsAt ?? futureStart)); setEndsAt(localDate(edit?.endsAt ?? (futureStart ? new Date(Date.parse(futureStart) + 7200000).toISOString() : new Date(Date.now() + 7200000).toISOString()))); setCapacity(edit?.capacity ?? 4)
    setLinked(event); setEditing(edit); setActive(null); setError(''); setNotice(''); setFormOpen(true)
  }, [])
  useEffect(() => { if (draftEvent) { create(draftEvent); onConsumeDraft() } }, [draftEvent, onConsumeDraft, create])
  async function open(item: CampusMeetup) {
    setActive(item); setReportOpen(false); setConfirmCancel(false); setError(''); setNotice(''); setBusy(true)
    try { const { value, userId: id } = await meetupRequest(profile, '/meetups/' + encodeURIComponent(item.id)); if (!mounted.current) return; if (!validMeetup(value)) throw new Error('揪團資訊回應不完整'); setActive(value); setUserId(id) }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '無法讀取揪團') }
    finally { if (mounted.current) setBusy(false) }
  }
  async function submit(e: FormEvent) {
    e.preventDefault(); if (busy) return
    const start = new Date(startsAt), end = new Date(endsAt)
    if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now() || end.getTime() <= start.getTime()) { setError('請選擇未來的活動時間，結束須晚於開始'); return }
    setBusy(true); setError('')
    const input: MeetupInput = { title: title.trim(), description: description.trim(), category, location: location.trim(), startsAt: start.toISOString(), endsAt: end.toISOString(), capacity, linkedEventId: editing?.linkedEventId ?? linked?.id ?? null }
    try { const { value, userId: id } = await meetupRequest(profile, '/meetups' + (editing ? '/' + encodeURIComponent(editing.id) : ''), editing ? 'PUT' : 'POST', input); if (!mounted.current) return; if (!validMeetup(value)) throw new Error('揪團回應不完整，請重新整理清單確認'); setUserId(id); setFormOpen(false); setActive({ ...value, joined: true }); setNotice(editing ? '已儲存' : '揪團已發布'); await refresh() }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '無法發布揪團') }
    finally { if (mounted.current) setBusy(false) }
  }
  async function action(kind: 'join' | 'leave' | 'cancel' | 'report', reason?: string) {
    if (!active || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      await meetupRequest(profile, '/meetups/' + encodeURIComponent(active.id) + '/' + (kind === 'leave' ? 'join' : kind), kind === 'leave' ? 'DELETE' : 'POST', kind === 'report' ? { reason } : undefined)
      if (!mounted.current) return
      setNotice(({ join: '已加入揪團', leave: '已退出揪團', cancel: '已取消揪團', report: '已送出檢舉' })[kind]); setReportOpen(false); setConfirmCancel(false)
      const { value } = await meetupRequest(profile, '/meetups/' + encodeURIComponent(active.id)); if (mounted.current && validMeetup(value)) setActive(value)
      await refresh()
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '操作未完成') }
    finally { if (mounted.current) setBusy(false) }
  }
  const matching = items.filter(m => Date.parse(m.endsAt) > Date.now() && `${m.title} ${m.description} ${m.hostName} ${m.location} ${m.category}`.toLowerCase().includes(query.trim().toLowerCase()))
  const owner = Boolean(active && userId && active.ownerId === userId), canJoin = active?.status === 'published' && Date.parse(active.startsAt) > Date.now(), activeEvent = events.find(e => e.id === active?.linkedEventId)
  return <section className="meetups-panel" aria-label="學生揪團">
    <div className="meetups-heading"><h2>學生揪團</h2><button type="button" className="meetup-create" onClick={() => create(null)}><Plus size={16} />發起揪團</button></div>
    {feedError ? <p className="meetup-status" role="status">{feedError}<button type="button" onClick={() => void refresh()}>重試</button></p> : !loaded ? <p className="meetup-status">正在讀取揪團…</p> : !matching.length ? <p className="meetup-status">{query ? '沒有符合的揪團' : '還沒有揪團，找同學一起參加吧'}</p> : null}
    <div className="meetups-list">{matching.map(item => <button key={item.id} type="button" className="meetup-card" onClick={() => void open(item)}><span className="meetup-card-category">{item.category}</span><strong>{item.title}</strong><span><CalendarDays size={14} />{dateLabel(item.startsAt)}</span><span><MapPin size={14} />{item.location}</span><span className="meetup-card-footer"><span>{item.hostName}</span><span><Users size={14} />{item.participantCount} / {item.capacity} 人</span></span></button>)}</div>
    {formOpen ? <MeetupDialog title={editing ? '編輯揪團' : '發起揪團'} busy={busy} onClose={() => setFormOpen(false)}><form className="meetup-form" onSubmit={e => void submit(e)}>
      {linked ? <p className="meetup-linked">一起參加：{linked.title}</p> : null}
      <label>揪團名稱<input required maxLength={100} value={title} onChange={e => setTitle(e.target.value)} placeholder="例：週三材料力學讀書會" /></label>
      <label>類型<select value={category} onChange={e => setCategory(e.target.value)}>{meetupCategories.map(v => <option key={v}>{v}</option>)}</select></label>
      <label>介紹<textarea required maxLength={3000} rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="想找怎樣的同學、一起做什麼？" /></label>
      <label>集合地點<input required maxLength={200} value={location} onChange={e => setLocation(e.target.value)} placeholder="海大基隆校內地點" /></label>
      <div className="meetup-form-dates"><label>開始時間<input type="datetime-local" required value={startsAt} onChange={e => setStartsAt(e.target.value)} /></label><label>結束時間<input type="datetime-local" required value={endsAt} onChange={e => setEndsAt(e.target.value)} /></label></div>
      <label>人數上限（含自己）<input type="number" min={2} max={100} required value={capacity} onChange={e => setCapacity(Number(e.target.value))} /></label>
      {error ? <p role="alert" className="meetup-error">{error}</p> : null}<button className="meetup-primary" type="submit" disabled={busy}>{busy ? '處理中…' : editing ? '儲存變更' : '發布揪團'}</button>
    </form></MeetupDialog> : active ? <MeetupDialog title={active.title} busy={busy} onClose={() => setActive(null)}>
      <small>{active.category} · {active.hostName}</small>{activeEvent ? <ActivityPoster item={activeEvent} detail /> : null}
      <dl className="meetup-facts"><div><dt>時間</dt><dd>{dateLabel(active.startsAt)} — {dateLabel(active.endsAt)}</dd></div><div><dt>地點</dt><dd>{active.location}</dd></div><div><dt>人數</dt><dd>{active.participantCount} / {active.capacity} 人（含發起人）</dd></div></dl><p className="meetup-description">{active.description}</p>
      {active.participants && owner ? <section className="meetup-participants"><h3>參加同學</h3>{active.participants.map(p => <span key={p.id}>{p.name}</span>)}</section> : null}
      {busy ? <p className="meetup-status" role="status">正在處理…</p> : null}{error ? <p className="meetup-error" role="alert">{error}<button type="button" disabled={busy} onClick={() => void open(active)}>重新讀取</button></p> : null}{notice ? <p role="status" className="meetup-notice">{notice}</p> : null}
      {active.status !== 'published' ? <p className="meetup-status">{active.status === 'cancelled' ? '此揪團已取消' : '此揪團已下架'}</p> : owner ? <div className="meetup-actions"><button type="button" disabled={busy || !canJoin} onClick={() => create(activeEvent ?? null, active)}>編輯</button><button type="button" disabled={busy || Date.parse(active.endsAt) <= Date.now()} onClick={() => setConfirmCancel(true)}>取消揪團</button></div> : <div className="meetup-actions"><button className="meetup-primary" type="button" disabled={busy || !canJoin || Boolean(error) || (!active.joined && active.participantCount >= active.capacity)} onClick={() => void action(active.joined ? 'leave' : 'join')}>{active.joined ? '退出揪團' : active.participantCount >= active.capacity ? '人數已滿' : !canJoin ? '活動已開始' : '加入揪團'}</button><button type="button" disabled={busy} onClick={() => setReportOpen(v => !v)}>檢舉</button></div>}
      {confirmCancel ? <div className="meetup-confirm"><p>取消後所有同學都無法再加入，確定取消？</p><button type="button" disabled={busy} onClick={() => void action('cancel')}>確定取消</button><button type="button" disabled={busy} onClick={() => setConfirmCancel(false)}>保留揪團</button></div> : null}
      {reportOpen ? <form className="meetup-form" onSubmit={e => { e.preventDefault(); const reason = String(new FormData(e.currentTarget).get('reason') ?? '').trim(); if (reason) void action('report', reason) }}><label>檢舉原因<textarea name="reason" required maxLength={1000} rows={3} /></label><button type="submit" disabled={busy}>送出檢舉</button></form> : null}
    </MeetupDialog> : null}
  </section>
}
