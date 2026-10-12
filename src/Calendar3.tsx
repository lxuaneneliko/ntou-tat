import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react'
import type { CalendarEvent, TimetableSlot } from './types'
import { classesForDate, isoLocalDate, semesterWeek } from './calendarCourses'
import { calendarItemsForDate } from './calendarItems'
import type { Appearance } from './appearance'
import { calendarWeekSegments } from './calendarSegments'
import { createCalendarPalette, type CalendarTone } from './calendarPalette'

const toneStyle = (tone: CalendarTone): CSSProperties => ({ background: tone.background, color: tone.foreground, boxShadow: `inset 3px 0 ${tone.marker}` })

export function Calendar3({ appearance, events, slots, showCourses, mode, optionsOpen, semesterId, semesterStart, onSemesterStartChange, onOpenCourse, onDeleteEvent, onRequestAdd }: {
  appearance: Appearance;
  mode: 'month' | 'week'; optionsOpen: boolean;
  showCourses: boolean;
  events: CalendarEvent[]; slots: TimetableSlot[]; semesterId: string; semesterStart: string; onSemesterStartChange: (date: string) => void;
  onOpenCourse: (slot: TimetableSlot) => void; refreshing: boolean; onRefresh: () => void; onDeleteEvent: (id: string) => void; onRequestAdd: (date: string) => void;
}) {
  const [selectedDate, setSelectedDate] = useState(() => isoLocalDate(new Date()))
  const palette = useMemo(() => createCalendarPalette(appearance), [appearance])
  const selected = new Date(selectedDate + 'T12:00:00')
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const [monthRowHeight, setMonthRowHeight] = useState(100)
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const measure = () => {
      const bottom = document.querySelector('.bottom-nav')?.getBoundingClientRect().top ?? window.innerHeight - 68
      // Document position stays stable when the user scrolls down to the agenda.
      const top = grid.getBoundingClientRect().top + window.scrollY
      const height = Math.max(48, Math.min(112, (bottom - top - 12) / 6))
      setMonthRowHeight((current) => Math.abs(current - height) < .5 ? current : height)
    }
    const observer = new ResizeObserver(measure)
    if (grid.parentElement) observer.observe(grid.parentElement)
    const header = document.querySelector('.app-header'), nav = document.querySelector('.bottom-nav')
    if (header) observer.observe(header)
    if (nav) observer.observe(nav)
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    measure()
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); window.visualViewport?.removeEventListener('resize', measure) }
  }, [mode, optionsOpen])
  const visibleSlots = monthRowHeight >= 92 ? 2 : monthRowHeight >= 72 ? 1 : 0
  const start = mode === 'month' ? new Date(selected.getFullYear(), selected.getMonth(), 1) : new Date(selected)
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  const cells = Array.from({ length: mode === 'month' ? 42 : 7 }, (_, i) => { const day = new Date(start); day.setDate(day.getDate() + i); return isoLocalDate(day) })
  const week = semesterWeek(selectedDate, semesterStart)
  const inTerm = week >= 1 && week <= 18
  const dayCourses = useMemo(() => inTerm && showCourses ? classesForDate(slots, selectedDate) : [], [slots, selectedDate, inTerm, showCourses])
  const dayEvents = events.filter((event) => selectedDate >= event.startsOn && selectedDate <= (event.endsOn || event.startsOn))
  const shift = (offset: number) => { const next = new Date(selected); if (mode === 'week') next.setDate(next.getDate() + offset * 7); else next.setMonth(next.getMonth() + offset, 1); setSelectedDate(isoLocalDate(next)) }
  const changeWeek = (value: number) => { const date = new Date(semesterStart + 'T12:00:00'); date.setDate(date.getDate() + (value - 1) * 7); setSelectedDate(isoLocalDate(date)) }
  return <section className="calendar-screen calendar-v3">
    <div className="calendar-month-toolbar"><button className="plain-icon" type="button" aria-label="上一段日期" onClick={() => shift(-1)}><ChevronLeft size={20} /></button><label className="calendar-month-picker"><strong>{selected.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' })}</strong><input type="date" aria-label="跳至日期" value={selectedDate} onChange={(e) => e.target.value && setSelectedDate(e.target.value)} /></label><button className="plain-icon" type="button" aria-label="下一段日期" onClick={() => shift(1)}><ChevronRight size={20} /></button><button className="calendar-today" type="button" onClick={() => setSelectedDate(isoLocalDate(new Date()))}>今天</button></div>
    {optionsOpen ? <div className="calendar-options"><label className="settings-row"><span>{semesterId} 學期週次</span><select aria-label="學期週次" value={inTerm ? week : ''} onChange={(e) => changeWeek(Number(e.target.value))}><option value="">學期外</option>{Array.from({ length: 18 }, (_, i) => <option value={i + 1} key={i}>第 {i + 1} 週</option>)}</select></label><label className="settings-row"><span>第 1 週起始日</span><input type="date" aria-label="第1週起始日" value={semesterStart} onChange={(e) => e.target.value && onSemesterStartChange(e.target.value)} /></label></div> : null}
    <div className="calendar-weekdays">{['一', '二', '三', '四', '五', '六', '日'].map((day) => <span key={day}>{day}</span>)}</div>
    <div ref={gridRef} className={`calendar-grid calendar-grid-${mode}`} style={{ '--month-row-height': `${monthRowHeight}px` } as CSSProperties} role="grid" aria-label={mode === 'month' ? '月行事曆' : '週行事曆'}>{Array.from({ length: cells.length / 7 }, (_, weekIndex) => {
      const dates = cells.slice(weekIndex * 7, weekIndex * 7 + 7)
      const segments = calendarWeekSegments(events, dates)
      const visibleSegments = mode === 'month' ? segments.filter((segment) => segment.lane < visibleSlots) : segments
      const laneCount = visibleSegments.reduce((count, item) => Math.max(count, item.lane + 1), 0)
      return <div className="calendar-week-row" role="row" key={dates[0]} style={{ '--event-space': `${laneCount * 23}px` } as CSSProperties}>{dates.map((date) => {
      const current = new Date(date + 'T12:00:00'), items = showCourses ? calendarItemsForDate([], slots, date, semesterStart) : []
      const max = mode === 'month' ? Math.max(0, visibleSlots - laneCount) : 7
      const hiddenEvents = segments.filter((segment) => segment.lane >= visibleSlots && date >= segment.startsOn && date <= (segment.event.endsOn || segment.event.startsOn)).length
      const hiddenCount = Math.max(0, items.length - max) + (mode === 'month' ? hiddenEvents : 0)
      const isSelected = date === selectedDate, isToday = date === isoLocalDate(new Date()), isOutside = current.getMonth() !== selected.getMonth()
      return <div role="gridcell" key={date} className={`calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${isOutside ? 'outside-month' : ''}`} style={{ background: isSelected ? palette.selected : isOutside ? palette.outside : palette.cell, color: palette.ink }}>
        <button className="calendar-date-number" style={{ color: isSelected ? palette.selectedDateInk : isToday ? palette.today : isOutside ? palette.outsideInk : palette.ink, background: isSelected ? palette.selectedDate : undefined, borderColor: isToday ? palette.today : undefined, opacity: 1 }} type="button" aria-label={`選取 ${date}`} aria-pressed={isSelected} onClick={() => { setSelectedDate(date); setActiveEvent(null) }}>{current.getDate()}</button>
        <div className="calendar-cell-events">{items.slice(0, max).map((item) => <button className={`calendar-event-chip ${item.course ? 'course' : 'event'}`} key={item.id} style={toneStyle(item.course ? palette.course(item.course.courseId) : item.event?.source === 'personal' ? palette.personal : palette.official)} title={`${item.time || ''} ${item.title}`} aria-label={`${date} ${item.time || ''} ${item.title}`} type="button" onClick={() => { setSelectedDate(date); if (item.course) { setActiveEvent(null); onOpenCourse(item.course) } else if (item.event) setActiveEvent(item.event) }}><span>{item.title}</span>{mode === 'week' && item.time ? <small>{item.time}</small> : null}</button>)}
          {hiddenCount ? <button className="calendar-more-events" type="button" onClick={() => { setSelectedDate(date); setActiveEvent(null); document.getElementById('calendar-day-agenda')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}>+{hiddenCount}</button> : null}
        </div>
      </div>
      })}<div className="calendar-week-bars">{visibleSegments.map((segment) => {
        const { event } = segment, tone = event.source === 'personal' ? palette.personal : palette.official
        return <button key={event.id} type="button" className={`calendar-event-chip calendar-event-span ${segment.continuesBefore ? 'continues-before' : ''} ${segment.continuesAfter ? 'continues-after' : ''}`} style={{ gridColumn: `${segment.startColumn + 1} / span ${segment.span}`, gridRow: segment.lane + 1, ...toneStyle(tone) }} title={`${event.title} · ${event.startsOn} – ${event.endsOn || event.startsOn}`} aria-label={`${event.title} ${event.startsOn} 至 ${event.endsOn || event.startsOn}`} onClick={() => { if (!dates.includes(selectedDate) || selectedDate < event.startsOn || selectedDate > (event.endsOn || event.startsOn)) setSelectedDate(segment.startsOn); setActiveEvent(event) }}><span>{segment.continuesBefore ? '‹ ' : ''}{event.time ? `${event.time} ` : ''}{event.title}{segment.continuesAfter ? ' ›' : ''}</span></button>
      })}</div></div>
    })}</div>
    {activeEvent ? <section className="calendar-event-detail" aria-label="事件詳細資訊"><button className="plain-icon" aria-label="關閉事件詳細資訊" type="button" onClick={() => setActiveEvent(null)}><X size={18} /></button><strong>{activeEvent.title}</strong><span>{activeEvent.startsOn}{activeEvent.endsOn && activeEvent.endsOn !== activeEvent.startsOn ? ` – ${activeEvent.endsOn}` : ''}{activeEvent.time ? ` · ${activeEvent.time}` : ''}</span><small>{activeEvent.category}</small>{activeEvent.notes ? <p>{activeEvent.notes}</p> : null}</section> : null}
    <div className="calendar-agenda-heading" id="calendar-day-agenda"><strong>{selectedDate} · {['日', '一', '二', '三', '四', '五', '六'][selected.getDay()]}{inTerm ? ` · 第 ${week} 週` : ''}</strong><button className="plain-icon" type="button" aria-label="新增個人事件" onClick={() => onRequestAdd(selectedDate)}><Plus size={20} /></button></div>
    <div className="calendar-day-courses">{dayCourses.map((slot) => <button className="calendar-course-row" style={{ borderLeftColor: palette.course(slot.courseId).marker }} type="button" key={slot.id} onClick={() => onOpenCourse(slot)}><span className="calendar-course-time">{slot.startsAt}<small>{slot.endsAt}</small></span><span><strong>{slot.courseTitle}</strong><small>{slot.instructor} · {slot.classroom || '未指定教室'}</small></span><ChevronRight size={18} /></button>)}</div>
    <div className="agenda">{dayEvents.map((event) => <div className={`agenda-row ${event.source === 'personal' ? 'personal' : 'official'}`} key={event.id}><span className="agenda-dot" style={{ background: event.source === 'personal' ? palette.personal.marker : palette.official.marker }} /><div className="agenda-copy"><strong>{event.title}</strong><span>{event.category}{event.time ? ` · ${event.time}` : ''}</span>{event.notes ? <p>{event.notes}</p> : null}</div>{event.source === 'personal' ? <button className="agenda-delete" type="button" aria-label={`刪除${event.title}`} onClick={() => onDeleteEvent(event.id)}><Trash2 size={17} /></button> : null}</div>)}</div>
    {!dayCourses.length && !dayEvents.length ? <div className="inline-empty compact"><CalendarDays /><span>這一天沒有課程或行事</span></div> : null}
  </section>
}
