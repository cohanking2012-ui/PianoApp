/** Note-name, MIDI-number and frequency helpers. MIDI 60 = C4 = middle C. */

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const
const LETTER_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

export const MIDDLE_C = 60

export interface ParsedNote {
  letter: string
  /** -2..2: number of flats (negative) or sharps (positive). */
  accidental: number
  octave: number
  midi: number
}

const NOTE_RE = /^([A-Ga-g])(##|bb|#|b|♯|♭|x)?(-?\d)$/

/** Parses names like "C4", "F#3", "Bb2", "D♭5". Returns null for anything else. */
export function parseNoteName(name: string): ParsedNote | null {
  const m = NOTE_RE.exec(name.trim())
  if (!m) return null
  const letter = m[1].toUpperCase()
  const acc = m[2] ?? ''
  const accidental = { '': 0, '#': 1, '♯': 1, x: 2, '##': 2, b: -1, '♭': -1, bb: -2 }[acc] ?? 0
  const octave = Number(m[3])
  const midi = (octave + 1) * 12 + LETTER_SEMITONES[letter] + accidental
  if (midi < 0 || midi > 127) return null
  return { letter, accidental, octave, midi }
}

export function noteToMidi(name: string): number {
  const p = parseNoteName(name)
  if (!p) throw new Error(`Invalid note name: "${name}"`)
  return p.midi
}

/** "C#4" style name (ASCII). */
export function midiToName(midi: number, preferFlats = false): string {
  const pc = ((midi % 12) + 12) % 12
  const octave = Math.floor(midi / 12) - 1
  return `${(preferFlats ? FLAT_NAMES : SHARP_NAMES)[pc]}${octave}`
}

/** Pretty name for display, e.g. "C♯4". */
export function prettyName(name: string): string {
  return name.replace(/##/, '𝄪').replace(/#/, '♯').replace(/(?<=[A-G])bb/, '𝄫').replace(/(?<=[A-G])b/, '♭')
}

export function prettyMidi(midi: number, preferFlats = false): string {
  return prettyName(midiToName(midi, preferFlats))
}

/** Name without octave, e.g. "F♯". */
export function pitchClassName(midi: number, preferFlats = false): string {
  return prettyMidi(midi, preferFlats).replace(/-?\d+$/, '')
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12)
}

export function midiToFrequency(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12)
}

/** Fractional MIDI number for a frequency (e.g. 60.12 = C4 slightly sharp). */
export function frequencyToMidiFloat(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4)
}

export interface NearestNote {
  midi: number
  /** Deviation from the nearest note in cents (-50..50). */
  cents: number
}

export function frequencyToNearestNote(freq: number, a4 = 440): NearestNote {
  const m = frequencyToMidiFloat(freq, a4)
  const midi = Math.round(m)
  return { midi, cents: (m - midi) * 100 }
}

/**
 * Converts a frequency to a MIDI note only if it is within `toleranceCents` of
 * a real note; otherwise returns null (an out-of-tune or noisy reading).
 */
export function frequencyToMidi(freq: number, toleranceCents = 45, a4 = 440): number | null {
  if (!(freq > 0) || !Number.isFinite(freq)) return null
  const { midi, cents } = frequencyToNearestNote(freq, a4)
  return Math.abs(cents) <= toleranceCents ? midi : null
}

/** True if two notes match, optionally ignoring octave. */
export function notesMatch(played: number, expected: number, anyOctave = false): boolean {
  return anyOctave ? (played - expected) % 12 === 0 : played === expected
}

/**
 * Staff position of a note: number of diatonic steps above C0.
 * Uses the written letter when available so "Db4" sits on the D line.
 */
export function diatonicIndex(name: string): number {
  const p = parseNoteName(name)
  if (!p) throw new Error(`Invalid note name: "${name}"`)
  return p.octave * 7 + LETTERS.indexOf(p.letter)
}

export function accidentalOf(name: string): number {
  return parseNoteName(name)?.accidental ?? 0
}
