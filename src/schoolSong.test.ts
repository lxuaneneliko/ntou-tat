import { describe, expect, it } from 'vitest'
import {
  activeSchoolSongLyricIndex,
  formatSchoolSongTime,
  SCHOOL_SONG_LYRICS,
} from './schoolSong'

describe('school song lyric timing', () => {
  it('selects the latest lyric whose timestamp has passed', () => {
    const lyrics = [
      { start: 0, text: 'intro' },
      { start: 3, text: 'first' },
      { start: 8, text: 'second' },
    ]

    expect(activeSchoolSongLyricIndex(0, lyrics)).toBe(0)
    expect(activeSchoolSongLyricIndex(2.99, lyrics)).toBe(0)
    expect(activeSchoolSongLyricIndex(3, lyrics)).toBe(1)
    expect(activeSchoolSongLyricIndex(99, lyrics)).toBe(2)
  })

  it('formats playback time without leaking invalid values', () => {
    expect(formatSchoolSongTime(0)).toBe('0:00')
    expect(formatSchoolSongTime(65.8)).toBe('1:05')
    expect(formatSchoolSongTime(Number.NaN)).toBe('0:00')
  })

  it('keeps the prelude active until the singing begins', () => {
    expect(activeSchoolSongLyricIndex(5.3, SCHOOL_SONG_LYRICS)).toBe(0)
    expect(activeSchoolSongLyricIndex(5.31, SCHOOL_SONG_LYRICS)).toBe(1)
  })
})
