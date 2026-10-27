import { useEffect, useRef, useState } from 'react'
import { unlockAudio } from '../audio/audioContext'
import { micEngine } from '../audio/micEngine'
import { playNote } from '../audio/synth'
import { emitNote, onPlayedNote, useInputReady } from '../input/inputHub'
import { displayName } from '../music/naming'
import { diatonicIndex, isBlackKey, midiToName, notesMatch } from '../music/notes'
import { useSettings } from '../state/settings'
import { readJson, writeJson } from '../state/store'
import { Icon } from '../ui/icons'
import { ListenGate } from '../ui/ListenGate'
import { keyboardRange, PianoKeyboard, type KeyHighlight } from '../ui/PianoKeyboard'
import { href } from '../ui/router'
import { ScreenHeader, Segmented, Toggle } from '../ui/common'
import { Staff } from '../ui/Staff'

type QuizMode = 'name' | 'staff'
type QuizRange = 'cpos' | 'treble' | 'bass' | 'wide'
const RANGES: Record<QuizRange, { label: string; lo: number; hi: number }> = {
  cpos: { label: 'C to G (middle C position)', lo: 60, hi: 67 },
  treble: { label: 'Right hand: middle C to C5', lo: 60, hi: 72 },
  bass: { label: 'Left hand: C3 to middle C', lo: 48, hi: 60 },
  wide: { label: 'Both: C3 to C5', lo: 48, hi: 72 },
}
const QUESTIONS = 10

function pickNote(range: QuizRange, sharps: boolean, previous: number | null) {
  const { lo, hi } = RANGES[range]
  const pool: number[] = []
  for (let m = lo; m <= hi; m++) if ((sharps || !isBlackKey(m)) && m !== previous) pool.push(m)
  return pool[Math.floor(Math.random() * pool.length)]
}

