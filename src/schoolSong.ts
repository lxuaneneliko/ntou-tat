export type SchoolSongLyric = {
  start: number
  text: string
}

export const SCHOOL_SONG_AUDIO = '/audio/ntou-school-song.m4a'

export const SCHOOL_SONG_LYRICS: SchoolSongLyric[] = [
  { start: 0, text: '♪ 前奏' },
  { start: 5.31, text: '日月光華，照我學宮，承先啟後，樹德如松。' },
  { start: 13.77, text: '勉哉濟濟多士，涵養誠樸博毅，允文允武志向崇。' },
  { start: 22.37, text: '豪情干雲霄，為國為民做先鋒；壯志凌寰宇，掌握機運風雲中。' },
  { start: 37.39, text: '濱海其偉，龍崗蔥蘢，謙謙君子，嘉祐祥豐。' },
  { start: 45.93, text: '攜手海洋沐春風，大道之行樂融融。' },
]

export function activeSchoolSongLyricIndex(time: number, lyrics = SCHOOL_SONG_LYRICS) {
  if (!lyrics.length) return -1

  for (let index = lyrics.length - 1; index >= 0; index -= 1) {
    if (time >= lyrics[index].start) return index
  }

  return 0
}

export function formatSchoolSongTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const wholeSeconds = Math.floor(seconds)
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`
}
