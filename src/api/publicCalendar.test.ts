import { describe, expect, it } from 'vitest'
import { filterCalendarRange, parseNtouPublicCalendar } from './publicCalendar'

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
})