export function QuizScreen() {
  const settings = useSettings()
  const ready = useInputReady()
  const saved = readJson('quiz', { mode: 'name' as QuizMode, range: 'cpos' as QuizRange, sharps: false })
  const [mode, setMode] = useState<QuizMode>(saved.mode)
  const [range, setRange] = useState<QuizRange>(saved.range)
  const [sharps, setSharps] = useState(saved.sharps)
  const [running, setRunning] = useState(false)
  const [target, setTarget] = useState(60)
  const [question, setQuestion] = useState(0)
  const [score, setScore] = useState({ right: 0, wrong: 0 })
  const [message, setMessage] = useState<{ kind: 'good' | 'bad' | 'info'; text: string } | null>(null)
  const [reveal, setReveal] = useState(false)
  const [flash, setFlash] = useState<Map<number, KeyHighlight>>(new Map())
  const [finished, setFinished] = useState(false)
  const firstTry = useRef(true)
  const locked = useRef(false)

  useEffect(() => {
    writeJson('quiz', { mode, range, sharps })
  }, [mode, range, sharps])
  useEffect(() => {
    micEngine.setRange([RANGES[range].lo, RANGES[range].hi])
    return () => micEngine.setRange(null)
  }, [range])

  const start = () => {
    setScore({ right: 0, wrong: 0 })
    setQuestion(1)
    setTarget(pickNote(range, sharps, null))
    setFinished(false)
    setRunning(true)
    setMessage(null)
    setReveal(false)
    firstTry.current = true
    locked.current = false
  }

  const answer = useRef<(midi: number) => void>(() => {})
  answer.current = (midi: number) => {
    if (!running || finished || locked.current) return
    const played = displayName(midi, settings.noteNaming)
    if (notesMatch(midi, target, settings.anyOctave)) {
      locked.current = true
      if (firstTry.current) setScore((s) => ({ ...s, right: s.right + 1 }))
      setMessage({ kind: 'good', text: `✓ Yes, that's ${displayName(target, settings.noteNaming)}!` })
      setFlash(new Map([[midi, 'correct']]))
      window.setTimeout(() => {
        setFlash(new Map())
        setReveal(false)
        firstTry.current = true
        locked.current = false
        setMessage(null)
        if (question >= QUESTIONS) {
          setFinished(true)
          setRunning(false)
        } else {
          setQuestion((q) => q + 1)
          setTarget((t) => pickNote(range, sharps, t))
        }
      }, 700)
    } else {
      if (firstTry.current) setScore((s) => ({ ...s, wrong: s.wrong + 1 }))
      firstTry.current = false
      setMessage({ kind: 'bad', text: `That was ${played}. Try again!` })
      setFlash(new Map([[midi, 'wrong']]))
      window.setTimeout(() => setFlash(new Map()), 600)
    }
  }
  useEffect(() => onPlayedNote((n) => answer.current(n.midi)), [])

  const { lo, hi } = RANGES[range]
  const [kbLow, kbHigh] = keyboardRange(lo, hi, 10)
  const highlights = new Map(flash)
  if (reveal && running) highlights.set(target, 'next')
  const targetName = midiToName(target, false)
  const d = diatonicIndex(targetName)

  const onKeyTap = (midi: number) => {
    if (settings.keySounds) {
      unlockAudio()
      playNote(midi, 0.5)
    }
    emitNote({ midi, time: performance.now(), source: 'touch' })
  }

  return (
    <div className="screen">
      <ScreenHeader title="Note quiz" back={href('practice')} sub={running ? `Question ${question} of ${QUESTIONS}` : undefined} />
      {!running && !finished && (
        <div className="card stack">
          <p>The app shows a note — find it and play it on your piano (or tap it on the screen).</p>
          <div className="field">
            <span className="field-label">Show the note as</span>
            <Segmented<QuizMode>
              label="Quiz type"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'name', label: 'Its name' },
                { value: 'staff', label: 'On the staff' },
              ]}
            />
          </div>
          <div className="field">
            <span className="field-label">Notes</span>
            <select value={range} onChange={(e) => setRange(e.target.value as QuizRange)} aria-label="Note range">
              {Object.entries(RANGES).map(([k, r]) => (
                <option key={k} value={k}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <Toggle checked={sharps} onChange={setSharps} label="Include black keys" />
          <button className="btn btn-primary btn-big" onClick={start}>
            <Icon name="play" /> Start quiz
          </button>
        </div>
      )}

      {finished && (
        <div className="card stack" style={{ textAlign: 'center' }}>
          <h2>Quiz complete!</h2>
          <div className="result-big">
            {score.right}/{QUESTIONS}
          </div>
          <p className="muted">correct on the first try</p>
          <button className="btn btn-primary btn-big" onClick={start}>
            <Icon name="restart" /> Play again
          </button>
          <button className="btn" onClick={() => setFinished(false)}>
            Change options
          </button>
        </div>
      )}

      {running && (
        <>
          {!ready && <ListenGate compact />}
          <div className="card stack">
            <div className="quiz-prompt muted">{mode === 'name' ? 'Play this note:' : 'Which note is this? Play it:'}</div>
            {mode === 'name' ? (
              <div className="quiz-target">{displayName(target, settings.noteNaming)}</div>
            ) : (
              <div className="quiz-staff">
                <Staff
                  notes={[{ key: target, name: targetName, x: 0, quarters: 1, state: 'pending' }]}
                  scrollX={0}
                  animate={false}
                  showNames={reveal}
                  showFingers={false}
                  naming={settings.noteNaming}
                  rangeD={[Math.min(d, diatonicIndex(midiToName(lo))), Math.max(d, diatonicIndex(midiToName(hi)))]}
                  ariaLabel="Note on the staff"
                />
              </div>
            )}
            <div className={`player-feedback ${message?.kind ?? 'info'}`} role="status" aria-live="polite">
              {message?.text ?? `Score: ${score.right} right, ${score.wrong} wrong`}
            </div>
            <div className="row">
              <button className="btn" style={{ flex: 1 }} onClick={() => setReveal(true)}>
                Show me
              </button>
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={() => {
                  unlockAudio()
                  playNote(target, 0.8)
                }}
              >
                <Icon name="listen" /> Hear it
              </button>
            </div>
          </div>
          <div className="free-keys">
            <PianoKeyboard low={kbLow} high={kbHigh} highlights={highlights} labels={reveal ? 'white' : 'c'} naming={settings.noteNaming} onPress={onKeyTap} />
          </div>
          <button className="btn" onClick={() => setRunning(false)}>
            Stop quiz
          </button>
        </>
      )}
    </div>
  )
}
