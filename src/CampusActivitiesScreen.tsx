import { useMemo, useState } from 'react'
import { CalendarDays, ChevronRight, MapPin, RefreshCw, Search, X } from 'lucide-react'
import { bulletinDateLabel, type CampusBulletinItem } from './campusBulletinData'
import { filterCampusActivities, type ActivityScope } from './campusActivities'
import type { CampusBulletinFeed } from './useCampusBulletins'
import { ActivityPoster } from './ActivityPoster'
import { CampusMeetupsPanel } from './CampusMeetupsPanel'
import type { StudentProfile } from './types'

export function CampusActivitiesScreen({ feed, onOpen, profile, draftEvent, onConsumeDraft }: { feed: CampusBulletinFeed; onOpen: (item: CampusBulletinItem) => void; profile: StudentProfile; draftEvent: CampusBulletinItem | null; onConsumeDraft: () => void }) {
  const [query, setQuery] = useState(''), [scope, setScope] = useState<ActivityScope>('all'), [category, setCategory] = useState('')
  const { items, status, refreshing, refresh } = feed
  const categories = useMemo(() => [...new Set(items.map((item) => item.category).filter(Boolean))].sort(), [items])
  const effectiveCategory = categories.includes(category) ? category : ''
  const filtered = useMemo(() => filterCampusActivities(items, scope, effectiveCategory, query), [items, scope, effectiveCategory, query])
  return <section className="campus-activities-screen" aria-label="校園活動列表">
    <div className="activity-scope" aria-label="活動來源">{([['all', '全部'], ['campus', '校園'], ['club', '社團']] as const).map(([key, label]) => <button type="button" key={key} aria-pressed={scope === key} onClick={() => setScope(key)}>{label}</button>)}</div>
    <div className="activity-filter-row"><label className="activity-search"><Search size={17} /><input type="search" aria-label="搜尋活動" placeholder="搜尋活動、社團或地點" value={query} onChange={(event) => setQuery(event.target.value)} />{query ? <button type="button" aria-label="清除活動搜尋" onClick={() => setQuery('')}><X size={16} /></button> : null}</label><select aria-label="活動類型" value={effectiveCategory} onChange={(event) => setCategory(event.target.value)}><option value="">所有類型</option>{categories.map((value) => <option value={value} key={value}>{value}</option>)}</select></div>
    <CampusMeetupsPanel profile={profile} events={items} query={query} draftEvent={draftEvent} onConsumeDraft={onConsumeDraft} />
    {status === 'cached' ? <p className="activity-cache-note">離線快取</p> : null}
    {filtered.length ? <div className="activity-list">{filtered.map((item) => <button type="button" className="activity-list-item" key={item.id} onClick={() => onOpen(item)}>
      <ActivityPoster item={item} /><span className="activity-item-body"><span className="activity-item-organizer">{item.organizer}<small>{item.category || '活動'}</small></span><strong>{item.title}</strong>
      <span className="activity-item-date"><CalendarDays size={14} />{bulletinDateLabel(item)}</span>{item.location ? <span className="activity-item-location"><MapPin size={14} />{item.location}</span> : null}<ChevronRight className="activity-item-chevron" size={18} /></span>
    </button>)}</div> : <div className="activity-empty"><CalendarDays size={26} /><span>{status === 'loading' ? '正在讀取活動…' : status === 'unavailable' ? '活動暫時無法載入' : items.length ? '沒有符合條件的活動' : '目前沒有近期活動'}</span>{status === 'unavailable' ? <button type="button" disabled={refreshing} onClick={refresh}><RefreshCw size={15} />重試</button> : query || scope !== 'all' || category ? <button type="button" onClick={() => { setQuery(''); setScope('all'); setCategory('') }}>清除篩選</button> : null}</div>}
  </section>
}
