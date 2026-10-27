import { midiToName } from './notes'
import type { Hand, SongJson, SongNoteJson } from './song'

/** Minimal Standard MIDI File (.mid) reader + converter to the app's song format. */

export interface MidiNote {
  midi: number
  startTick: number
  endTick: number
  velocity: number
  channel: number
}

export interface MidiTrack {
  name: string
  notes: MidiNote[]
  /** First General MIDI program (instrument) used on each channel. */
  programs: Record<number, number>
}

export interface MidiFileData {
  format: number
  ticksPerBeat: number
  /** Microseconds per quarter note (first tempo in the file). */
  tempo: number
  timeSignature: [number, number]
  tracks: MidiTrack[]
}

class Reader {
  pos = 0
  constructor(private bytes: Uint8Array) {}
  get done() {
    return this.pos >= this.bytes.length
  }
  u8() {
    if (this.pos >= this.bytes.length) throw new Error('Unexpected end of MIDI file')
    return this.bytes[this.pos++]
  }
  u16() {
    return (this.u8() << 8) | this.u8()
  }
  u32() {
    return ((this.u8() << 24) | (this.u8() << 16) | (this.u8() << 8) | this.u8()) >>> 0
  }
  str(n: number) {
    let s = ''
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8())
    return s
  }
  bytesOf(n: number) {
    if (this.pos + n > this.bytes.length) throw new Error('Unexpected end of MIDI file')
    const out = this.bytes.subarray(this.pos, this.pos + n)
    this.pos += n
    return out
  }
  varLen() {
    let value = 0
    for (let i = 0; i < 4; i++) {
      const b = this.u8()
      value = (value << 7) | (b & 0x7f)
      if (!(b & 0x80)) return value
    }
    throw new Error('Invalid variable-length number in MIDI file')
  }
}

export function parseMidiFile(input: ArrayBuffer | Uint8Array): MidiFileData {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  const r = new Reader(bytes)
  if (bytes.length < 14 || r.str(4) !== 'MThd') throw new Error('This is not a MIDI file')
  const headerLen = r.u32()
  const format = r.u16()
  const trackCount = r.u16()
  const division = r.u16()
  r.pos = 8 + headerLen
  if (division & 0x8000) throw new Error('SMPTE-timed MIDI files are not supported')
  const ticksPerBeat = division || 480

  let tempo = 500000
  let tempoSet = false
  let timeSignature: [number, number] = [4, 4]
  let timeSigSet = false
  const tracks: MidiTrack[] = []

  for (let t = 0; t < trackCount && !r.done; t++) {
    const id = r.str(4)
    const len = r.u32()
    const chunk = r.bytesOf(len)
    if (id !== 'MTrk') {
      t--
      continue
    }
    const tr = new Reader(chunk)
    let tick = 0
    let status = 0
    let name = ''
    const notes: MidiNote[] = []
    const programs: Record<number, number> = {}
    const open = new Map<number, { tick: number; velocity: number }[]>()
    const close = (channel: number, midi: number, at: number) => {
      const starts = open.get((channel << 8) | midi)
      const s = starts?.shift()
      if (s && at > s.tick) notes.push({ midi, startTick: s.tick, endTick: at, velocity: s.velocity, channel })
    }

    while (!tr.done) {
      tick += tr.varLen()
      let b = tr.u8()
      if (b === 0xff) {
        const type = tr.u8()
        const data = tr.bytesOf(tr.varLen())
        if (type === 0x03 && !name) name = String.fromCharCode(...data).trim()
        if (type === 0x51 && !tempoSet && data.length === 3) {
          tempo = (data[0] << 16) | (data[1] << 8) | data[2]
          tempoSet = true
        }
        if (type === 0x58 && !timeSigSet && data.length >= 2) {
          timeSignature = [data[0], Math.pow(2, data[1])]
          timeSigSet = true
        }
        if (type === 0x2f) break
        continue
      }
      if (b === 0xf0 || b === 0xf7) {
        tr.bytesOf(tr.varLen())
        continue
      }
      let first: number
      if (b & 0x80) {
        status = b
        first = tr.u8()
      } else {
        if (!status) throw new Error('Invalid MIDI data (running status without status)')
        first = b
      }
      const kind = status & 0xf0
      const channel = status & 0x0f
      const second = kind === 0xc0 || kind === 0xd0 ? 0 : tr.u8()
      if (kind === 0xc0 && programs[channel] === undefined) programs[channel] = first
      if (kind === 0x90 && second > 0) {
        const key = (channel << 8) | first
        if (!open.has(key)) open.set(key, [])
        open.get(key)!.push({ tick, velocity: second })
      } else if (kind === 0x80 || (kind === 0x90 && second === 0)) {
        close(channel, first, tick)
      }
    }
    // Close any notes left hanging at the end of the track.
    for (const [key, starts] of open) while (starts.length) close(key >> 8, key & 0xff, Math.max(tick, starts[0].tick + 1))
    notes.sort((a, b) => a.startTick - b.startTick || b.midi - a.midi)
    tracks.push({ name, notes, programs })
  }
  return { format, ticksPerBeat, tempo, timeSignature, tracks }
}

