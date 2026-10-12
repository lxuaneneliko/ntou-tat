import { describe, expect, it } from 'vitest'
import { appearancePresets, defaultAppearance, presetAppearance } from './appearance'
import { calendarContrast, createCalendarPalette } from './calendarPalette'

describe('calendar theme palette', () => {
  it('keeps event and course text readable in every light and dark preset', () => {
    for (const preset of appearancePresets) for (const mode of ['dark', 'light'] as const) {
      const appearance = presetAppearance(preset.id, mode)
      const palette = createCalendarPalette(appearance)
      for (const tone of [palette.official, palette.personal, ...['ME101', 'ME102', 'ME103', 'ME104'].map(palette.course)]) {
        expect(calendarContrast(tone.background, tone.foreground)).toBeGreaterThanOrEqual(4.5)
        expect(calendarContrast(tone.background, tone.marker)).toBeGreaterThanOrEqual(3)
      }
      expect(calendarContrast(palette.cell, palette.ink)).toBeGreaterThanOrEqual(4.5)
      expect(calendarContrast(palette.outside, palette.outsideInk)).toBeGreaterThanOrEqual(4.5)
      expect(calendarContrast(palette.selectedDate, palette.selectedDateInk)).toBeGreaterThanOrEqual(4.5)
      expect(calendarContrast(palette.cell, palette.today)).toBeGreaterThanOrEqual(3)
    }
  })

  it('changes all event tints with the selected theme and distinguishes personal events', () => {
    const blue = createCalendarPalette(presetAppearance('harbor', 'dark'))
    const coral = createCalendarPalette(presetAppearance('coral', 'dark'))
    expect(blue.official.background).not.toBe(coral.official.background)
    expect(blue.personal.background).not.toBe(coral.personal.background)
    expect(blue.course('ME101').background).not.toBe(coral.course('ME101').background)
    expect(blue.official.background).not.toBe(blue.personal.background)
    expect(blue.selected).not.toBe(blue.cell)
    expect(blue.outside).not.toBe(blue.cell)
    expect(blue.official.background).not.toBe('#167b4b')
    expect(blue.personal.background).not.toBe('#8560bc')
  })

  it('provides deterministic course tints without using timetable rainbow colors', () => {
    const palette = createCalendarPalette(defaultAppearance)
    expect(palette.course('ME101')).toEqual(palette.course('ME101'))
    expect(palette.course('ME101').background).not.toBe(palette.course('ME102').background)
  })

  it('retains readable text and visible markers for low-contrast custom colors', () => {
    for (const background of ['#ffffff', '#000000', '#777777']) for (const button of ['#ffffff', '#000000', '#777777']) {
      const palette = createCalendarPalette({ ...defaultAppearance, background, button, text: background })
      for (const tone of [palette.official, palette.personal, palette.course('custom')]) {
        expect(calendarContrast(tone.background, tone.foreground)).toBeGreaterThanOrEqual(4.5)
        expect(calendarContrast(tone.background, tone.marker)).toBeGreaterThanOrEqual(3)
      }
      expect(calendarContrast(palette.selectedDate, palette.selectedDateInk)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
