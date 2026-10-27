import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { audioTimeToPerf, getAudioContext, unlockAudio } from '../audio/audioContext'
import { micEngine } from '../audio/micEngine'
import { playClick, playNote } from '../audio/synth'
import { nextLesson, useSong } from '../data/useSong'
import { emitNote, onPlayedNote, startListening, useInputReady, useMicState, midiActive, type PlayedNote } from '../input/inputHub'
import { displayName } from '../music/naming'
import { diatonicIndex } from '../music/notes'
import { TempoSession, timingWindow, WaitSession, type SessionResult } from '../music/session'
import { barCount, barOf, barStartBeat, buildSteps, songRange, stepsInBars, type HandChoice, type Song, type Step } from '../music/song'
import { recordResult, useProgress } from '../state/progress'
import { useSettings } from '../state/settings'
import { Icon } from '../ui/icons'
import { ListenGate } from '../ui/ListenGate'
import { keyboardRange, PianoKeyboard, type KeyHighlight } from '../ui/PianoKeyboard'
import { href, navigate } from '../ui/router'
import { Segmented, Sheet, Stars, Toggle } from '../ui/common'
import { Staff, type StaffNote } from '../ui/Staff'

type Mode = 'wait' | 'tempo'
type Phase = 'setup' | 'countin' | 'playing' | 'results'
interface Feedback {
  kind: 'good' | 'bad' | 'info'
  text: string
}
interface LoopOptions {
  on: boolean
  from: number
  to: number
}

const STEP_SPACING = 32 // staff units between notes in wait mode
const HAND_NAME = { R: 'right hand', L: 'left hand' }

export function LessonScreen({ songId }: { songId: string }) {
  const song = useSong(songId)
  if (!song) {
    return (
      <div className="screen">
        <div className="card stack">
          <h2>Song not found</h2>
          <p className="muted">It may have been deleted.</p>
          <a className="btn btn-primary" href={href()}>
            Back to lessons
          </a>
        </div>
      </div>
    )
  }
  return <LessonPlayer key={song.id} song={song} />
}

