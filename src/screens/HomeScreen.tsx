import { CURRICULUM, LESSON_ORDER, SONG_LIBRARY } from '../data/library'
import { useProgress } from '../state/progress'
import { Icon } from '../ui/icons'
import { SongRow } from '../ui/SongRow'
import { MicPill } from '../ui/ListenGate'
import { href, navigate } from '../ui/router'

export function HomeScreen() {
  const progress = useProgress()
  const next = LESSON_ORDER.find((s) => !progress[s.id]?.completed)
  const doneCount = LESSON_ORDER.filter((s) => progress[s.id]?.completed).length
  let n = 0

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
              <SongRow key={song.id} song={song} n={++n} progress={progress} />
            ))}
          </div>
        </section>
      ))}

      <a className="card tile" href={href('songs')}>
        <span className="tile-icon">
          <Icon name="songs" />
        </span>
        <span style={{ flex: 1 }}>
          <strong>Song library</strong>
          <span className="muted small" style={{ display: 'block' }}>
            {SONG_LIBRARY.length} songs to play along with: classical, folk, carols, kids' songs and more.
          </span>
        </span>
        <span className="muted">
          <Icon name="chevron" />
        </span>
      </a>
    </div>
  )
}
