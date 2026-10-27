import { useEffect, useState } from 'react'
import { unlockAudio } from '../audio/audioContext'
import { micEngine } from '../audio/micEngine'
import { gateToSensitivity, sensitivityToGate, type LiveReading } from '../audio/noteTracker'
import { playNote } from '../audio/synth'
import { toDecibels } from '../audio/yin'
import { emitNote, onPlayedNote, useInputReady, useMicState, type PlayedNote } from '../input/inputHub'
import { displayName } from '../music/naming'
import { updateSettings, useSettings } from '../state/settings'
import { Icon } from '../ui/icons'
import { ListenGate, MicPill } from '../ui/ListenGate'
import { PianoKeyboard, type KeyHighlight } from '../ui/PianoKeyboard'
import { ScreenHeader } from '../ui/common'

const DB_MIN = -70
const DB_MAX = -10
const dbToPct = (db: number) => Math.max(0, Math.min(100, ((db - DB_MIN) / (DB_MAX - DB_MIN)) * 100))

export function FreePlayScreen() {
  const settings = useSettings()
  const ready = useInputReady()
  const mic = useMicState()
  const [live, setLive] = useState<LiveReading>(micEngine.live)
  const [history, setHistory] = useState<PlayedNote[]>([])
  const [lastNote, setLastNote] = useState<PlayedNote | null>(null)
  const [calibrating, setCalibrating] = useState(false)
  const [calMsg, setCalMsg] = useState('')
  const [quietFor, setQuietFor] = useState(0)

  useEffect(() => micEngine.onFrame(setLive), [])
  useEffect(
    () =>
      onPlayedNote((n) => {
        setLastNote(n)
        setHistory((h) => [n, ...h].slice(0, 12))
      }),
    []
  )
  // Offer help if we've been listening a while without hearing a note.
  useEffect(() => {
    if (mic.status !== 'listening') return setQuietFor(0)
    const id = window.setInterval(() => setQuietFor((q) => q + 1), 1000)
    return () => window.clearInterval(id)
  }, [mic.status])
  useEffect(() => setQuietFor(0), [lastNote])

  const levelDb = toDecibels(live.level)
  const gateDb = toDecibels(sensitivityToGate(settings.sensitivity))
  const shownMidi = live.active && live.midi !== null ? live.midi : lastNote?.midi ?? null
  const isLive = live.active && live.midi !== null
  const name = shownMidi !== null ? displayName(shownMidi, settings.noteNaming, false) : '–'
  const octave = shownMidi !== null ? Math.floor(shownMidi / 12) - 1 : ''
  const cents = isLive ? Math.max(-50, Math.min(50, live.cents)) : 0

  const highlights = new Map<number, KeyHighlight>()
  if (shownMidi !== null) highlights.set(shownMidi, 'played')

  const calibrate = async () => {
    setCalibrating(true)
    setCalMsg('Stay quiet for 2 seconds…')
    try {
      const gate = await micEngine.measureNoise(2000)
      const sensitivity = gateToSensitivity(gate)
      updateSettings({ sensitivity })
      setCalMsg(`Done! Sensitivity set to ${sensitivity}. Now play a note.`)
    } catch (e) {
      setCalMsg((e as Error).message)
    } finally {
      setCalibrating(false)
    }
  }

  const onKeyTap = (midi: number) => {
    unlockAudio()
    playNote(midi, 0.6)
    emitNote({ midi, time: performance.now(), source: 'touch' })
  }

  return (
    <div className="screen">
      <ScreenHeader title="Free Play" sub="Play anything: the app shows the note it hears." right={<MicPill />} />
      {!ready && <ListenGate />}

      <div className="card">
        <div className="big-note-display" aria-live="polite">
          <div className={`name${shownMidi === null ? ' idle' : ''}`}>
            {name}
            <span className="octave">{octave}</span>
          </div>
          <div className="muted">
            {isLive ? `${live.frequency.toFixed(1)} Hz · ${cents >= 0 ? '+' : ''}${Math.round(cents)} cents` : ready ? 'Play a key on your piano' : ' '}
          </div>
        </div>
        <div className="tuner" aria-hidden="true">
          <div className="scale" />
          <div className="center" />
          <div className="needle" style={{ left: `${50 + cents}%`, opacity: isLive ? 1 : 0.25 }} />
        </div>
        <div className="row small muted" style={{ justifyContent: 'space-between' }}>
          <span>flat</span>
          <span>in tune</span>
          <span>sharp</span>
        </div>
      </div>

      <div className="free-keys">
        <PianoKeyboard low={48} high={83} highlights={highlights} labels="c" naming={settings.noteNaming} onPress={onKeyTap} />
      </div>

      <div className="card stack">
        <div className="field">
          <span className="field-label">
            <span>Microphone level</span>
            <span className="muted small">{Number.isFinite(levelDb) ? `${Math.round(levelDb)} dB` : ''}</span>
          </span>
          <div className="meter" aria-hidden="true">
            <div className="fill" style={{ width: `${dbToPct(levelDb)}%`, background: levelDb >= gateDb ? 'var(--good)' : 'var(--muted)' }} />
            <div className="gate-line" style={{ left: `${dbToPct(gateDb)}%` }} />
          </div>
          <span className="field-help">
            Notes are only heard when the bar goes past the black line. When the room is quiet the bar should stay to the left of it.
          </span>
        </div>
        <div className="field">
          <span className="field-label">
            <span>Sensitivity</span>
            <span className="muted">{settings.sensitivity}</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={settings.sensitivity}
            onChange={(e) => updateSettings({ sensitivity: Number(e.target.value) })}
            aria-label="Microphone sensitivity"
          />
          <button className="btn btn-soft" disabled={!micEngine.listening || calibrating} onClick={calibrate}>
            <Icon name="wave" /> {calibrating ? 'Listening to the room…' : 'Auto-adjust to my room'}
          </button>
          {calMsg && <span className="field-help">{calMsg}</span>}
        </div>
      </div>

      {quietFor >= 8 && (
        <div className="card help-box">
          <strong>Not hearing your piano?</strong>
          <ul>
            <li>Move the phone closer (on the music stand is ideal) with the bottom of the phone facing the piano.</li>
            <li>Play a little louder, or raise the Sensitivity slider.</li>
            <li>Digital piano? Make sure its volume is up and headphones are unplugged.</li>
          </ul>
        </div>
      )}

      <div className="card">
        <h2>Recent notes</h2>
        <div className="history">
          {history.length === 0 ? (
            <span className="muted" style={{ background: 'none' }}>
              Nothing yet
            </span>
          ) : (
            history.map((h, i) => <span key={`${h.time}-${i}`}>{displayName(h.midi, settings.noteNaming)}</span>)
          )}
        </div>
      </div>
    </div>
  )
}