function LessonPlayer({ song }: { song: Song }) {
  const settings = useSettings()
  const progress = useProgress()[song.id]
  const ready = useInputReady()
  const mic = useMicState()
  const bars = barCount(song)

  // ---- options ---------------------------------------------------------------
  const [hand, setHand] = useState<HandChoice>(song.hands.length > 1 ? 'both' : song.hands[0])
  const [mode, setMode] = useState<Mode>('wait')
  const [speed, setSpeed] = useState(100)
  const [loop, setLoop] = useState<LoopOptions>({ on: false, from: 1, to: Math.min(bars, 4) })
  const [phase, setPhase] = useState<Phase>('setup')
  const [sheetOpen, setSheetOpen] = useState(true)

  const allSteps = useMemo(() => buildSteps(song.events, hand), [song, hand])
  const steps = useMemo(
    () => (loop.on ? stepsInBars(song, allSteps, Math.min(loop.from, loop.to), Math.max(loop.from, loop.to)) : allSteps),
    [song, allSteps, loop]
  )
  const handEvents = useMemo(() => allSteps.flatMap((s) => s.notes), [allSteps])
  const [lo, hi] = useMemo(() => (handEvents.length ? songRange(handEvents) : [60, 72]), [handEvents])
  const [kbLow, kbHigh] = useMemo(() => keyboardRange(lo, hi, 10), [lo, hi])
  const rangeD = useMemo<[number, number]>(() => {
    const ds = handEvents.map((e) => diatonicIndex(e.name))
    return ds.length ? [Math.min(...ds), Math.max(...ds)] : [28, 36]
  }, [handEvents])

  const bpm = Math.max(10, Math.round((song.bpm * speed) / 100))
  const secondsPerBeat = 60 / bpm
  const originBeat = steps.length
    ? Math.min(steps[0].start, loop.on ? barStartBeat(song, Math.max(1, Math.min(loop.from, loop.to))) : 0)
    : 0
  const minGap = useMemo(() => {
    let g = Infinity
    for (let i = 1; i < steps.length; i++) g = Math.min(g, steps[i].start - steps[i - 1].start)
    return Number.isFinite(g) && g > 0 ? g : 1
  }, [steps])
  const unitsPerBeat = Math.max(40, 26 / minGap)

  // Tell the pitch detector which notes to expect.
  useEffect(() => {
    micEngine.setRange([lo, hi])
    return () => micEngine.setRange(null)
  }, [lo, hi])

  // ---- session state -------------------------------------------------------------
  const waitRef = useRef<WaitSession | null>(null)
  const tempoRef = useRef<TempoSession | null>(null)
  const originPerf = useRef(0)
  const stoppers = useRef<(() => void)[]>([])
  const loopTotals = useRef({ total: 0, correct: 0, wrong: 0, missed: 0, passes: 0 })
  const [, rerender] = useReducer((x: number) => x + 1, 0)
  const [songTime, setSongTime] = useState(0)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [flashes, setFlashes] = useState<Map<number, KeyHighlight>>(new Map())
  const [result, setResult] = useState<(SessionResult & { best: boolean; loop: boolean }) | null>(null)
  const [demoStep, setDemoStep] = useState<number | null>(null)
  const [flashClass, setFlashClass] = useState('')

  const matchOptions = useCallback(
    () => ({ anyOctave: settings.anyOctave, requireAll: midiActive() || mic.status !== 'listening' }),
    [settings.anyOctave, mic.status]
  )

  const stopSounds = () => {
    stoppers.current.forEach((s) => s())
    stoppers.current = []
  }

  const flashKey = useCallback((midi: number, kind: KeyHighlight, ms = 350) => {
    setFlashes((m) => new Map(m).set(midi, kind))
    window.setTimeout(
      () =>
        setFlashes((m) => {
          if (m.get(midi) !== kind) return m
          const n = new Map(m)
          n.delete(midi)
          return n
        }),
      ms
    )
  }, [])

  const flashScreen = (kind: 'good' | 'bad') => {
    setFlashClass('')
    requestAnimationFrame(() => setFlashClass(kind === 'good' ? 'flash-good' : 'flash-bad'))
  }

  // ---- demo playback ("Listen") -------------------------------------------------
  const demoTimer = useRef<number | null>(null)
  const stopDemo = useCallback(() => {
    if (demoTimer.current !== null) cancelAnimationFrame(demoTimer.current)
    demoTimer.current = null
    stopSounds()
    setDemoStep(null)
  }, [])

  const playDemo = async () => {
    if (demoStep !== null) return stopDemo()
    const ctx = await unlockAudio()
    stopSounds()
    const from = waitRef.current && phase === 'playing' ? waitRef.current.index : 0
    const list = steps.slice(from)
    if (!list.length) return
    const start = ctx.currentTime + 0.15
    const base = list[0].start
    const times = list.map((s) => start + (s.start - base) * secondsPerBeat)
    list.forEach((s, i) =>
      s.notes.forEach((n) => stoppers.current.push(playNote(n.midi, Math.max(0.15, n.dur * secondsPerBeat * 0.9), times[i])))
    )
    const end = times[times.length - 1] + list[list.length - 1].notes[0].dur * secondsPerBeat
    const tick = () => {
      const now = getAudioContext().currentTime
      if (now > end) return stopDemo()
      let idx = 0
      while (idx + 1 < times.length && times[idx + 1] <= now) idx++
      setDemoStep(from + idx)
      demoTimer.current = requestAnimationFrame(tick)
    }
    setDemoStep(from)
    demoTimer.current = requestAnimationFrame(tick)
  }

  // ---- start / stop -----------------------------------------------------------
  const finish = useCallback(
    (res: SessionResult, isLoop: boolean) => {
      stopSounds()
      const best = isLoop ? false : recordResult(song.id, res)
      setResult({ ...res, best, loop: isLoop })
      setPhase('results')
      setFeedback(null)
    },
    [song.id]
  )

  const begin = async () => {
    stopDemo()
    setSheetOpen(false)
    setResult(null)
    setFeedback(null)
    loopTotals.current = { total: 0, correct: 0, wrong: 0, missed: 0, passes: 0 }
    if (!ready) await startListening()
    const ctx = await unlockAudio()
    if (!steps.length) return
    if (mode === 'wait') {
      waitRef.current = new WaitSession(steps, matchOptions())
      tempoRef.current = null
      setPhase('playing')
      rerender()
      return
    }
    startTempoPass(ctx, true)
  }

  const startTempoPass = (ctx: AudioContext, countIn: boolean) => {
    stopSounds()
    waitRef.current = null
    tempoRef.current = new TempoSession(steps, {
      ...matchOptions(),
      secondsPerBeat,
      originBeat,
      windowSec: timingWindow(secondsPerBeat),
    })
    const countBeats = countIn ? song.beatsPerBar : 0
    const audioStart = ctx.currentTime + 0.15
    const audioOrigin = audioStart + countBeats * secondsPerBeat
    for (let i = 0; i < countBeats; i++) stoppers.current.push(playClick(audioStart + i * secondsPerBeat, i === 0))
    if (settings.metronomeInTempoMode) {
      const lastBeat = steps[steps.length - 1].start + steps[steps.length - 1].notes[0].dur
      for (let b = Math.ceil(originBeat - 1e-6); b < lastBeat - 1e-6; b++) {
        const accent = (((b - song.pickup) % song.beatsPerBar) + song.beatsPerBar) % song.beatsPerBar === 0
        stoppers.current.push(playClick(audioOrigin + (b - originBeat) * secondsPerBeat, accent))
      }
    }
    originPerf.current = audioTimeToPerf(audioOrigin)
    setSongTime(-countBeats * secondsPerBeat)
    setPhase(countBeats ? 'countin' : 'playing')
  }

  const stop = () => {
    stopSounds()
    stopDemo()
    const lt = loopTotals.current
    const session = waitRef.current ?? tempoRef.current
    if (loop.on && lt.passes > 0 && session) {
      const accuracy = Math.round((lt.correct / Math.max(1, lt.total + lt.wrong * (mode === 'tempo' ? 1 : 0))) * 100)
      finish({ ...lt, accuracy, stars: 0 }, true)
    } else {
      setPhase('setup')
      setFeedback(null)
    }
    waitRef.current = null
    tempoRef.current = null
  }

  const restart = () => {
    stopSounds()
    begin()
  }

  useEffect(() => () => stopSounds(), [])

  // Options changed while practising: go back to the start screen.
  useEffect(() => {
    if (phase !== 'setup' && phase !== 'results') {
      stopSounds()
      waitRef.current = null
      tempoRef.current = null
      setPhase('setup')
    }
  }, [hand, mode, loop, speed])

  // ---- tempo clock ---------------------------------------------------------------
  useEffect(() => {
    if (mode !== 'tempo' || (phase !== 'countin' && phase !== 'playing')) return
    let raf = 0
    const tick = () => {
      const t = (performance.now() - originPerf.current) / 1000
      setSongTime(t)
      const session = tempoRef.current
      if (session) {
        if (t >= 0 && phase === 'countin') setPhase('playing')
        const missed = session.update(t)
        if (missed.length) {
          const last = session.steps[missed[missed.length - 1]]
          setFeedback({ kind: 'bad', text: `Missed ${last.notes.map((n) => displayName(n.name, settings.noteNaming)).join(' + ')}` })
        }
        if (t > session.endTime + 0.3) {
          const res = session.result()
          if (loop.on) {
            const lt = loopTotals.current
            loopTotals.current = { total: lt.total + res.total, correct: lt.correct + res.correct, wrong: lt.wrong + res.wrong, missed: lt.missed + res.missed, passes: lt.passes + 1 }
            setFeedback({ kind: 'info', text: `Loop ${lt.passes + 1} done: ${res.accuracy}%. Again!` })
            startTempoPass(getAudioContext(), true)
          } else {
            finish(res, false)
            return
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode, phase, loop.on])

  // ---- incoming notes -------------------------------------------------------------
  const handleNote = useRef<(n: PlayedNote) => void>(() => {})
  handleNote.current = (n: PlayedNote) => {
    if (demoStep !== null) return
    const name = displayName(n.midi, settings.noteNaming)
    if (phase === 'playing' && mode === 'wait' && waitRef.current) {
      const session = waitRef.current
      const out = session.input(n.midi)
      if (out.kind === 'correct' || out.kind === 'partial') {
        flashKey(n.midi, 'correct')
        if (out.kind === 'correct') {
          flashScreen('good')
          setFeedback({ kind: 'good', text: `✓ ${name}` })
          if (out.finished) {
            const res = session.result()
            if (loop.on) {
              const lt = loopTotals.current
              loopTotals.current = { total: lt.total + res.total, correct: lt.correct + res.correct, wrong: lt.wrong + res.wrong, missed: 0, passes: lt.passes + 1 }
              setFeedback({ kind: 'info', text: `Loop ${lt.passes + 1} done: ${res.accuracy}%. Again!` })
              window.setTimeout(() => {
                if (waitRef.current === session) {
                  waitRef.current = new WaitSession(steps, matchOptions())
                  rerender()
                }
              }, 700)
            } else {
              window.setTimeout(() => finish(res, false), 450)
            }
          }
        }
      } else if (out.kind === 'wrong') {
        flashKey(n.midi, 'wrong', 700)
        flashScreen('bad')
        const want = out.step.notes.map((x) => displayName(x.name, settings.noteNaming)).join(' + ')
        setFeedback({ kind: 'bad', text: `You played ${name} — try ${want}` })
      }
      rerender()
      return
    }
    if ((phase === 'playing' || phase === 'countin') && mode === 'tempo' && tempoRef.current) {
      const t = (n.time - originPerf.current) / 1000
      const out = tempoRef.current.input(n.midi, t)
      if (out.kind === 'hit' || out.kind === 'partial') {
        flashKey(n.midi, 'correct')
        if (out.kind === 'hit') {
          flashScreen('good')
          const off = out.offsetSec
          setFeedback({ kind: 'good', text: Math.abs(off) < 0.08 ? `✓ ${name} — perfect timing` : `✓ ${name} — a bit ${off < 0 ? 'early' : 'late'}` })
        }
      } else {
        flashKey(n.midi, 'wrong', 600)
        flashScreen('bad')
        setFeedback({ kind: 'bad', text: `✗ ${name}` })
      }
      rerender()
      return
    }
    flashKey(n.midi, 'played')
    setFeedback({ kind: 'info', text: `You played ${name}` })
  }
  useEffect(() => onPlayedNote((n) => handleNote.current(n)), [])

  // Clear stale feedback after a moment.
  useEffect(() => {
    if (!feedback) return
    const id = window.setTimeout(() => setFeedback(null), feedback.kind === 'bad' ? 2200 : 1200)
    return () => window.clearTimeout(id)
  }, [feedback])

  // ---- what to show --------------------------------------------------------------
  const tempo = tempoRef.current
  const wait = waitRef.current
  let currentIndex = 0
  if (demoStep !== null) currentIndex = demoStep
  else if (wait) currentIndex = wait.index
  else if (tempo) {
    const w = tempo.options.windowSec
    currentIndex = tempo.times.findIndex((t, i) => tempo.states[i] === 'pending' && t >= songTime - w)
    if (currentIndex < 0) currentIndex = steps.length
  }
  const current: Step | undefined = steps[currentIndex]
  const layoutTime = mode === 'tempo'

  const xOf = useCallback(
    (step: Step) => (layoutTime ? (step.start - originBeat) * unitsPerBeat : step.index * STEP_SPACING),
    [layoutTime, originBeat, unitsPerBeat]
  )

  const staffNotes: StaffNote[] = useMemo(
    () =>
      steps.flatMap((step) =>
        step.notes.map((n) => {
          let state: StaffNote['state'] = 'pending'
          if (step.index === currentIndex) state = 'current'
          else if (tempo && phase !== 'setup') state = tempo.states[step.index] === 'hit' ? 'hit' : tempo.states[step.index] === 'missed' ? 'missed' : 'pending'
          else if (wait && step.index < currentIndex) state = 'hit'
          return {
            key: `${step.index}-${n.id}`,
            name: n.name,
            x: xOf(step),
            quarters: (n.dur * 4) / song.beatUnit,
            finger: n.finger,
            state,
          }
        })
      ),
    // tempo/wait live in refs: `currentIndex`, `phase` and `flashes` changes trigger the refresh we need
    [steps, currentIndex, xOf, song.beatUnit, phase, tempo, wait, flashes]
  )

  const barXs = useMemo(() => {
    const xs: number[] = []
    if (layoutTime) {
      const lastBeat = steps.length ? steps[steps.length - 1].start : 0
      for (let b = 1; b <= bars + 1; b++) {
        const beat = barStartBeat(song, b)
        if (beat > originBeat + 1e-6 && beat <= lastBeat + 1e-6) xs.push((beat - originBeat) * unitsPerBeat - unitsPerBeat * 0.3)
      }
    } else {
      for (let i = 1; i < steps.length; i++) {
        if (barOf(song, steps[i].start) !== barOf(song, steps[i - 1].start)) xs.push((xOf(steps[i]) + xOf(steps[i - 1])) / 2)
      }
    }
    return xs
  }, [layoutTime, steps, song, bars, originBeat, unitsPerBeat, xOf])

  const scrollX = layoutTime && tempo ? (songTime / secondsPerBeat) * unitsPerBeat : current ? xOf(current) : steps.length ? xOf(steps[steps.length - 1]) + STEP_SPACING : 0

  const highlights = new Map<number, KeyHighlight>()
  const fingers = new Map<number, number>()
  if (current && phase !== 'results') {
    for (const n of current.notes) {
      highlights.set(n.midi, demoStep !== null ? 'demo' : 'next')
      if (settings.showFingers && n.finger) fingers.set(n.midi, n.finger)
    }
  }
  flashes.forEach((kind, midi) => highlights.set(midi, kind))

  const doneCount = wait ? wait.index : tempo ? tempo.states.filter((s) => s !== 'pending').length : 0
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0

  let prompt: Feedback
  if (feedback) prompt = feedback
  else if (demoStep !== null) prompt = { kind: 'info', text: 'Listen…' }
  else if (phase === 'countin') prompt = { kind: 'info', text: 'Get ready…' }
  else if (phase === 'playing' && current) {
    const n = current.notes[0]
    const finger = settings.showFingers && n.finger ? `, finger ${n.finger}` : ''
    const handText = song.hands.length > 1 || n.hand === 'L' ? ` (${HAND_NAME[n.hand]}${finger})` : finger ? ` (${finger.slice(2)})` : ''
    prompt = { kind: 'info', text: `Play ${current.notes.map((x) => displayName(x.name, settings.noteNaming)).join(' + ')}${handText}` }
  } else if (!steps.length) prompt = { kind: 'bad', text: 'No notes for this hand in the chosen bars' }
  else prompt = { kind: 'info', text: 'Press Start when you are ready' }

  const countdown = phase === 'countin' ? Math.ceil(-songTime / secondsPerBeat) : 0

  const onKeyTap = (midi: number) => {
    if (settings.keySounds) {
      unlockAudio()
      playNote(midi, 0.5)
    }
    emitNote({ midi, time: performance.now(), source: 'touch' })
  }

  const next = nextLesson(song.id)

  return (
    <div className={`player ${flashClass}`} onAnimationEnd={() => setFlashClass('')}>
      <div className="player-top">
        <a className="icon-btn" href={href()} aria-label="Back to lessons" onClick={() => stopSounds()}>
          <Icon name="back" />
        </a>
        <div className="player-title">
          <h1>{song.title}</h1>
          <div className="muted">
            {mode === 'wait' ? 'Wait mode' : `Tempo ${bpm} BPM`} · {hand === 'both' ? 'Both hands' : hand === 'R' ? 'Right hand' : 'Left hand'}
            {loop.on ? ` · Bars ${Math.min(loop.from, loop.to)}–${Math.max(loop.from, loop.to)}` : ''}
          </div>
        </div>
        <button className="icon-btn" aria-label="Lesson options" onClick={() => setSheetOpen(true)}>
          <Icon name="settings" />
        </button>
      </div>
      <div className="progress" aria-label={`Progress ${pct}%`}>
        <div style={{ width: `${pct}%` }} />
      </div>

      {!ready && phase !== 'setup' && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <span className="muted small">Not listening — you can tap the keys below, or</span>
          <button className="btn btn-soft" style={{ minHeight: 40 }} onClick={() => startListening()}>
            <Icon name="mic" /> Start listening
          </button>
        </div>
      )}

      <div className="player-staff">
        <Staff
          notes={staffNotes}
          bars={barXs}
          scrollX={scrollX}
          animate={!layoutTime}
          showNames={settings.showNoteNames}
          showFingers={settings.showFingers}
          naming={settings.noteNaming}
          rangeD={rangeD}
          ariaLabel={current ? `Next note ${displayName(current.notes[0].name, settings.noteNaming)}` : 'Music staff'}
        />
        {countdown > 0 && <div className="countin">{countdown}</div>}
      </div>

      <div className="player-bar">
        <div className={`player-feedback ${prompt.kind}`} role="status" aria-live="polite">
          {prompt.text}
        </div>

      <div className="player-controls">
        {phase === 'setup' || phase === 'results' ? (
          <>
            <button className="btn" onClick={playDemo} disabled={!steps.length}>
              <Icon name={demoStep !== null ? 'stop' : 'listen'} /> {demoStep !== null ? 'Stop' : 'Listen'}
            </button>
            <button className="btn btn-primary" onClick={begin} disabled={!steps.length}>
              <Icon name="play" /> Start
            </button>
          </>
        ) : (
          <>
            <button className="btn" onClick={stop}>
              <Icon name="stop" /> Stop
            </button>
            <button className="btn" onClick={restart}>
              <Icon name="restart" /> Restart
            </button>
            {mode === 'wait' && (
              <button className="btn" onClick={playDemo}>
                <Icon name={demoStep !== null ? 'stop' : 'listen'} /> {demoStep !== null ? 'Stop' : 'Hear it'}
              </button>
            )}
          </>
        )}
      </div>
      </div>

      <div className="player-keys">
        <PianoKeyboard
          low={kbLow}
          high={kbHigh}
          highlights={highlights}
          fingers={fingers}
          labels={settings.showNoteNames ? 'white' : 'c'}
          naming={settings.noteNaming}
          onPress={onKeyTap}
        />
      </div>

      {sheetOpen && phase === 'setup' && (
        <Sheet label="Lesson options" onClose={() => setSheetOpen(false)}>
          <div>
            <h2>{song.title}</h2>
            {song.composer && <div className="muted small">{song.composer}</div>}
          </div>
          {progress && (
            <div className="row">
              <Stars count={progress.stars} />
              <span className="muted small">Best {progress.bestAccuracy}%</span>
            </div>
          )}
          {song.intro && <p>{song.intro}</p>}
          {song.tips.length > 0 && (
            <ul className="muted small" style={{ margin: 0, paddingLeft: 20 }}>
              {song.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
          <ListenGate compact />

          {song.hands.length > 1 && (
            <div className="field">
              <span className="field-label">Hands</span>
              <Segmented<HandChoice>
                label="Hands"
                value={hand}
                onChange={setHand}
                options={[
                  { value: 'R', label: 'Right' },
                  { value: 'L', label: 'Left' },
                  { value: 'both', label: 'Both' },
                ]}
              />
            </div>
          )}
          <div className="field">
            <span className="field-label">Mode</span>
            <Segmented<Mode>
              label="Mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'wait', label: 'Wait for me' },
                { value: 'tempo', label: 'Play in time' },
              ]}
            />
            <span className="field-help">
              {mode === 'wait'
                ? 'The song waits until you play the right note. Best for learning.'
                : 'Notes move at a steady speed with a metronome, and you get a score for playing on time.'}
            </span>
          </div>
          <div className="field">
            <span className="field-label">
              <span>Speed</span>
              <span className="muted">
                {speed}% · {bpm} BPM
              </span>
            </span>
            <input type="range" min={30} max={150} step={5} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Speed" />
          </div>
          {bars > 1 && (
            <div className="field">
              <Toggle checked={loop.on} onChange={(on) => setLoop((l) => ({ ...l, on }))} label="Loop a section" help="Repeat a few bars over and over." />
              {loop.on && (
                <div className="row">
                  <label className="row" style={{ flex: 1 }}>
                    From bar
                    <select value={loop.from} onChange={(e) => setLoop((l) => ({ ...l, from: Number(e.target.value) }))}>
                      {Array.from({ length: bars }, (_, i) => (
                        <option key={i} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="row" style={{ flex: 1 }}>
                    to
                    <select value={loop.to} onChange={(e) => setLoop((l) => ({ ...l, to: Number(e.target.value) }))}>
                      {Array.from({ length: bars }, (_, i) => (
                        <option key={i} value={i + 1}>
                          {i + 1}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}
          <div className="row">
            <button className="btn" style={{ flex: 1 }} onClick={playDemo} disabled={!steps.length}>
              <Icon name={demoStep !== null ? 'stop' : 'listen'} /> {demoStep !== null ? 'Stop' : 'Listen first'}
            </button>
            <button className="btn btn-primary btn-big" style={{ flex: 2 }} onClick={begin} disabled={!steps.length}>
              <Icon name="play" /> Start
            </button>
          </div>
        </Sheet>
      )}

      {phase === 'results' && result && (
        <Sheet label="Results" onClose={() => setPhase('setup')}>
          <h2 style={{ textAlign: 'center' }}>{result.loop ? 'Loop practice' : result.accuracy >= 90 ? 'Brilliant!' : result.accuracy >= 70 ? 'Well done!' : 'Lesson complete'}</h2>
          {!result.loop && (
            <div style={{ textAlign: 'center' }}>
              <Stars count={result.stars} big />
            </div>
          )}
          <div className="result-big">{result.accuracy}%</div>
          <p className="muted" style={{ textAlign: 'center' }}>
            {result.loop
              ? `${loopTotals.current.passes} loop${loopTotals.current.passes === 1 ? '' : 's'} played. Loop practice isn't saved as a score.`
              : mode === 'wait'
                ? 'Notes played right the first time'
                : 'Accuracy (on-time notes, minus wrong notes)'}
            {result.best && ' · New best!'}
          </p>
          <div className="result-grid">
            <div>
              <strong>{result.correct}</strong>
              <span className="muted small">correct</span>
            </div>
            <div>
              <strong>{result.wrong}</strong>
              <span className="muted small">wrong</span>
            </div>
            <div>
              <strong>{mode === 'tempo' ? result.missed : result.total}</strong>
              <span className="muted small">{mode === 'tempo' ? 'missed' : 'notes'}</span>
            </div>
          </div>
          {result.accuracy < 70 && !result.loop && (
            <p className="small muted">
              Tip: {mode === 'tempo' ? 'try a slower speed, or practise in "Wait for me" mode first.' : 'go slowly and watch the blue key. If the app hears wrong notes you did not play, see Help.'}
            </p>
          )}
          <div className="stack">
            <button className="btn btn-primary btn-big" onClick={restart}>
              <Icon name="restart" /> Play again
            </button>
            {next && !song.imported && (
              <button className="btn btn-soft btn-big" onClick={() => navigate('lesson', next.id)}>
                Next: {next.title}
              </button>
            )}
            <a className="btn" href={href()}>
              Back to lessons
            </a>
          </div>
        </Sheet>
      )}
    </div>
  )
}
