import { Icon, type IconName } from '../ui/icons'
import { href } from '../ui/router'
import { ScreenHeader } from '../ui/common'

const TILES: { to: string; icon: IconName; title: string; text: string }[] = [
  { to: 'metronome', icon: 'metronome', title: 'Metronome', text: 'Keep a steady beat while you practise.' },
  { to: 'quiz', icon: 'quiz', title: 'Note quiz', text: 'Learn where every note is, and read notes on the staff.' },
  { to: 'keyboard', icon: 'keyboard', title: 'Keyboard guide', text: 'Every key named, from the lowest to the highest.' },
]

export function PracticeScreen() {
  return (
    <div className="screen">
      <ScreenHeader title="Practice tools" />
      <div className="tiles">
        {TILES.map((t) => (
          <a key={t.to} className="card tile" href={href('practice', t.to)}>
            <span className="tile-icon">
              <Icon name={t.icon} />
            </span>
            <span>
              <strong>{t.title}</strong>
              <span className="muted small" style={{ display: 'block' }}>
                {t.text}
              </span>
            </span>
          </a>
        ))}
        <a className="card tile" href={href('play')}>
          <span className="tile-icon">
            <Icon name="mic" />
          </span>
          <span>
            <strong>Free play &amp; tuner</strong>
            <span className="muted small" style={{ display: 'block' }}>
              See the name of every note you play.
            </span>
          </span>
        </a>
        <a className="card tile" href={href('help')}>
          <span className="tile-icon">
            <Icon name="help" />
          </span>
          <span>
            <strong>Help &amp; tips</strong>
            <span className="muted small" style={{ display: 'block' }}>
              Phone placement and fixing detection problems.
            </span>
          </span>
        </a>
      </div>
    </div>
  )
}
