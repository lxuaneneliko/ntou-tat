import { describe, expect, it } from 'vitest'
import { parsePersonalCalendarStore, personalEventsForStudent } from './calendarStorage'

describe('personal calendar storage', () => {
  it('keeps valid personal events separated by student', () => {
    const store = parsePersonalCalendarStore(JSON.stringify({
      S001: [{
        id: 'personal-calendar-2',
        title: '社團會議',
        startsOn: '2026-08-20',
        endsOn: '2026-08-20',
        category: '社團',
        time: '18:30',
        source: 'personal',
      }],
      S002: [{
        id: 'personal-calendar-1',
        title: '繳交報告',
        startsOn: '2026-08-12',
        category: '課業',
        source: 'personal',
      }],
    }))

    expect(personalEventsForStudent(store, 'S001')).toHaveLength(1)
    expect(personalEventsForStudent(store, 'S002')[0].title).toBe('繳交報告')
  })

  it('drops malformed or official events from personal storage', () => {
    const store = parsePersonalCalendarStore(JSON.stringify({
      S001: [
        { id: 'official-1', title: '官方事件', startsOn: '2026-08-01', category: '海大行事曆' },
        { id: 'personal-calendar-bad', title: '', startsOn: 'not-a-date', category: '個人', source: 'personal' },
      ],
    }))

    expect(store).toEqual({})
    expect(parsePersonalCalendarStore('{broken')).toEqual({})
  })
})
