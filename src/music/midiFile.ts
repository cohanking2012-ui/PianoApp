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
    tracks.push({ name, notes })
  }
  return { format, ticksPerBeat, tempo, timeSignature, tracks }
}

const round = (x: number) => Math.round(x * 1000) / 1000

/**
 * Converts a parsed MIDI file into a song. The app teaches single-note
 * playing, so each hand is reduced to one line: the top note of chords for
 * the right hand and the bottom note for the left hand. Drums are skipped.
 */
export function midiToSong(data: MidiFileData, fileName: string): SongJson {
  const tracks = data.tracks
    .map((t) => ({ ...t, notes: t.notes.filter((n) => n.channel !== 9) }))
    .filter((t) => t.notes.length > 0)
  if (tracks.length === 0) throw new Error('No piano notes found in this MIDI file')

  // Decide which notes belong to which hand.
  const handed: { note: MidiNote; hand: Hand }[] = []
  if (tracks.length === 1) {
    for (const note of tracks[0].notes) handed.push({ note, hand: note.midi >= 60 ? 'R' : 'L' })
  } else {
    const avg = (t: MidiTrack) => t.notes.reduce((s, n) => s + n.midi, 0) / t.notes.length
    const sorted = [...tracks].sort((a, b) => avg(b) - avg(a))
    sorted.forEach((t, i) => {
      const hand: Hand = i === 0 ? 'R' : i === 1 ? 'L' : avg(t) >= 60 ? 'R' : 'L'
      for (const note of t.notes) handed.push({ note, hand })
    })
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
    starts.forEach((start, i) => {
      const note = byStart.get(start)!
      const next = starts[i + 1] ?? Infinity
      const end = Math.min(q(note.endTick), next)
      const dur = Math.max(toBeat(end - start), 0.125)
      lines.push({ note: midiToName(note.midi), dur: round(dur), hand, start: toBeat(start) })
    })
  }
  if (lines.length === 0) throw new Error('No playable notes found in this MIDI file')
  lines.sort((a, b) => a.start! - b.start! || (a.hand === 'L' ? -1 : 1))

  // Drop leading empty bars.
  const barLen = num
  const offset = Math.floor((lines[0].start ?? 0) / barLen) * barLen
  const notes = lines.slice(0, 3000).map((n) => ({ ...n, start: round(n.start! - offset) }))

  const quarterBpm = 60000000 / data.tempo
  const title = (fileName.replace(/\.(mid|midi)$/i, '').replace(/[_-]+/g, ' ').trim() || 'Imported song').slice(0, 60)
  return {
    id: `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    composer: 'Imported MIDI file',
    intro: 'Imported from a MIDI file. Chords were simplified to single notes.',
    bpm: Math.round(quarterBpm * beatsPerQuarter),
    timeSignature: [num, den],
    notes,
  }
}
