import { useRef, useState } from 'react'
import { CURRICULUM, LESSON_ORDER } from '../data/library'
import { midiToSong, parseMidiFile } from '../music/midiFile'
import type { Song } from '../music/song'
import { addImportedSong, removeImportedSong, useImportedSongs } from '../state/importedSongs'
import { useProgress, type Progress } from '../state/progress'
import { Stars } from '../ui/common'
import { Icon } from '../ui/icons'
import { MicPill } from '../ui/ListenGate'
import { href, navigate } from '../ui/router'

function LessonRow({ song, n, progress, onDelete }: { song: Song; n?: number; progress: Progress; onDelete?: () => void }) {
  const p = progress[song.id]
  const hands = song.hands.length > 1 ? 'Both hands' : song.hands[0] === 'L' ? 'Left hand' : 'Right hand'
  return (
    <div className="lesson-item" style={{ padding: 0 }}>
      <a className="lesson-item" style={{ flex: 1, borderBottom: 'none' }} href={href('lesson', song.id)}>
        <span className={`lesson-num${p?.completed ? ' done' : ''}`}>{p?.completed ? <Icon name="check" /> : n ?? '♪'}</span>
        <span className="lesson-text">
          <span className="lesson-title">{song.title}</span>
          <span className="lesson-meta" style={{ display: 'block' }}>
            {hands}
            {song.composer ? ` · ${song.composer}` : ''}
          </span>
        </span>
        {p ? (
          <span style={{ textAlign: 'right' }}>
            <Stars count={p.stars} />
            <span className="muted small" style={{ display: 'block' }}>
              {p.bestAccuracy}%
            </span>
          </span>
        ) : (
          <span className="muted">
            <Icon name="chevron" />
          </span>
        )}
      </a>
      {onDelete && (
        <button className="icon-btn btn-danger" aria-label={`Delete ${song.title}`} onClick={onDelete} style={{ marginRight: 6 }}>
          <Icon name="trash" />
        </button>
      )}
    </div>
  )
}

export function HomeScreen() {
  const progress = useProgress()
  const imported = useImportedSongs()
  const fileInput = useRef<HTMLInputElement>(null)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const next = LESSON_ORDER.find((s) => !progress[s.id]?.completed)
  const doneCount = LESSON_ORDER.filter((s) => progress[s.id]?.completed).length
  let n = 0

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      if (file.size > 2_000_000) throw new Error('That file is too big for a song (over 2 MB).')
      const json = midiToSong(parseMidiFile(await file.arrayBuffer()), file.name)
      addImportedSong(json)
      setImportMsg({ ok: true, text: `Added "${json.title}" (${json.notes.length} notes).` })
    } catch (e) {
      setImportMsg({ ok: false, text: `Couldn't import that file: ${(e as Error).message}` })
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <div style={{ flex: 1 }}>
          <h1>Piano Coach</h1>
          <div className="sub">
            {doneCount} of {LESSON_ORDER.length} lessons done
          </div>
        </div>
        <MicPill />
      </header>

      {next ? (
        <div className="card continue-card stack">
          <div>
            <div className="muted small">{doneCount === 0 ? 'Start here' : 'Up next'}</div>
            <h2 style={{ fontSize: '1.4rem' }}>{next.title}</h2>
          </div>
          <button className="btn btn-big" onClick={() => navigate('lesson', next.id)}>
            <Icon name="play" /> {doneCount === 0 ? 'Start your first lesson' : 'Continue'}
          </button>
        </div>
      ) : (
        <div className="card continue-card stack">
          <h2>All lessons complete! 🎉</h2>
          <p className="muted">Replay any lesson to earn more stars, or import your own songs below.</p>
        </div>
      )}

      {doneCount === 0 && (
        <a className="card tile" href={href('play')}>
          <span className="tile-icon">
            <Icon name="mic" />
          </span>
          <span>
            <strong>First time? Test the microphone</strong>
            <span className="muted small" style={{ display: 'block' }}>
              Play a few keys in Free Play to check the app hears your piano.
            </span>
          </span>
        </a>
      )}

      {CURRICULUM.map((unit) => (
        <section className="unit" key={unit.title}>
          <h2>{unit.title}</h2>
          <div className="lesson-list">
            {unit.lessons.map((song) => (
              <LessonRow key={song.id} song={song} n={++n} progress={progress} />
            ))}
          </div>
        </section>
      ))}

      <section className="unit">
        <h2>My songs</h2>
        {imported.length > 0 && (
          <div className="lesson-list" style={{ marginBottom: 12 }}>
            {imported.map((song) => (
              <LessonRow
                key={song.id}
                song={song}
                progress={progress}
                onDelete={() => {
                  if (confirm(`Delete "${song.title}"?`)) removeImportedSong(song.id)
                }}
              />
            ))}
          </div>
        )}
        <div className="card stack">
          <p className="muted small">
            Add any song as a MIDI file (.mid). Many free, public-domain piano MIDI files are available online. Chords are simplified
            to single notes.
          </p>
          <button className="btn btn-soft" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" /> Import a MIDI file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".mid,.midi,audio/midi,audio/x-midi"
            className="visually-hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          {importMsg && <div className={`pill ${importMsg.ok ? 'good' : 'bad'}`} style={{ whiteSpace: 'normal' }}>{importMsg.text}</div>}
        </div>
      </section>
    </div>
  )
}
