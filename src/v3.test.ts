// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { advancedEnglishCreditAdjustment, readAdvancedEnglish } from './advancedEnglish'
import { calendarWeekSegments } from './calendarSegments'
import { applyAppearance, defaultAppearance, parseAppearance, readAppearance, saveAppearance, contrastText, normalizeNavigation, appearancePresets, presetAppearance } from './appearance'
import { classesForDate, semesterWeek } from './calendarCourses'
import { restoreSemesterOverrides } from './timetableRestore'
import { mergeMailSummaries, MAIL_CACHE_LIMIT } from './storage/mailCache'
import { widgetSchedule, parseWidgetDisplay } from './timetableWidget'
import { calendarItemsForDate } from './calendarItems'
import type { Grade, TimetableSlot } from './types'
const slot = (day = 1, start = '08:20', end = '09:10', courseId = 'math'): TimetableSlot => ({ id: `${courseId}-${day}-${start}`, courseId, courseCode: 'M01', courseTitle: '工程數學', instructor: '測試教師', classroom: 'ME203', day, startsAt: start, endsAt: end, section: '1', credits: 3, color: '#eeddee' })
const english = (score: number | null = 80, letter?: string): Grade => ({ id: 'en', courseId: 'EN01', courseTitle: '進階英文', semester: '115-1', score, letter, credits: 2, required: true, category: '必修' })
describe('3.0 appearance and navigation', () => {
  beforeEach(() => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), clear: () => values.clear() })
  })
  it('retains Other, removes invalid and duplicate items, and limits navigation to five', () => {
    const parsed = parseAppearance({ brand: 'red', navigation: ['portal', 'portal', 'toString', 'calendar', 'mail', 'grades', 'departments'] })
    expect(parsed.brand).toBe(defaultAppearance.brand)
    expect(parsed.navigation).toEqual(['portal', 'activities', 'mail', 'grades', 'more'])
  })
  it('replaces the old Calendar slot once and preserves colors and later explicit choices', () => {
    const upgraded = parseAppearance({ ...defaultAppearance, navigationRevision: undefined, button: '#ff6662', navigation: ['mail', 'calendar', 'portal', 'grades', 'more'] })
    expect(upgraded.navigation).toEqual(['mail', 'activities', 'portal', 'grades', 'more'])
    expect(upgraded.button).toBe('#ff6662')
    saveAppearance({ ...upgraded, navigation: ['mail', 'calendar', 'portal', 'grades', 'more'], bulletinAutoRotate: false })
    expect(readAppearance().navigation).toEqual(['mail', 'calendar', 'portal', 'grades', 'more'])
    expect(readAppearance().bulletinAutoRotate).toBe(false)
  })
  it('persists all custom colors, mode, layout, and ordered navigation', () => {
    const settings = { ...defaultAppearance, mode: 'light' as const, layout: 'soft' as const, brand: '#08799c', background: '#eef8ff', text: '#133748', button: '#d36330', navigation: ['mail', 'portal', 'timetable', 'grades', 'more'] as typeof defaultAppearance.navigation }
    saveAppearance(settings)
    expect(readAppearance()).toEqual(settings)
    expect(document.documentElement.style.getPropertyValue('--app-bg')).toBe('#eef8ff')
    expect(document.documentElement.dataset.layout).toBe('soft')
  })
  it('uses legible button and header foregrounds for light and dark colors', () => {
    expect(contrastText('#ffffff')).toBe('#10212b')
    expect(contrastText('#075a99')).toBe('#ffffff')
    applyAppearance(defaultAppearance)
    expect(document.documentElement.style.getPropertyValue('--on-brand')).toBe('#ffffff')
  })
  it('always fixes Other at the right and preserves independent important dates', () => {
    expect(normalizeNavigation(['more', 'calendar', 'important-dates', 'competitions', 'mail'])).toEqual(['calendar', 'important-dates', 'competitions', 'mail', 'more'])
    expect(normalizeNavigation(['more', 'more'])).toEqual(defaultAppearance.navigation)
  })
  it('offers seven new palettes, each with both light and dark modes', () => {
    expect(appearancePresets).toHaveLength(7)
    for (const preset of appearancePresets) for (const mode of ['dark', 'light'] as const) {
      const next = presetAppearance(preset.id, mode)
      expect(next.mode).toBe(mode); expect(next.button).toBe(preset[mode]); expect(next.navigation.at(-1)).toBe('more')
      expect(contrastText(next.background)).toBe(mode === 'light' ? '#10212b' : '#ffffff')
    }
  })
})
describe('3.0 calendar and home-screen widget', () => {
  it('maps Monday and Sunday, merges consecutive periods, and preserves separate sessions', () => {
    const original = [slot(), slot(1, '09:20', '10:10'), slot(1, '13:10', '14:00'), slot(7)]
    expect(classesForDate(original, '2026-10-05').map((item) => [item.startsAt, item.endsAt])).toEqual([['08:20', '10:10'], ['13:10', '14:00']])
    expect(classesForDate(original, '2026-10-11')).toHaveLength(1)
    expect(original[0].endsAt).toBe('09:10')
    expect(widgetSchedule(original)[0].classes[0]).toEqual({ title: '工程數學', room: 'ME203', start: '08:20', end: '10:10' })
  })
  it('merges a course even when another overlapping course falls between its periods', () => {
    expect(classesForDate([slot(), slot(1, '08:30', '09:00', 'other'), slot(1, '09:20', '10:10')], '2026-10-05')).toHaveLength(2)
  })
  it('calculates week boundaries without treating the vacation as week one', () => {
    expect(semesterWeek('2026-09-13', '2026-09-14')).toBe(0)
    expect(semesterWeek('2026-09-20', '2026-09-14')).toBe(1)
    expect(semesterWeek('2026-09-21', '2026-09-14')).toBe(2)
    expect(semesterWeek('2027-01-18', '2026-09-14')).toBe(19)
  })
  it('restores only the selected semester and leaves source records immutable', () => {
    const courses = { '115-1': [slot()], '114-2': [slot(2)] }, deleted = { '115-1': ['old'], '114-2': ['other'] }
    expect(restoreSemesterOverrides(courses, deleted, '115-1')).toEqual({ courses: { '114-2': [slot(2)] }, deleted: { '114-2': ['other'] } })
    expect(courses['115-1']).toHaveLength(1)
    expect(deleted['115-1']).toEqual(['old'])
  })
  it('shows multi-day official and personal events plus real courses inside date cells', () => {
    const events = [{ id: 'official', title: '校慶', startsOn: '2026-10-04', endsOn: '2026-10-06', category: '學校', source: 'official' as const }, { id: 'personal', title: '讀書', startsOn: '2026-10-05', category: '個人', time: '18:00', source: 'personal' as const }]
    const items = calendarItemsForDate(events, [slot()], '2026-10-05', '2026-09-14')
    expect(items.map((item) => item.title)).toEqual(['校慶', '工程數學', '讀書'])
    expect(items[1].course?.classroom).toBe('ME203')
    expect(calendarItemsForDate(events, [slot()], '2026-09-07', '2026-09-14')).toHaveLength(0)
  })
  it('bounds widget opacity and distinguishes transparent from white/dark cards', () => {
    expect(parseWidgetDisplay({ style: 'transparent', tone: 'dark', opacity: 0 })).toEqual({ style: 'transparent', tone: 'dark', opacity: 35 })
    expect(parseWidgetDisplay({ opacity: NaN }).opacity).toBe(88)
    expect(parseWidgetDisplay({ opacity: 200 }).opacity).toBe(100)
  })
})
describe('3.0 approved advanced-English credit', () => {
  it('supports manual completion without duplicating passed credits', () => {
    expect(advancedEnglishCreditAdjustment([], 'completed')).toBe(2)
    expect(advancedEnglishCreditAdjustment([english()], 'completed')).toBe(0)
    expect(advancedEnglishCreditAdjustment([english(null, '核准抵免')], 'completed')).toBe(0)
    expect(advancedEnglishCreditAdjustment([{ ...english(), credits: 1 }], 'completed')).toBe(1)
    localStorage.setItem('QA_ENGLISH_COMPLETED', 'completed')
    expect(readAdvancedEnglish('QA_ENGLISH_COMPLETED')).toBe('completed')
    localStorage.setItem('QA_ENGLISH_COMPLETED', 'unconfirmed')
  })
  it('requires explicit approval; selecting a course is not evidence it was passed', () => {
    expect(advancedEnglishCreditAdjustment([], 'unconfirmed')).toBe(0)
    expect(advancedEnglishCreditAdjustment([], 'course')).toBe(0)
    expect(advancedEnglishCreditAdjustment([], 'eligible')).toBe(0)
    expect(advancedEnglishCreditAdjustment([], 'approved-exemption')).toBe(2)
  })
  it('never double-counts a passed or already exempted transcript entry', () => {
    expect(advancedEnglishCreditAdjustment([english()], 'approved-exemption')).toBe(0)
    expect(advancedEnglishCreditAdjustment([english(null, '核准抵免')], 'approved-exemption')).toBe(0)
    expect(advancedEnglishCreditAdjustment([{ ...english(), credits: 1 }], 'approved-exemption')).toBe(1)
  })
  it('does not treat failed, NOT PASS, or unapproved exemption wording as passing', () => {
    for (const grade of [english(40), english(null, 'NOT PASS'), english(null, '未通過'), english(null, '未核准抵免')]) expect(advancedEnglishCreditAdjustment([grade], 'approved-exemption')).toBe(2)
  })
})

