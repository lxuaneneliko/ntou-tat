import type { CalendarEvent } from '../types'

const STORAGE_KEY = 'ntou_personal_calendar_v1'

export type PersonalCalendarStore = Record<string, CalendarEvent[]>

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

const isPersonalEvent = (value: unknown): value is CalendarEvent => {
  if (!value || typeof value !== 'object') return false
  const event = value as Partial<CalendarEvent>
  return (
    typeof event.id === 'string' &&
    event.id.startsWith('personal-calendar-') &&
    typeof event.title === 'string' &&
    event.title.trim().length > 0 &&
    isIsoDate(event.startsOn) &&
    (event.endsOn === undefined || isIsoDate(event.endsOn)) &&
    typeof event.category === 'string' &&
    event.source === 'personal'
  )
}

export const parsePersonalCalendarStore = (value: string | null): PersonalCalendarStore => {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([studentId, events]) => studentId.trim().length > 0 && Array.isArray(events))
        .map(([studentId, events]) => {
          const validEvents = (events as unknown[]).filter(isPersonalEvent)
          validEvents.sort((a, b) =>
            `${a.startsOn}-${a.time ?? ''}-${a.title}`.localeCompare(
              `${b.startsOn}-${b.time ?? ''}-${b.title}`,
            ),
          )
          return [studentId, validEvents] as const
        })
        .filter(([, events]) => (events as CalendarEvent[]).length > 0),
    )
  } catch {
    return {}
  }
}

export const readPersonalCalendarStore = (): PersonalCalendarStore => {
  try {
    return parsePersonalCalendarStore(localStorage.getItem(STORAGE_KEY))
  } catch {
    return {}
  }
}

export const writePersonalCalendarStore = (store: PersonalCalendarStore) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Keep the current in-memory events when storage is unavailable.
  }
}

export const personalEventsForStudent = (
  store: PersonalCalendarStore,
  studentId: string,
) => store[studentId] ?? []
