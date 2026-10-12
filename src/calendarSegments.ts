import type { CalendarEvent } from './types'

export type CalendarSegment = { event: CalendarEvent; startColumn: number; span: number; lane: number; continuesBefore: boolean; continuesAfter: boolean; startsOn: string }

// Allocate one bar per event per week, without joining unrelated events by title.
export function calendarWeekSegments(events: CalendarEvent[], dates: string[]): CalendarSegment[] {
  if (dates.length !== 7) return []
  const first = dates[0], last = dates[6]
  const candidates = events.filter((event) => event.startsOn <= last && (event.endsOn || event.startsOn) >= first)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || (b.endsOn || b.startsOn).localeCompare(a.endsOn || a.startsOn) || a.id.localeCompare(b.id))
  const occupied: number[] = []
  return candidates.map((event) => {
    const end = event.endsOn || event.startsOn
    const startsOn = event.startsOn < first ? first : event.startsOn
    const startColumn = dates.indexOf(startsOn)
    const endColumn = dates.indexOf(end > last ? last : end)
    let lane = occupied.findIndex((until) => until < startColumn)
    if (lane < 0) lane = occupied.length
    occupied[lane] = endColumn
    return { event, startColumn, span: endColumn - startColumn + 1, lane, startsOn, continuesBefore: event.startsOn < first, continuesAfter: end > last }
  })
}