describe('3.0 continuous calendar bars', () => {
  const dates = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11']
  const event = (id: string, startsOn: string, endsOn: string) => ({ id, startsOn, endsOn, title: '獎學金申請', category: '學校', source: 'official' as const })
  it('uses one connected span for an inclusive multi-day range', () => {
    expect(calendarWeekSegments([event('a', dates[1], dates[5])], dates)).toEqual([{ event: event('a', dates[1], dates[5]), startColumn: 1, span: 5, lane: 0, startsOn: dates[1], continuesBefore: false, continuesAfter: false }])
  })
  it('clips across weeks with continuation markers', () => {
    const bar = calendarWeekSegments([event('a', '2026-10-01', '2026-10-20')], dates)[0]
    expect([bar.startColumn, bar.span, bar.continuesBefore, bar.continuesAfter]).toEqual([0, 7, true, true])
  })
  it('separates overlapping events and reuses free lanes without merging equal titles', () => {
    const bars = calendarWeekSegments([event('a', dates[0], dates[2]), event('b', dates[2], dates[3]), event('c', dates[3], dates[4])], dates)
    expect(bars.map((bar) => bar.lane)).toEqual([0, 1, 0])
    expect(calendarWeekSegments([event('outside', '2026-10-20', '2026-10-21')], dates)).toEqual([])
  })
  it('persists eligibility separately from approved exemption', () => {
    localStorage.setItem('english-qa', 'eligible')
    expect(readAdvancedEnglish('english-qa')).toBe('eligible')
  })
})
describe('3.0 mail summary cache', () => {
  it('retains 1000 newest messages, deduplicates UID, and prefers fresh flags and subject', () => {
    const messages = Array.from({ length: 1050 }, (_, i) => ({ uid: String(i), subject: 'old', sender: 'sender', senderAddress: 'test@example.com', receivedAt: new Date(2026, 0, 1, 0, i).toISOString(), unread: true, starred: false }))
    const result = mergeMailSummaries([{ ...messages[1049], subject: 'new', unread: false }], messages)
    expect(result).toHaveLength(MAIL_CACHE_LIMIT)
    expect(result[0].subject).toBe('new')
    expect(result[0].unread).toBe(false)
    expect(result.at(-1)?.uid).toBe('50')
  })
})
