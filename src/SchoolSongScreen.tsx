import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Music2, Pause, Play, RotateCcw } from 'lucide-react'
import {
  activeSchoolSongLyricIndex,
  formatSchoolSongTime,
  SCHOOL_SONG_AUDIO,
  SCHOOL_SONG_LYRICS,
} from './schoolSong'

export type SchoolSongScreenHandle = {
  togglePlayback: () => void
}

type SchoolSongScreenProps = {
  onPlayingChange: (playing: boolean) => void
}

export const SchoolSongScreen = forwardRef<SchoolSongScreenHandle, SchoolSongScreenProps>(
  function SchoolSongScreen({ onPlayingChange }, ref) {
    const audioRef = useRef<HTMLAudioElement>(null)
    const lyricRefs = useRef<Array<HTMLButtonElement | null>>([])
    const [currentTime, setCurrentTime] = useState(0)
    const [duration, setDuration] = useState(0)
    const [playing, setPlaying] = useState(false)
    const [audioError, setAudioError] = useState('')
    const activeLyric = activeSchoolSongLyricIndex(currentTime)

    const play = async () => {
      const audio = audioRef.current
      if (!audio) return
      if (audio.ended || (audio.duration && audio.currentTime >= audio.duration - 0.2)) audio.currentTime = 0
      setAudioError('')
      try {
        await audio.play()
      } catch {
        setAudioError('無法開始播放，請再按一次播放鍵')
      }
    }

    const togglePlayback = () => {
      const audio = audioRef.current
      if (!audio) return
      if (audio.paused) void play()
      else audio.pause()
    }

    useImperativeHandle(ref, () => ({ togglePlayback }))

    useEffect(() => {
      lyricRefs.current[activeLyric]?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      })
    }, [activeLyric])

    useEffect(() => {
      onPlayingChange(playing)
    }, [onPlayingChange, playing])

    useEffect(() => () => {
      audioRef.current?.pause()
      onPlayingChange(false)
    }, [onPlayingChange])

    const seek = (seconds: number) => {
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = seconds
      setCurrentTime(seconds)
    }

    return (
      <section className={`school-song-screen ${playing ? 'is-playing' : ''}`}>
        <audio
          ref={audioRef}
          preload="metadata"
          src={SCHOOL_SONG_AUDIO}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setAudioError('校歌音檔載入失敗，請重新開啟此頁')}
        />

        <div className="school-song-hero">
          <div className="school-song-emblem" aria-hidden="true">
            <Music2 size={34} />
            <i /><i /><i />
          </div>
          <div className="school-song-intro">
            <span>國立臺灣海洋大學</span>
            <h2>海大校歌</h2>
            <p>中等速・激昂進行曲</p>
          </div>
          <div className="school-song-credits">
            <span>張長臺 作詞</span>
            <span>黃友棣 作曲</span>
          </div>
        </div>

        <div className="school-song-player">
          <button
            className="school-song-play"
            type="button"
            aria-label={playing ? '暫停校歌' : '播放校歌'}
            onClick={togglePlayback}
          >
            {playing ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
          </button>
          <div className="school-song-timeline">
            <input
              type="range"
              min="0"
              max={duration || 53.9}
              step="0.1"
              value={Math.min(currentTime, duration || 53.9)}
              aria-label="校歌播放進度"
              onChange={(event) => seek(Number(event.target.value))}
            />
            <div><span>{formatSchoolSongTime(currentTime)}</span><span>{formatSchoolSongTime(duration)}</span></div>
          </div>
          <button className="school-song-replay" type="button" aria-label="從頭播放" onClick={() => {
            seek(0)
            void play()
          }}>
            <RotateCcw size={19} />
          </button>
        </div>

        {audioError ? <p className="school-song-error" role="alert">{audioError}</p> : null}

        <div className="school-song-lyrics" aria-live="polite">
          {SCHOOL_SONG_LYRICS.map((line, index) => (
            <button
              ref={(node) => { lyricRefs.current[index] = node }}
              className={index === activeLyric ? 'active' : index < activeLyric ? 'passed' : ''}
              type="button"
              key={`${line.start}-${line.text}`}
              aria-current={index === activeLyric ? 'true' : undefined}
              onClick={() => seek(line.start)}
            >
              {line.text}
            </button>
          ))}
        </div>

        <p className="school-song-source">人聲演唱版與歌詞取自海大官方網站，音檔已內建，可離線播放。</p>
      </section>
    )
  },
)
