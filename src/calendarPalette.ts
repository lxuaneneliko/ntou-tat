import type { Appearance } from './appearance'

export type CalendarTone = { background: string; foreground: string; marker: string }

const blend = (base: string, tint: string, amount: number) => '#' + [1, 3, 5].map((index) => Math.round(parseInt(base.slice(index, index + 2), 16) * (1 - amount) + parseInt(tint.slice(index, index + 2), 16) * amount).toString(16).padStart(2, '0')).join('')
const luminance = (hex: string) => [1, 3, 5].map((index) => {
  const channel = parseInt(hex.slice(index, index + 2), 16) / 255
  return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4
}).reduce((sum, channel, index) => sum + channel * [.2126, .7152, .0722][index], 0)

export const calendarContrast = (first: string, second: string) => {
  const firstLuminance = luminance(first), secondLuminance = luminance(second)
  return (Math.max(firstLuminance, secondLuminance) + .05) / (Math.min(firstLuminance, secondLuminance) + .05)
}

const readableInk = (background: string, preferred: string) => {
  if (calendarContrast(background, preferred) >= 4.5) return preferred
  const dark = '#10212b', white = '#ffffff'
  if (calendarContrast(background, dark) >= 4.5) return dark
  return calendarContrast(background, white) >= 4.5 ? white : '#000000'
}

const visibleMarker = (background: string, accent: string) => {
  if (calendarContrast(background, accent) >= 3) return accent
  const target = luminance(background) > .179 ? '#000000' : '#ffffff'
  for (let amount = .05; amount <= 1; amount += .05) {
    const candidate = blend(accent, target, amount)
    if (calendarContrast(background, candidate) >= 3) return candidate
  }
  return target
}

/** Calendar colors follow the active theme; source and course identity vary the tint, not the hue. */
export function createCalendarPalette(appearance: Appearance) {
  const dark = appearance.mode === 'dark'
  const cell = blend(appearance.background, '#ffffff', dark ? .045 : .65)
  const outside = blend(cell, appearance.background, .75)
  const selected = blend(cell, appearance.button, dark ? .12 : .07)
  const tone = (amount: number, marker = appearance.button): CalendarTone => {
    const background = blend(cell, appearance.button, amount)
    return { background, foreground: readableInk(background, appearance.text), marker: visibleMarker(background, marker) }
  }
  const official = tone(dark ? .3 : .18)
  const personal = tone(dark ? .17 : .1, blend(appearance.button, appearance.text, .3))
  return {
    cell, outside, selected,
    ink: readableInk(cell, appearance.text),
    outsideInk: readableInk(outside, blend(appearance.text, outside, .28)),
    today: visibleMarker(cell, appearance.button),
    selectedDate: appearance.button,
    selectedDateInk: readableInk(appearance.button, appearance.text),
    official, personal,
    course: (identity: string): CalendarTone => {
      const hash = [...identity].reduce((value, character) => (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0, 0)
      return tone((dark ? .13 : .08) + (hash % 4) * .035)
    },
  }
}