const round = (x: number) => Math.round(x * 1000) / 1000

const FAMILIES = ['Piano', 'Bells', 'Organ', 'Guitar', 'Bass', 'Strings', 'Voice & strings', 'Brass', 'Reed', 'Flute', 'Synth lead', 'Synth pad', 'Synth', 'Ethnic', 'Percussion', 'Effects']

/** One instrument part of a MIDI file (a track, split by channel). */
export interface MidiPart {
  id: string
  name: string
  instrument: string
  program: number | null
  notes: MidiNote[]
  low: number
  high: number
  average: number
  /** Share of start times where several notes sound together (0 = single notes, 1 = all chords). */
  chordiness: number
}

/** Lists the instrument parts in a file, leaving out drums. */
export function listParts(data: MidiFileData): MidiPart[] {
  const parts: MidiPart[] = []
  data.tracks.forEach((track, t) => {
    const channels = [...new Set(track.notes.map((n) => n.channel))].filter((c) => c !== 9).sort((a, b) => a - b)
    for (const channel of channels) {
      const notes = track.notes.filter((n) => n.channel === channel)
      const program = track.programs?.[channel] ?? null
      const starts = new Map<number, number>()
      notes.forEach((n) => starts.set(n.startTick, (starts.get(n.startTick) ?? 0) + 1))
      const chordiness = [...starts.values()].filter((c) => c > 1).length / Math.max(1, starts.size)
      const midis = notes.map((n) => n.midi)
      const label = track.name || `Track ${t + 1}`
      parts.push({
        id: `${t}:${channel}`,
        name: channels.length > 1 ? `${label} (channel ${channel + 1})` : label,
        instrument: program === null ? 'Piano' : FAMILIES[Math.floor(program / 8)],
        program,
        notes,
        low: Math.min(...midis),
        high: Math.max(...midis),
        average: midis.reduce((a, b) => a + b, 0) / midis.length,
        chordiness,
      })
    }
  })
  return parts
}

const MELODY_NAME = /vocal|voice|melod|lead|sing|soprano|solo|tune|right|\brh\b|treble|flute|violin|trumpet|sax/i
const LEFT_NAME = /left|\blh\b|bass clef|accomp/i

/** Best guess at which part carries the tune, and which (if any) suits the left hand. */
export function guessParts(parts: MidiPart[]): { melody: string; left: string | null } {
  if (!parts.length) throw new Error('No piano notes found in this MIDI file')
  const score = (p: MidiPart) =>
    (MELODY_NAME.test(p.name) ? 100 : 0) -
    (LEFT_NAME.test(p.name) ? 60 : 0) -
    (p.program !== null && p.program >= 32 && p.program < 40 ? 100 : 0) - // bass
    (p.notes.length < 8 ? 100 : 0) +
    p.average -
    30 * p.chordiness
  const melody = [...parts].sort((a, b) => score(b) - score(a))[0]
  const isPiano = (p: MidiPart) => p.program === null || p.program < 8
  const others = parts.filter((p) => p !== melody && p.average < melody.average)
  const pianoLeft = others.filter((p) => isPiano(p) && isPiano(melody) && (LEFT_NAME.test(p.name) || p.average < 60))
  let left: string | null = null
  if (pianoLeft.length) left = pianoLeft.sort((a, b) => a.average - b.average)[0].id
  else if (parts.length === 1 && melody.notes.filter((n) => n.midi < 60).length >= melody.notes.length * 0.2) left = melody.id
  return { melody: melody.id, left }
}

