import { memo, useRef } from 'react'
import { isBlackKey, MIDDLE_C } from '../music/notes'
import { displayName } from '../music/naming'
import type { NoteNaming } from '../state/settings'

export type KeyHighlight = 'next' | 'correct' | 'wrong' | 'played' | 'demo'

interface Props {
  low: number
  high: number
  highlights?: Map<number, KeyHighlight>
  /** Finger numbers to show on highlighted keys. */
  fingers?: Map<number, number>
  labels?: 'white' | 'all' | 'c' | 'none'
  naming?: NoteNaming
  onPress?: (midi: number) => void
  ariaLabel?: string
}

/** Snaps a range outwards to white keys and makes sure it has at least `minWhite` white keys. */
export function keyboardRange(lo: number, hi: number, minWhite = 10): [number, number] {
  let low = Math.max(21, lo - 1)
  let high = Math.min(108, hi + 1)
  while (isBlackKey(low)) low--
  while (isBlackKey(high)) high++
  const whiteCount = () => countWhite(low, high)
  let toggle = false
  while (whiteCount() < minWhite && (low > 21 || high < 108)) {
    if ((toggle && high < 108) || low <= 21) {
      high++
      while (isBlackKey(high)) high++
    } else {
      low--
      while (isBlackKey(low)) low--
    }
    toggle = !toggle
  }
  return [low, high]
}

function countWhite(low: number, high: number) {
  let n = 0
  for (let m = low; m <= high; m++) if (!isBlackKey(m)) n++
  return n
}

/** On-screen piano. Keys light up to show what to play and what was heard. */
export const PianoKeyboard = memo(function PianoKeyboard({
  low,
  high,
  highlights,
  fingers,
  labels = 'white',
  naming = 'letters',
  onPress,
  ariaLabel = 'Piano keyboard',
}: Props) {
  const whiteCount = countWhite(low, high)
  const whiteWidth = 100 / whiteCount
  const keys: { midi: number; black: boolean; left: number; width: number }[] = []
  let whiteIndex = 0
  for (let m = low; m <= high; m++) {
    if (isBlackKey(m)) {
      const w = whiteWidth * 0.62
      keys.push({ midi: m, black: true, left: whiteIndex * whiteWidth - w / 2, width: w })
    } else {
      keys.push({ midi: m, black: false, left: whiteIndex * whiteWidth, width: whiteWidth })
      whiteIndex++
    }
  }
  const lastPress = useRef(0)
  const press = (midi: number) => {
    // Avoid double-firing on devices that send both touch and mouse events.
    const now = performance.now()
    if (now - lastPress.current < 30) return
    lastPress.current = now
    onPress?.(midi)
  }

  return (
    <div className="keyboard" role="group" aria-label={ariaLabel}>
      {keys.map((k) => {
        const hl = highlights?.get(k.midi)
        const finger = fingers?.get(k.midi)
        const showLabel =
          labels === 'all' || (labels === 'white' && !k.black) || (labels === 'c' && k.midi % 12 === 0) || hl === 'wrong'
        return (
          <button
            key={k.midi}
            type="button"
            className={`key ${k.black ? 'black' : 'white'}${k.midi === MIDDLE_C ? ' middle-c' : ''}${hl ? ` hl-${hl}` : ''}`}
            style={{ left: `${k.left}%`, width: `${k.width}%` }}
            aria-label={displayName(k.midi, naming)}
            onPointerDown={(e) => {
              e.preventDefault()
              press(k.midi)
            }}
            tabIndex={onPress ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') press(k.midi)
            }}
          >
            {finger !== undefined && <span className="finger">{finger}</span>}
            {showLabel && <span>{displayName(k.midi, naming, !k.black)}</span>}
          </button>
        )
      })}
    </div>
  )
})
