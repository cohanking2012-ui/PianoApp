import { notesMatch } from './notes'
import type { NoteEvent, Step } from './song'

export interface MatchOptions {
  /** Accept the right note name in any octave. */
  anyOctave: boolean
  /** Chords need every note (MIDI/touch input). With a microphone one note is enough. */
  requireAll: boolean
}

export interface SessionResult {
  total: number
  correct: number
  wrong: number
  missed: number
  /** 0..100 */
  accuracy: number
  stars: number
}

export function starsFor(accuracy: number): number {
  return accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : accuracy >= 40 ? 1 : 0
}

function noteInStep(step: Step, midi: number, anyOctave: boolean): NoteEvent | undefined {
  return step.notes.find((n) => notesMatch(midi, n.midi, anyOctave))
}

export type WaitOutcome =
  | { kind: 'correct'; step: Step; note: NoteEvent; finished: boolean }
  | { kind: 'partial'; step: Step; note: NoteEvent }
  | { kind: 'wrong'; step: Step; played: number }
  | { kind: 'ignored' }

/**
 * Wait mode: the song pauses on each step until the right note is played.
 * A step counts as correct only if no wrong note was played on it first.
 */
export class WaitSession {
  index = 0
  wrong = 0
  private cleanSteps = 0
  private mistakeOnStep = false
  private heard = new Set<number>()

  constructor(
    readonly steps: Step[],
    readonly options: MatchOptions
  ) {}

  get finished() {
    return this.index >= this.steps.length
  }

  get current(): Step | undefined {
    return this.steps[this.index]
  }

  input(midi: number): WaitOutcome {
    const step = this.current
    if (!step) return { kind: 'ignored' }
    const note = noteInStep(step, midi, this.options.anyOctave)
    if (!note) {
      // Re-playing a chord note that was already accepted is not a mistake.
      if (this.heard.has(midi)) return { kind: 'ignored' }
      this.wrong++
      this.mistakeOnStep = true
      return { kind: 'wrong', step, played: midi }
    }
    this.heard.add(midi)
    const needed = this.options.requireAll ? step.notes.length : 1
    const got = step.notes.filter((n) => [...this.heard].some((m) => notesMatch(m, n.midi, this.options.anyOctave))).length
    if (got < needed) return { kind: 'partial', step, note }

    if (!this.mistakeOnStep) this.cleanSteps++
    this.mistakeOnStep = false
    this.heard.clear()
    this.index++
    return { kind: 'correct', step, note, finished: this.finished }
  }

  result(): SessionResult {
    const total = this.steps.length
    const done = Math.min(this.index, total)
    const accuracy = total ? Math.round((this.cleanSteps / Math.max(1, done)) * 100) : 0
    return { total, correct: this.cleanSteps, wrong: this.wrong, missed: 0, accuracy, stars: starsFor(accuracy) }
  }
}

export type StepState = 'pending' | 'hit' | 'missed'

export type TempoOutcome =
  | { kind: 'hit'; step: Step; note: NoteEvent; offsetSec: number }
  | { kind: 'partial'; step: Step; note: NoteEvent }
  | { kind: 'wrong'; played: number }

export interface TempoOptions extends MatchOptions {
  secondsPerBeat: number
  /** Beat at which time 0 starts (start of the practised section). */
  originBeat: number
  /** How early/late (seconds) a note may be played and still count. */
  windowSec: number
}

/**
 * Tempo mode: notes move at a fixed speed and are scored if played within a
 * timing window around their time. Times are seconds since the section start.
 */
export class TempoSession {
  readonly states: StepState[]
  readonly times: number[]
  wrong = 0
  private heard: Set<number>[]

  constructor(
    readonly steps: Step[],
    readonly options: TempoOptions
  ) {
    this.states = steps.map(() => 'pending')
    this.times = steps.map((s) => (s.start - options.originBeat) * options.secondsPerBeat)
    this.heard = steps.map(() => new Set())
  }

  input(midi: number, time: number): TempoOutcome {
    const { windowSec, anyOctave, requireAll } = this.options
    let best = -1
    let bestDist = Infinity
    this.steps.forEach((step, i) => {
      if (this.states[i] !== 'pending') return
      const dist = Math.abs(time - this.times[i])
      if (dist <= windowSec && dist < bestDist && noteInStep(step, midi, anyOctave)) {
        best = i
        bestDist = dist
      }
    })
    if (best < 0) {
      this.wrong++
      return { kind: 'wrong', played: midi }
    }
    const step = this.steps[best]
    const note = noteInStep(step, midi, anyOctave)!
    this.heard[best].add(note.midi)
    const needed = requireAll ? step.notes.length : 1
    if (this.heard[best].size < needed) return { kind: 'partial', step, note }
    this.states[best] = 'hit'
    return { kind: 'hit', step, note, offsetSec: time - this.times[best] }
  }

  /** Marks steps whose window has passed as missed; returns their indexes. */
  update(time: number): number[] {
    const missed: number[] = []
    this.times.forEach((t, i) => {
      if (this.states[i] === 'pending' && time > t + this.options.windowSec) {
        this.states[i] = 'missed'
        missed.push(i)
      }
    })
    return missed
  }

  /** Seconds at which the last note's window closes. */
  get endTime() {
    return this.times.length ? this.times[this.times.length - 1] + this.options.windowSec : 0
  }

  get finished() {
    return this.states.every((s) => s !== 'pending')
  }

  result(): SessionResult {
    const total = this.steps.length
    const correct = this.states.filter((s) => s === 'hit').length
    const missed = this.states.filter((s) => s === 'missed').length
    const accuracy = total ? Math.round((correct / (total + this.wrong)) * 100) : 0
    return { total, correct, wrong: this.wrong, missed, accuracy, stars: starsFor(accuracy) }
  }
}

/** Timing window: generous for slow songs, at least 0.2 s, at most 0.45 s. */
export function timingWindow(secondsPerBeat: number): number {
  return Math.max(0.2, Math.min(0.45, secondsPerBeat * 0.4))
}
