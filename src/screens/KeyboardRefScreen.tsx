import { useState } from 'react'
import { unlockAudio } from '../audio/audioContext'
import { playNote } from '../audio/synth'
import { displayName } from '../music/naming'
import { isBlackKey, midiToFrequency, midiToName, MIDDLE_C, prettyName } from '../music/notes'
import { useSettings } from '../state/settings'
import { Icon } from '../ui/icons'
import { PianoKeyboard, type KeyHighlight } from '../ui/PianoKeyboard'
import { href } from '../ui/router'
import { ScreenHeader } from '../ui/common'

export function KeyboardRefScreen() {
  const settings = useSettings()
  const [octave, setOctave] = useState(3) // first octave shown
  const [selected, setSelected] = useState<number | null>(MIDDLE_C)
  const low = Math.max(21, (octave + 1) * 12)
  const high = Math.min(108, low + 23)

  const tap = (midi: number) => {
    unlockAudio()
    playNote(midi, 0.8)
    setSelected(midi)
  }
  const highlights = new Map<number, KeyHighlight>()
  if (selected !== null) highlights.set(selected, 'played')

  return (
    <div className="screen">
      <ScreenHeader title="Keyboard guide" back={href('practice')} />
      <div className="card stack">
        {selected !== null ? (
          <div style={{ textAlign: 'center' }}>
            <div className="quiz-target">{displayName(selected, settings.noteNaming)}</div>
            <div className="muted">
              {isBlackKey(selected) ? `also called ${prettyName(midiToName(selected, true))} · ` : ''}
              {midiToFrequency(selected, settings.a4).toFixed(1)} Hz
              {selected === MIDDLE_C ? ' · Middle C' : ''}
            </div>
          </div>
        ) : (
          <p className="muted">Tap a key to hear it and see its name.</p>
        )}
      </div>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <button className="btn" onClick={() => setOctave((o) => Math.max(0, o - 1))} disabled={octave <= 0} aria-label="Lower keys">
          <Icon name="back" /> Lower
        </button>
        <span className="muted">
          C{octave} – B{octave + 1}
        </span>
        <button className="btn" onClick={() => setOctave((o) => Math.min(6, o + 1))} disabled={octave >= 6} aria-label="Higher keys">
          Higher <Icon name="chevron" />
        </button>
      </div>
      <div style={{ height: 'clamp(140px, 30vh, 240px)' }}>
        <PianoKeyboard low={low} high={high} highlights={highlights} labels="all" naming={settings.noteNaming} onPress={tap} />
      </div>
      <div className="card guide">
        <h3>How to find any note</h3>
        <ul>
          <li>The black keys come in groups of <b>two</b> and <b>three</b>.</li>
          <li>
            <b>C</b> is always the white key just left of a group of two black keys. <b>F</b> is just left of a group of three.
          </li>
          <li>The white keys go C D E F G A B, then start again at the next C.</li>
          <li>
            The number tells you which C-to-B group (octave) a note is in. <b>Middle C is C4</b>, near the middle of the keyboard
            (marked with a dot).
          </li>
          <li>
            A <b>sharp ♯</b> is the black key just to the right; a <b>flat ♭</b> is the black key just to the left. So C♯ and D♭
            are the same key.
          </li>
        </ul>
      </div>
    </div>
  )
}
