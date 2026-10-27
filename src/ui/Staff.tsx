import { memo, useEffect, useRef, useState } from 'react'
import { accidentalOf, diatonicIndex } from '../music/notes'
import { displayName } from '../music/naming'
import type { NoteNaming } from '../state/settings'

export type StaffNoteState = 'pending' | 'current' | 'hit' | 'missed' | 'dim'

export interface StaffNote {
  key: string | number
  name: string
  /** Horizontal position in staff units. */
  x: number
  /** Length in quarter notes (decides the note's look: whole, half, quarter, eighth...). */
  quarters: number
  finger?: number
  state: StaffNoteState
}

interface Props {
  notes: StaffNote[]
  /** x positions (staff units) of bar lines. */
  bars?: number[]
  /** Content x that should appear at the playhead. */
  scrollX: number
  /** Animate scrolling (wait mode). Off for smooth continuous scrolling (tempo mode). */
  animate?: boolean
  showNames?: boolean
  showFingers?: boolean
  naming?: NoteNaming
  /** Lowest and highest note (diatonic index) that must fit, used to pick the staves. */
  rangeD?: [number, number]
  ariaLabel?: string
}

const HALF = 6 // staff units per diatonic step (line spacing = 12)
const TREBLE_LINES = [30, 32, 34, 36, 38] // E4 G4 B4 D5 F5
const BASS_LINES = [18, 20, 22, 24, 26] // G2 B2 D3 F3 A3
const LABEL_ROW = 20
export const PLAYHEAD_X = 50
const MAX_SCALE = 1.6

/** Diatonic index → staff layout. Exported for the quiz. */
export function staffLayout(rangeD: [number, number]) {
  const [lo, hi] = rangeD
  const useBass = lo < 27
  const useTreble = hi > 28 || !useBass
  const lines = [...(useBass ? BASS_LINES : []), ...(useTreble ? TREBLE_LINES : [])]
  const minD = Math.min(lo - 1, useBass ? 17 : 27)
  const maxD = Math.max(hi + 1, useTreble ? 39 : 29)
  const height = (maxD - minD) * HALF + LABEL_ROW * 2
  const y = (d: number) => LABEL_ROW + (maxD - d) * HALF
  return { lines, minD, maxD, height, y, useBass, useTreble }
}

function ledgerPositions(d: number, lines: number[]): number[] {
  const out: number[] = []
  const top = Math.max(...lines)
  const bottom = Math.min(...lines)
  if (d >= top + 2) for (let p = top + 2; p <= d; p += 2) out.push(p)
  else if (d <= bottom - 2) for (let p = bottom - 2; p >= d; p -= 2) out.push(p)
  else if (d % 2 === 0 && !lines.includes(d)) out.push(d) // middle C between the staves
  return out
}

export const Staff = memo(function Staff({
  notes,
  bars = [],
  scrollX,
  animate = true,
  showNames = true,
  showFingers = true,
  naming = 'letters',
  rangeD = [28, 36],
  ariaLabel = 'Music staff',
}: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 320, h: 160 })
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth || 320, h: el.clientHeight || 160 })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const layout = staffLayout(rangeD)
  // Fit the height, but don't blow simple one-staff lessons up to giant notes.
  const scale = Math.max(0.01, Math.min(size.h / layout.height, MAX_SCALE))
  const viewW = size.w / scale
  const viewH = size.h / scale
  const top = -(viewH - layout.height) / 2
  const { y, lines } = layout
  const midTreble = 34
  const midBass = 22

  // Only draw notes near the visible window.
  const from = scrollX - PLAYHEAD_X - viewW
  const to = scrollX - PLAYHEAD_X + viewW * 2
  const visible = notes.filter((n) => n.x >= from && n.x <= to)

  return (
    <div className="staff-wrap" ref={wrap} role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 ${top} ${viewW} ${viewH}`} preserveAspectRatio="xMinYMin meet">
        {lines.map((d) => (
          <line key={d} className="staff-line" x1={0} x2={viewW} y1={y(d)} y2={y(d)} />
        ))}
        <rect className="playhead" x={PLAYHEAD_X - 15} width={30} y={2} height={layout.height - 4} rx={8} />
        <g
          style={{
            transform: `translateX(${PLAYHEAD_X - scrollX}px)`,
            transition: animate ? 'transform 0.25s ease-out' : 'none',
          }}
        >
          {bars
            .filter((b) => b >= from && b <= to)
            .map((b) => (
              <line
                key={`bar-${b}`}
                className="bar-line"
                x1={b}
                x2={b}
                y1={y(Math.max(...lines))}
                y2={y(Math.min(...lines))}
              />
            ))}
          {visible.map((n) => {
            const d = diatonicIndex(n.name)
            const ny = y(d)
            const acc = accidentalOf(n.name)
            const q = n.quarters
            const hollow = q >= 2 - 1e-6
            const hasStem = q < 4 - 1e-6
            const flags = q < 0.5 - 1e-6 ? 2 : q < 1 - 1e-6 ? 1 : 0
            const dotted = [3, 1.5, 0.75, 0.375].some((v) => Math.abs(q - v) < 1e-6)
            const up = d >= 28 ? d < midTreble : d < midBass
            const sx = up ? n.x + 5.6 : n.x - 5.6
            const sy = up ? ny - 34 : ny + 34
            return (
              <g key={n.key} className={`n-${n.state}`}>
                {ledgerPositions(d, lines).map((p) => (
                  <line key={p} className="staff-line" x1={n.x - 10} x2={n.x + 10} y1={y(p)} y2={y(p)} />
                ))}
                {acc !== 0 && (
                  <text className="note-acc" x={n.x - 14} y={ny + 6}>
                    {acc > 0 ? '♯' : '♭'}
                  </text>
                )}
                <ellipse
                  className={`note-head${hollow ? ' hollow' : ''}`}
                  cx={n.x}
                  cy={ny}
                  rx={6.3}
                  ry={4.6}
                  transform={`rotate(-20 ${n.x} ${ny})`}
                />
                {hasStem && <line className="note-stem" x1={sx} x2={sx} y1={ny + (up ? -1 : 1)} y2={sy} />}
                {Array.from({ length: flags }, (_, i) => (
                  <path
                    key={i}
                    className="note-stem"
                    fill="none"
                    d={
                      up
                        ? `M ${sx} ${sy + i * 7} c 1 6 9 8 7 16`
                        : `M ${sx} ${sy - i * 7} c 1 -6 9 -8 7 -16`
                    }
                  />
                ))}
                {dotted && <circle className="note-head" cx={n.x + 11} cy={d % 2 === 0 ? ny - 3 : ny} r={1.8} />}
                {showFingers && n.finger !== undefined && (
                  <text className="note-text" x={n.x} y={13}>
                    {n.finger}
                  </text>
                )}
                {showNames && (
                  <text className="note-text" x={n.x} y={layout.height - 6}>
                    {displayName(n.name, naming)}
                  </text>
                )}
              </g>
            )
          })}
        </g>
      </svg>
    </div>
  )
})
