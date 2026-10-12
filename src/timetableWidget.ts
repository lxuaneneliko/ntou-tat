import { Capacitor, registerPlugin } from '@capacitor/core'
import type { TimetableSlot } from './types'
import { classesForDate, isoLocalDate } from './calendarCourses'
import type { Appearance } from './appearance'
export type WidgetDisplay = { style: 'glass' | 'solid' | 'transparent'; tone: 'light' | 'dark' | 'app'; opacity: number }
export type LockTimetableSettings = { enabled: boolean; permissionGranted: boolean; supported: boolean; device?: string; androidVersion?: string; sdk?: number }
const widget = registerPlugin<{ sync(options: { payload: string }): Promise<void>; pin(): Promise<{ supported: boolean; requested: boolean }>; setDisplay(options: { display: string }): Promise<void>; getLockSettings(): Promise<LockTimetableSettings>; setLockNotifications(options: { enabled: boolean }): Promise<LockTimetableSettings>; openNotificationSettings(): Promise<void> }>('TatWidget')
export const defaultWidgetDisplay: WidgetDisplay = { style: 'glass', tone: 'light', opacity: 88 }
export const parseWidgetDisplay = (raw: Partial<WidgetDisplay> = {}): WidgetDisplay => ({ style: raw.style === 'solid' || raw.style === 'transparent' ? raw.style : 'glass', tone: raw.tone === 'dark' || raw.tone === 'app' ? raw.tone : 'light', opacity: typeof raw.opacity === 'number' && Number.isFinite(raw.opacity) ? Math.min(100, Math.max(35, raw.opacity)) : 88 })
export const readWidgetDisplay = (): WidgetDisplay => { try { return parseWidgetDisplay(JSON.parse(localStorage.getItem('ntou-widget-display-v3') || '{}')) } catch { return { ...defaultWidgetDisplay } } }
export const saveWidgetDisplay = async (display: WidgetDisplay) => { const value = parseWidgetDisplay(display); localStorage.setItem('ntou-widget-display-v3', JSON.stringify(value)); if (Capacitor.getPlatform() === 'android') await widget.setDisplay({ display: JSON.stringify(value) }) }
export const getLockTimetableSettings = async (): Promise<LockTimetableSettings> => Capacitor.getPlatform() === 'android' ? widget.getLockSettings() : { enabled: false, permissionGranted: false, supported: false }
export const setLockTimetableNotifications = async (enabled: boolean): Promise<LockTimetableSettings> => Capacitor.getPlatform() === 'android' ? widget.setLockNotifications({ enabled }) : { enabled: false, permissionGranted: false, supported: false }
export const openTimetableNotificationSettings = async () => { if (Capacitor.getPlatform() === 'android') await widget.openNotificationSettings() }
export const widgetSchedule = (slots: TimetableSlot[]) => Array.from({ length: 7 }, (_, i) => {
  // 2026-10-05 is a Monday; use it only to group weekdays, never as the actual class date.
  const date = new Date(2026, 9, 5 + i, 12)
  return { day: i + 1, classes: classesForDate(slots, isoLocalDate(date)).map((slot) => ({ title: slot.courseTitle, room: slot.classroom, start: slot.startsAt, end: slot.endsAt })) }
})
export const syncTimetableWidget = async (slots: TimetableSlot[], semester: string, appearance: Appearance, semesterStart: string, enabled = true) => {
  if (Capacitor.getPlatform() !== 'android') return
  await widget.sync({ payload: JSON.stringify({ version: 1, semester, semesterStart, enabled, savedAt: Date.now(), display: readWidgetDisplay(), colors: { background: appearance.background, text: appearance.text, accent: appearance.button }, days: widgetSchedule(slots) }) })
}
export const requestTimetableWidget = async () => Capacitor.getPlatform() === 'android' ? widget.pin() : { supported: false, requested: false }
