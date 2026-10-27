import type { Song } from '../music/song'
import type { Progress } from '../state/progress'
import { Stars } from './common'
import { Icon } from './icons'
import { href } from './router'

const LEVEL = ['', 'Easy', 'Medium', 'Harder']

export function DifficultyBadge({ level }: { level: number }) {
  return (
    <span className={`pill level-${level}`} aria-label={`Difficulty: ${LEVEL[level]}`}>
      {LEVEL[level]}
    </span>
  )
}

/** One row in a list of lessons or songs: number/tick, title, details, best score. */
export function SongRow({
  song,
  n,
  progress,
  showLevel = false,
  onDelete,
}: {
  song: Song
  n?: number
  progress: Progress
  showLevel?: boolean
  onDelete?: () => void
}) {
  const p = progress[song.id]
  const hands = song.hands.length > 1 ? 'Both hands' : song.hands[0] === 'L' ? 'Left hand' : 'Right hand'
  return (
    <div className="lesson-item" style={{ padding: 0 }}>
      <a className="lesson-item" style={{ flex: 1, borderBottom: 'none' }} href={href('lesson', song.id)}>
        <span className={`lesson-num${p?.completed ? ' done' : ''}`}>{p?.completed ? <Icon name="check" /> : n ?? '♪'}</span>
        <span className="lesson-text">
          <span className="lesson-title">{song.title}</span>
          <span className="lesson-meta" style={{ display: 'block' }}>
            {showLevel ? song.composer || hands : `${hands}${song.composer ? ` · ${song.composer}` : ''}`}
          </span>
        </span>
        <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          {showLevel && <DifficultyBadge level={song.difficulty} />}
          {p ? (
            <>
              <Stars count={p.stars} />
              {!showLevel && <span className="muted small">{p.bestAccuracy}%</span>}
            </>
          ) : (
            !showLevel && (
              <span className="muted">
                <Icon name="chevron" />
              </span>
            )
          )}
        </span>
      </a>
      {onDelete && (
        <button className="icon-btn btn-danger" aria-label={`Delete ${song.title}`} onClick={onDelete} style={{ marginRight: 6 }}>
          <Icon name="trash" />
        </button>
      )}
    </div>
  )
}
