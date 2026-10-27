import { useEffect, useRef, useState } from 'react'
import { unlockAudio } from '../audio/audioContext'
import { Metronome } from '../audio/metronome'
import { readJson, writeJson } from '../state/store'
import { Icon } from '../ui/icons'
import { href } from '../ui/router'
import { ScreenHeader, Segmented } from '../ui/common'

const clampBpm = (b: number) => Math.max(30, Math.min(240, Math.round(b)))

function tempoName(bpm: number) {
  if (bpm < 60) return 'Largo (very slow)'
  if (bpm < 76) return 'Adagio (slow)'
  if (bpm < 108) return 'Andante / Moderato (walking pace)'
  if (bpm < 156) return 'Allegro (fast)'
  return 'Presto (very fast)'
}

export function MetronomeScreen() {
  const saved = readJson('metronome', { bpm: 80, beats: 4 })
  const [bpm, setBpm] = useState(saved.bpm)
  const [beats, setBeats] = useState(saved.beats)
  const [running, setRunning] = useState(false)
  const [beat, setBeat] = useState(-1)
  const metro = useRef<Metronome | null>(null)
  const taps = useRef<number[]>([])

  useEffect(() => {
    writeJson('metronome', { bpm, beats })
    if (metro.current) {
      metro.current.bpm = bpm
      metro.current.beatsPerBar = beats
    }
  }, [bpm, beats])

  useEffect(() => () => metro.current?.stop(), [])

  const toggle = async () => {
    if (running) {
      metro.current?.stop()
      setRunning(false)
      setBeat(-1)
      return
    }
    await unlockAudio()
    metro.current ??= new Metronome()
    metro.current.bpm = bpm
    metro.current.beatsPerBar = beats
    metro.current.onBeat = (b) => setBeat(b)
    metro.current.start()
    setRunning(true)
  }

  const tap = () => {
    const now = performance.now()
    taps.current = [...taps.current.filter((t) => now - t < 3000), now].slice(-6)
    if (taps.current.length >= 2) {
      const gaps = taps.current.slice(1).map((t, i) => t - taps.current[i])
      setBpm(clampBpm(60000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length)))
    }
  }

  return (
    <div className="screen">
      <ScreenHeader title="Metronome" back={href('practice')} />
      <div className="card stack" style={{ alignItems: 'stretch' }}>
        <div className="metro-bpm" aria-live="polite">
          {bpm}
          <span className="muted" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
            {' '}
            BPM
          </span>
        </div>
        <div className="muted" style={{ textAlign: 'center' }}>
          {tempoName(bpm)}
        </div>
        <div className="metro-beats" aria-hidden="true">
          {Array.from({ length: beats }, (_, i) => (
            <span key={i} className={`${beat === i ? 'on' : ''}${i === 0 ? ' accent' : ''}`} />
          ))}
        </div>
        <input type="range" min={30} max={240} value={bpm} onChange={(e) => setBpm(clampBpm(Number(e.target.value)))} aria-label="Tempo" />
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" onClick={() => setBpm((b) => clampBpm(b - 5))} aria-label="Slower by 5">
            −5
          </button>
          <button className="btn" onClick={() => setBpm((b) => clampBpm(b - 1))} aria-label="Slower by 1">
            <Icon name="minus" />
          </button>
          <button className="btn" onClick={() => setBpm((b) => clampBpm(b + 1))} aria-label="Faster by 1">
            <Icon name="plus" />
          </button>
          <button className="btn" onClick={() => setBpm((b) => clampBpm(b + 5))} aria-label="Faster by 5">
            +5
          </button>
        </div>
        <div className="field">
          <span className="field-label">Beats per bar</span>
          <Segmented
            label="Beats per bar"
            value={String(beats)}
            onChange={(v) => setBeats(Number(v))}
            options={['2', '3', '4', '6'].map((v) => ({ value: v, label: v }))}
          />
        </div>
        <button className={`btn btn-big ${running ? '' : 'btn-primary'}`} onClick={toggle}>
          <Icon name={running ? 'stop' : 'play'} /> {running ? 'Stop' : 'Start'}
        </button>
        <button className="btn" onClick={tap}>
          Tap to set the tempo
        </button>
      </div>
    </div>
  )
}
