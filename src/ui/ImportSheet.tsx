import { useMemo, useRef, useState } from 'react'
import { unlockAudio } from '../audio/audioContext'
import { playNote } from '../audio/synth'
import { guessParts, listParts, midiToSong, type MidiFileData } from '../music/midiFile'
import { displayName } from '../music/naming'
import { noteToMidi } from '../music/notes'
import { addImportedSong } from '../state/importedSongs'
import { useSettings } from '../state/settings'
import { Icon } from './icons'
import { navigate } from './router'
import { Sheet } from './common'

/**
 * Lets the user choose which instrument part of a MIDI file is the tune
 * (e.g. the singer's line in a band arrangement) before adding it as a song.
 */
export function ImportSheet({ data, fileName, onClose }: { data: MidiFileData; fileName: string; onClose: () => void }) {
  const settings = useSettings()
  const parts = useMemo(() => listParts(data), [data])
  const guess = useMemo(() => guessParts(parts), [parts])
  const [melody, setMelody] = useState(guess.melody)
  const [left, setLeft] = useState<string | null>(guess.left)
  const [title, setTitle] = useState(fileName.replace(/\.(mid|midi|kar)$/i, '').replace(/[_-]+/g, ' ').trim())
  const [error, setError] = useState('')
  const stops = useRef<(() => void)[]>([])

  const preview = async () => {
    stops.current.forEach((s) => s())
    stops.current = []
    try {
      const ctx = await unlockAudio()
      const json = midiToSong(data, fileName, { melody, left: null })
      const spb = 60 / json.bpm
      const t0 = ctx.currentTime + 0.1
      const first = json.notes[0].start ?? 0
      for (const n of json.notes.slice(0, 24)) {
        stops.current.push(playNote(noteToMidi(n.note as string), Math.min(1.5, n.dur * spb), t0 + ((n.start ?? 0) - first) * spb))
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const add = () => {
    try {
      const json = midiToSong(data, fileName, { melody, left, title })
      addImportedSong(json)
      stops.current.forEach((s) => s())
      onClose()
      navigate('lesson', json.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const describe = (id: string) => {
    const p = parts.find((x) => x.id === id)!
    return `${p.instrument} · ${p.notes.length} notes · ${displayName(p.low, settings.noteNaming)}–${displayName(p.high, settings.noteNaming)}`
  }

  return (
    <Sheet label="Import a song" onClose={onClose}>
      <h2>Import a song</h2>
      <label className="field">
        <span className="field-label">Song name</span>
        <input className="search" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} />
      </label>

      <div className="field">
        <span className="field-label">Which part is the tune?</span>
        <span className="field-help">Usually the singer (vocals) or the top line of the piano. Use "Hear it" to check.</span>
        <div className="lesson-list">
          {parts.map((p) => (
            <label key={p.id} className="lesson-item" style={{ cursor: 'pointer' }}>
              <input type="radio" name="melody" checked={melody === p.id} onChange={() => setMelody(p.id)} style={{ width: 22, height: 22 }} />
              <span className="lesson-text">
                <span className="lesson-title">
                  {p.name}
                  {p.id === guess.melody ? ' (suggested)' : ''}
                </span>
                <span className="lesson-meta" style={{ display: 'block' }}>
                  {describe(p.id)}
                </span>
              </span>
            </label>
          ))}
        </div>
        <button className="btn" onClick={preview}>
          <Icon name="listen" /> Hear the first notes of this part
        </button>
      </div>

      <label className="field">
        <span className="field-label">Left hand</span>
        <select value={left ?? ''} onChange={(e) => setLeft(e.target.value || null)}>
          <option value="">None: just play the tune (easiest)</option>
          {parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === melody ? `${p.name}: lower notes of the same part` : p.name}
            </option>
          ))}
        </select>
      </label>

      {error && <div className="pill bad" style={{ whiteSpace: 'normal' }}>{error}</div>}
      <p className="muted small">Chords are simplified to single notes and the tune is moved near middle C. The song is saved only on this device.</p>
      <button className="btn btn-primary btn-big" onClick={add}>
        <Icon name="plus" /> Add song and start
      </button>
    </Sheet>
  )
}