export interface ImportOptions {
  /** Part id (from listParts) for the right hand / tune. Defaults to the best guess. */
  melody?: string
  /** Part id for the left hand, or null for melody only. Same as melody = split at middle C. */
  left?: string | null
  title?: string
  /** Move each hand by whole octaves into a comfortable range (default true). */
  fitRange?: boolean
}

/** Octave shift that brings the middle of a line into [lo, hi]. */
function octaveShift(midis: number[], lo: number, hi: number) {
  const sorted = [...midis].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  let shift = 0
  while (median + shift < lo) shift += 12
  while (median + shift > hi) shift -= 12
  return shift
}

/**
 * Converts a parsed MIDI file into a song. The app teaches single-note
 * playing, so each hand is reduced to one line: the top note of chords for
 * the right hand and the bottom note for the left hand. Drums are skipped.
 */
export function midiToSong(data: MidiFileData, fileName: string, options: ImportOptions = {}): SongJson {
  const parts = listParts(data)
  if (parts.length === 0) throw new Error('No piano notes found in this MIDI file')
  const guess = guessParts(parts)
  const melody = parts.find((p) => p.id === (options.melody ?? guess.melody)) ?? parts[0]
  const leftId = options.left === undefined ? guess.left : options.left
  const left = leftId === null ? null : (parts.find((p) => p.id === leftId) ?? null)

  // Decide which notes belong to which hand.
  const handed: { note: MidiNote; hand: Hand }[] = []
  if (left && left.id === melody.id) {
    for (const note of melody.notes) handed.push({ note, hand: note.midi >= 60 ? 'R' : 'L' })
  } else {
    for (const note of melody.notes) handed.push({ note, hand: 'R' })
    if (left) for (const note of left.notes) handed.push({ note, hand: 'L' })
  }

  const [num, den] = data.timeSignature
  const beatsPerQuarter = den / 4
  const grid = data.ticksPerBeat / 8 // quantise to 32nd notes
  const q = (tick: number) => Math.round(tick / grid) * grid
  const toBeat = (tick: number) => (tick / data.ticksPerBeat) * beatsPerQuarter

  const lines: SongNoteJson[] = []
  for (const hand of ['R', 'L'] as Hand[]) {
    const byStart = new Map<number, MidiNote>()
    for (const { note, hand: h } of handed) {
      if (h !== hand) continue
      const start = q(note.startTick)
      const prev = byStart.get(start)
      if (!prev || (hand === 'R' ? note.midi > prev.midi : note.midi < prev.midi)) byStart.set(start, note)
    }
    const starts = [...byStart.keys()].sort((a, b) => a - b)
    if (!starts.length) continue
    const shift =
      options.fitRange === false
        ? 0
        : octaveShift(
            starts.map((st) => byStart.get(st)!.midi),
            hand === 'R' ? 60 : 43,
            hand === 'R' ? 76 : 57
          )
    starts.forEach((start, i) => {
      const note = byStart.get(start)!
      const next = starts[i + 1] ?? Infinity
      const end = Math.min(q(note.endTick), next)
      const dur = Math.max(toBeat(end - start), 0.125)
      const midi = Math.max(21, Math.min(108, note.midi + shift))
      lines.push({ note: midiToName(midi), dur: round(dur), hand, start: toBeat(start) })
    })
  }
  if (lines.length === 0) throw new Error('No playable notes found in this MIDI file')
  lines.sort((a, b) => a.start! - b.start! || (a.hand === 'L' ? -1 : 1))

  // Drop leading empty bars.
  const barLen = num
  const offset = Math.floor((lines[0].start ?? 0) / barLen) * barLen
  const notes = lines.slice(0, 3000).map((n) => ({ ...n, start: round(n.start! - offset) }))

  const quarterBpm = 60000000 / data.tempo
  const title = (options.title?.trim() || fileName.replace(/\.(mid|midi|kar)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported song').slice(0, 60)
  return {
    id: `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    composer: 'My imported song',
    intro: left ? 'Imported from a MIDI file. Chords were simplified to single notes.' : 'Imported from a MIDI file: the tune only, for your right hand.',
    bpm: Math.round(quarterBpm * beatsPerQuarter),
    timeSignature: [num, den],
    notes,
  }
}
