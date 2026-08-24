import { describe, expect, it } from 'vitest'
import {
  filterCalendarRange,
  isHolidayCalendarEvent,
  parseNtouPublicCalendar,
  shouldMarkCalendarDate,
} from './publicCalendar'

const calendarHtml = `
<div class="calendar">
  <div class="month" data-year="2026" data-month="8">
    <div class="months_event">
      <div class="day">
        <div class="date" data-month="8">1</div>
        <div class="days_event">
          <button data-end_date="2026/08/01" data-days_count="1">
            <span class="sr-only">2026年8月</span>
            <span class="event_title_append_before">(1) </span>
            學年度第1學期開始\\;就學貸款申辦開始日
          </button>
        </div>
      </div>
      <div class="day">
        <div class="date" data-month="8">24</div>
        <div class="days_event">
          <button data-end_date="2026/09/04" data-days_count="12">
            <span class="event_title_append_before">(8/24~9/4) </span>
            115學年度第1學期新生申請學分抵免
            <span class="event_title_append_after">(8/24~9/4，共12天)</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</div>
`

describe('NTOU public calendar parser', () => {
  it('parses official single-day and cross-month events', () => {
    const events = parseNtouPublicCalendar(calendarHtml)

    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({
      startsOn: '2026-08-01',
      endsOn: '2026-08-01',
      title: '學年度第1學期開始、就學貸款申辦開始日',
      category: '海大行事曆',
    })
    expect(events[1]).toMatchObject({
      startsOn: '2026-08-24',
      endsOn: '2026-09-04',
      title: '115學年度第1學期新生申請學分抵免',
    })
  })

  it('keeps an event when its date range overlaps the requested range', () => {
    const events = parseNtouPublicCalendar(calendarHtml)
    expect(filterCalendarRange(events, '2026-09-01', '2026-09-30')).toHaveLength(1)
  })

  it('marks only the start and end of a long event while keeping its full range', () => {
    const event = parseNtouPublicCalendar(calendarHtml)[1]

    expect(shouldMarkCalendarDate(event, '2026-08-24')).toBe(true)
    expect(shouldMarkCalendarDate(event, '2026-08-30')).toBe(false)
    expect(shouldMarkCalendarDate(event, '2026-09-04')).toBe(true)
    expect(filterCalendarRange([event], '2026-08-30', '2026-08-30')).toEqual([event])
  })

  it('marks every date in a multi-day holiday', () => {
    const holiday = {
      id: 'holiday',
      title: '春節放假',
      startsOn: '2026-02-14',
      endsOn: '2026-02-22',
      category: '海大行事曆',
      source: 'official' as const,
    }

    expect(shouldMarkCalendarDate(holiday, '2026-02-18')).toBe(true)
    expect(isHolidayCalendarEvent(holiday)).toBe(true)
  })

  it('does not classify a personal event containing the word holiday as official leave', () => {
    expect(isHolidayCalendarEvent({
      id: 'personal-holiday',
      title: '安排放假旅行',
      startsOn: '2026-02-18',
      category: '個人',
      source: 'personal',
    })).toBe(false)
  })
})
