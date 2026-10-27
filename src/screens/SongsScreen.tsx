import { useMemo, useRef, useState } from 'react'
import { CATEGORIES, SONG_LIBRARY } from '../data/library'
import { midiToSong, parseMidiFile } from '../music/midiFile'
import { addImportedSong, removeImportedSong, useImportedSongs } from '../state/importedSongs'
import { useProgress } from '../state/progress'
import { readJson, writeJson } from '../state/store'
import { Icon } from '../ui/icons'
import { SongRow } from '../ui/SongRow'
import { ScreenHeader, Segmented } from '../ui/common'

type Level = 'all' | '1' | '2' | '3'

/** Folds accents and case so "fur elise" finds "Für Elise". */
const normalise = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export function SongsScreen() {
  const progress = useProgress()
  const imported = useImportedSongs()
  const saved = readJson('songFilters', { category: 'all', level: 'all' as Level })
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>(saved.category)
  const [level, setLevel] = useState<Level>(saved.level)
  const fileInput = useRef<HTMLInputElement>(null)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const setFilters = (c: string, l: Level) => {
    setCategory(c)
    setLevel(l)
    writeJson('songFilters', { category: c, level: l })
  }

  const results = useMemo(() => {
    const q = normalise(query.trim())
    return SONG_LIBRARY.filter(
      (s) =>
        (category === 'all' || s.category === category) &&
        (level === 'all' || s.difficulty === Number(level)) &&
        (!q || normalise(`${s.title} ${s.composer}`).includes(q))
    )
  }, [query, category, level])

  const groups = CATEGORIES.map((c) => ({ title: c, songs: results.filter((s) => s.category === c) })).filter((g) => g.songs.length)

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
      <ScreenHeader title="Songs" sub={`${SONG_LIBRARY.length} songs to play along with`} />

      <div className="stack">
        <input
          type="search"
          className="search"
          placeholder="Search songs or composers"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search songs"
        />
        <div className="chips" role="group" aria-label="Category">
          {['all', ...CATEGORIES].map((c) => (
            <button key={c} type="button" className="chip" aria-pressed={category === c} onClick={() => setFilters(c, level)}>
              {c === 'all' ? 'All' : c}
            </button>
          ))}
        </div>
        <Segmented<Level>
          label="Difficulty"
          value={level}
          onChange={(l) => setFilters(category, l)}
          options={[
            { value: 'all', label: 'Any level' },
            { value: '1', label: 'Easy' },
            { value: '2', label: 'Medium' },
            { value: '3', label: 'Harder' },
          ]}
        />
      </div>

      {groups.length === 0 && (
        <div className="card">
          <p className="muted">No songs match. Try another search or filter.</p>
        </div>
      )}
      {groups.map((g) => (
        <section className="unit" key={g.title}>
          <h2>
            {g.title} <span className="muted small">({g.songs.length})</span>
          </h2>
          <div className="lesson-list">
            {g.songs.map((song) => (
              <SongRow key={song.id} song={song} progress={progress} showLevel />
            ))}
          </div>
        </section>
      ))}

      <section className="unit">
        <h2>My songs</h2>
        {imported.length > 0 && (
          <div className="lesson-list" style={{ marginBottom: 12 }}>
            {imported.map((song) => (
              <SongRow
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
          <p className="muted small">Add any other song as a MIDI file (.mid). Chords are simplified to single notes.</p>
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
          {importMsg && (
            <div className={`pill ${importMsg.ok ? 'good' : 'bad'}`} style={{ whiteSpace: 'normal' }}>
              {importMsg.text}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
