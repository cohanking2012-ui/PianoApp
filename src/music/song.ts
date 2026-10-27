import { noteToMidi, parseNoteName } from './notes'

/**
 * Song / lesson format (stored as JSON, see src/data/songs).
 *
 * Each entry in `notes` is played after the previous one, unless it has an
 * explicit `start` (in beats from the beginning). Durations are in beats
 * (1 = one beat of the time signature, usually a quarter note).
 * Use "rest" as the note for a silence and an array of names for a chord.
 */
export type Hand = 'R' | 'L'
export type HandChoice = Hand | 'both'

export interface SongNoteJson {
  note: string | string[]
  dur: number
  hand?: Hand
  finger?: number | number[]
  start?: number
}

export interface SongJson {
  id: string
  title: string
  composer?: string
  /** Shown before the lesson starts. */
  intro?: string
  tips?: string[]
  bpm: number
  timeSignature?: [number, number]
  /** Length in beats of an incomplete first bar, if any. */
  pickup?: number
  /** Default hand for notes without one. */
  hand?: Hand
  /** Song library grouping, e.g. "Classical". Lessons without one only appear in the curriculum. */
  category?: string
  /** 1 = easy, 2 = medium, 3 = harder. */
  difficulty?: number
  notes: SongNoteJson[]
}

export interface NoteEvent {
  id: number
  name: string
  midi: number
  start: number
  dur: number
  hand: Hand
  finger?: number
}

export interface Song {
  id: string
  title: string
  composer: string
  intro: string
  tips: string[]
  bpm: number
  beatsPerBar: number
  beatUnit: number
  pickup: number
  events: NoteEvent[]
  totalBeats: number
  hands: Hand[]
  category: string
  difficulty: number
  imported: boolean
  json: SongJson
}

export function parseSong(json: SongJson, imported = false): Song {
  if (!json || typeof json !== 'object') throw new Error('Song must be an object')
  if (!json.id || !json.title) throw new Error('Song needs an id and a title')
  if (!Array.isArray(json.notes) || json.notes.length === 0) throw new Error(`Song "${json.title}" has no notes`)
  const bpm = Number(json.bpm)
  if (!(bpm > 0)) throw new Error(`Song "${json.title}" needs a positive bpm`)
  const [beatsPerBar, beatUnit] = json.timeSignature ?? [4, 4]
  const defaultHand: Hand = json.hand ?? 'R'

  const events: NoteEvent[] = []
  let cursor = 0
  let id = 0
  json.notes.forEach((entry, i) => {
    let dur = Number(entry.dur)
    // Triplets are written as 0.333 / 0.667: snap them to exact thirds so bars line up.
    if (Math.abs(dur * 3 - Math.round(dur * 3)) < 0.01) dur = Math.round(dur * 3) / 3
    if (!(dur > 0)) throw new Error(`Note #${i + 1} in "${json.title}" needs a positive dur`)
    const start = entry.start ?? cursor
    if (!(start >= 0)) throw new Error(`Note #${i + 1} in "${json.title}" has an invalid start`)
    const names = Array.isArray(entry.note) ? entry.note : [entry.note]
    names.forEach((name, j) => {
      if (name === 'rest') return
      if (!parseNoteName(name)) throw new Error(`Note #${i + 1} in "${json.title}": "${name}" is not a note name`)
      const finger = Array.isArray(entry.finger) ? entry.finger[j] : entry.finger
      events.push({ id: id++, name, midi: noteToMidi(name), start, dur, hand: entry.hand ?? defaultHand, finger })
    })
    cursor = start + dur
  })
  if (events.length === 0) throw new Error(`Song "${json.title}" has only rests`)
  events.sort((a, b) => a.start - b.start || a.midi - b.midi)
  events.forEach((e, i) => (e.id = i))

  const totalBeats = Math.max(...events.map((e) => e.start + e.dur), cursor)
  const hands = (['R', 'L'] as Hand[]).filter((h) => events.some((e) => e.hand === h))
  return {
    id: json.id,
    title: json.title,
    composer: json.composer ?? '',
    intro: json.intro ?? '',
    tips: json.tips ?? [],
    bpm,
    beatsPerBar,
    beatUnit,
    pickup: json.pickup ?? 0,
    events,
    totalBeats,
    hands,
    category: json.category ?? '',
    difficulty: Math.max(1, Math.min(3, Math.round(json.difficulty ?? 2))),
    imported,
    json,
  }
}

/** A moment in the song where one note (or a chord) must be played. */
export interface Step {
  index: number
  start: number
  notes: NoteEvent[]
}

const SAME_TIME = 1e-6

export function buildSteps(events: NoteEvent[], hand: HandChoice = 'both'): Step[] {
  const chosen = events.filter((e) => hand === 'both' || e.hand === hand)
  const steps: Step[] = []
  for (const e of chosen) {
    const last = steps[steps.length - 1]
    if (last && Math.abs(last.start - e.start) < SAME_TIME) last.notes.push(e)
    else steps.push({ index: steps.length, start: e.start, notes: [e] })
  }
  return steps
}

/** 1-based bar number of a beat position (bar 0 = pickup bar, if the song has one). */
export function barOf(song: Pick<Song, 'pickup' | 'beatsPerBar'>, beat: number): number {
  if (song.pickup > 0) return beat < song.pickup - SAME_TIME ? 0 : Math.floor((beat - song.pickup + SAME_TIME) / song.beatsPerBar) + 1
  return Math.floor((beat + SAME_TIME) / song.beatsPerBar) + 1
}

export function barCount(song: Song): number {
  return Math.max(1, barOf(song, song.totalBeats - 0.001))
}

/** Beat at which a bar starts. */
export function barStartBeat(song: Pick<Song, 'pickup' | 'beatsPerBar'>, bar: number): number {
  if (song.pickup > 0) return bar <= 0 ? 0 : song.pickup + (bar - 1) * song.beatsPerBar
  return (bar - 1) * song.beatsPerBar
}

/** Steps whose start lies within bars [fromBar, toBar] (the pickup counts as part of bar 1). */
export function stepsInBars(song: Song, steps: Step[], fromBar: number, toBar: number): Step[] {
  return steps
    .filter((s) => {
      const bar = Math.max(1, barOf(song, s.start))
      return bar >= fromBar && bar <= toBar
    })
    .map((s, index) => ({ ...s, index }))
}

export function songRange(events: NoteEvent[]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const e of events) {
    lo = Math.min(lo, e.midi)
    hi = Math.max(hi, e.midi)
  }
  return [lo, hi]
}
