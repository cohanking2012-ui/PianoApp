import { frequencyToNearestNote } from '../music/notes'
import type { PitchResult } from './yin'

/**
 * Turns a stream of raw pitch readings (one per analysis frame) into discrete
 * "note played" events. It guards against the usual microphone problems:
 *  - noise gate: quiet frames are ignored (with hysteresis);
 *  - confirmation window: a pitch must be steady for `minStableMs` first;
 *  - onsets: a repeated note is only reported again after a new attack
 *    (a jump in loudness) or after a moment of silence;
 *  - harmonics: an octave/twelfth jump without a new attack is ignored.
 */

export interface TrackerOptions {
  /** RMS level below which input is treated as silence. */
  gate: number
  minStableMs: number
  toleranceCents: number
  a4: number
  /** Minimum YIN clarity (0..1) to trust a reading. */
  minClarity: number
  /** Loudness jump (ratio) that counts as a new key strike. */
  onsetRatio: number
  /** Window over which the loudness jump is measured. */
  onsetWindowMs: number
  /** No new attack is accepted this soon after a note was reported. */
  refractoryMs: number
  /** Silence this long means the key was released. */
  releaseMs: number
}

export const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  gate: 0.01,
  minStableMs: 60,
  toleranceCents: 45,
  a4: 440,
  minClarity: 0.7,
  onsetRatio: 1.3,
  onsetWindowMs: 80,
  refractoryMs: 100,
  releaseMs: 60,
}

export interface TrackerFrame {
  /** Milliseconds. */
  time: number
  /** RMS level of the frame. */
  level: number
  /**
   * RMS of just the newest few milliseconds of the frame. It reacts to a key
   * strike much faster than `level`, which makes repeated notes easy to spot.
   */
  attackLevel?: number
  pitch: PitchResult | null
}

export interface NoteOnEvent {
  midi: number
  time: number
  frequency: number
  cents: number
}

export interface LiveReading {
  midi: number | null
  cents: number
  frequency: number
  level: number
  active: boolean
}

const HARMONIC_JUMPS = new Set([12, 19, 24, 28, 31])
const RING_MS = 4000

export class NoteTracker {
  options: TrackerOptions
  private levels: { time: number; attack: number }[] = []
  private active = false
  private quietSince: number | null = null
  private onsetWasHigh = false
  private armed = true
  private current: number | null = null
  private candidate: number | null = null
  private candidateSince = 0
  private lastEmit = -Infinity
  /** When each note was last reported: a note that is still ringing must not be reported again without a new attack. */
  private recent = new Map<number, number>()
  live: LiveReading = { midi: null, cents: 0, frequency: 0, level: 0, active: false }

  constructor(options: Partial<TrackerOptions> = {}) {
    this.options = { ...DEFAULT_TRACKER_OPTIONS, ...options }
  }

  setOptions(options: Partial<TrackerOptions>) {
    this.options = { ...this.options, ...options }
  }

  reset() {
    this.levels = []
    this.active = false
    this.quietSince = null
    this.onsetWasHigh = false
    this.armed = true
    this.current = null
    this.candidate = null
    this.lastEmit = -Infinity
    this.recent.clear()
  }

  /** The note currently considered to be sounding (already reported), if any. */
  get currentNote() {
    return this.current
  }

  process(frame: TrackerFrame): NoteOnEvent | null {
    const o = this.options
    const { time: t, level, pitch } = frame
    const attackLevel = frame.attackLevel ?? level

    // --- Noise gate with hysteresis -------------------------------------
    const isLoud = this.active ? level >= o.gate * 0.75 : level >= o.gate
    if (!isLoud) {
      this.quietSince ??= t
      if (t - this.quietSince >= o.releaseMs) {
        this.active = false
        this.current = null
        this.armed = true
      }
      this.candidate = null
      this.onsetWasHigh = false
      this.levels = []
      this.live = { midi: null, cents: 0, frequency: 0, level, active: false }
      return null
    }
    this.quietSince = null
    this.active = true

    // --- Onset (new key strike) detection --------------------------------
    while (this.levels.length && t - this.levels[0].time > o.onsetWindowMs) this.levels.shift()
    let maxAttack = -Infinity
    for (const l of this.levels) maxAttack = Math.max(maxAttack, l.attack)
    this.levels.push({ time: t, attack: attackLevel })
    // A strike makes the newest few ms louder than anything just before it.
    // (Comparing with the recent *maximum* means two ringing notes "beating"
    // against each other never look like a strike.)
    const onsetHigh = maxAttack === -Infinity || attackLevel > maxAttack * o.onsetRatio
    const refractory = t - this.lastEmit < o.refractoryMs
    if (onsetHigh && !this.onsetWasHigh && !refractory) {
      this.armed = true
      this.candidateSince = t // require fresh stability after the strike
    }
    // A rise during the refractory period is not "used up": it can still count once the period ends.
    this.onsetWasHigh = onsetHigh && !refractory

    // --- Pitch → note ------------------------------------------------------
    let midi: number | null = null
    let cents = 0
    if (pitch && pitch.clarity >= o.minClarity) {
      const near = frequencyToNearestNote(pitch.frequency, o.a4)
      cents = near.cents
      if (Math.abs(near.cents) <= o.toleranceCents) midi = near.midi
    }
    this.live = { midi, cents, frequency: pitch?.frequency ?? 0, level, active: true }
    if (midi === null) {
      this.candidate = null
      return null
    }
    if (midi !== this.candidate) {
      this.candidate = midi
      this.candidateSince = t
    }
    const stableFor = t - this.candidateSince

    let emit = false
    if (this.current === null || this.armed) {
      emit = stableFor >= o.minStableMs
    } else if (midi !== this.current) {
      // Pitch changed without a detected attack (e.g. legato): be stricter,
      // never trust a jump to a harmonic of the ringing note, and don't
      // re-report a note that was played recently (it is probably still ringing).
      const jump = Math.abs(midi - this.current)
      const ringing = t - (this.recent.get(midi) ?? -Infinity) < RING_MS
      emit = !HARMONIC_JUMPS.has(jump) && !ringing && stableFor >= o.minStableMs * 2
    }
    if (!emit) return null

    this.current = midi
    this.armed = false
    this.lastEmit = t
    this.recent.set(midi, t)
    return { midi, time: t, frequency: pitch!.frequency, cents }
  }
}

/** Maps the 0..100 sensitivity slider to a noise-gate RMS level. 50 → -40 dBFS. */
export function sensitivityToGate(sensitivity: number): number {
  const s = Math.max(0, Math.min(100, sensitivity))
  const db = -16 - s * 0.48 // 0 → -16 dB (deaf), 100 → -64 dB (very sensitive)
  return Math.pow(10, db / 20)
}

export function gateToSensitivity(gate: number): number {
  const db = 20 * Math.log10(gate)
  return Math.max(0, Math.min(100, Math.round((-16 - db) / 0.48)))
}
