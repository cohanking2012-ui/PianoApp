import { describe, expect, it } from 'vitest'
import { guessParts, listParts, midiToSong, parseMidiFile } from '../src/music/midiFile'
import { parseSong, buildSteps } from '../src/music/song'

/** Tiny MIDI file writer for tests. Events: [deltaTicks, ...bytes]. */
function vlq(n: number) {
  const bytes = [n & 0x7f]
  while ((n >>= 7)) bytes.unshift((n & 0x7f) | 0x80)
  return bytes
}
function track(events: number[][]) {
  const body = events.flatMap(([delta, ...bytes]) => [...vlq(delta), ...bytes])
  body.push(0, 0xff, 0x2f, 0)
  const len = body.length
  return [0x4d, 0x54, 0x72, 0x6b, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255, ...body]
}
function midiFile(format: number, ppq: number, tracks: number[][]) {
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, format, 0, tracks.length, ppq >> 8, ppq & 255, ...tracks.flat()])
}
const name = (s: string) => [0xff, 0x03, s.length, ...[...s].map((c) => c.charCodeAt(0))]

describe('MIDI file import', () => {
  const PPQ = 480
  // 100 BPM (600000 µs/quarter), 3/4 time; right hand C4 D4 E4 with a chord, left hand C3.
  const tempoTrack = track([
    [0, 0xff, 0x51, 3, 0x09, 0x27, 0xc0],
    [0, 0xff, 0x58, 4, 3, 2, 24, 8],
  ])
  const rh = track([
    [0, ...name('Right')],
    [0, 0x90, 60, 80],
    [PPQ, 0x80, 60, 0],
    [0, 0x90, 62, 80],
    [PPQ, 62, 0], // running status note-on with velocity 0 = note off
    [0, 64, 80, 0, 67, 80], // chord E4 + G4 (running status)
    [PPQ * 2, 0x80, 64, 0, 0, 0x80, 67, 0],
  ])
  const lh = track([
    [0, 0x91, 48, 70],
    [PPQ * 3, 0x81, 48, 0],
    [0, 0x99, 36, 100], // drum on channel 10: ignored
    [10, 0x89, 36, 0],
  ])
  const bytes = midiFile(1, PPQ, [tempoTrack, rh, lh])

  it('reads header, tempo, time signature and notes (incl. running status)', () => {
    const data = parseMidiFile(bytes)
    expect(data.format).toBe(1)
    expect(data.ticksPerBeat).toBe(PPQ)
    expect(data.tempo).toBe(600000)
    expect(data.timeSignature).toEqual([3, 4])
    expect(data.tracks[1].name).toBe('Right')
    expect(data.tracks[1].notes.map((n) => n.midi)).toEqual([60, 62, 67, 64])
    expect(data.tracks[2].notes.map((n) => [n.midi, n.channel])).toEqual([
      [48, 1],
      [36, 9],
    ])
  })

  it('converts to a playable song: hands assigned, chords reduced, drums dropped', () => {
    const json = midiToSong(parseMidiFile(bytes), 'my_song.mid')
    expect(json.title).toBe('my song')
    expect(json.bpm).toBe(100)
    expect(json.timeSignature).toEqual([3, 4])
    const song = parseSong(json, true)
    expect(song.events.map((e) => [e.name, e.hand, e.start, e.dur])).toEqual([
      ['C3', 'L', 0, 3],
      ['C4', 'R', 0, 1],
      ['D4', 'R', 1, 1],
      ['G4', 'R', 2, 2],
    ])
    expect(buildSteps(song.events, 'R').length).toBe(3)
  })

  it('splits a single-track file into hands at middle C', () => {
    const one = midiFile(0, 96, [track([[0, 0x90, 72, 90], [96, 0x90, 50, 90], [96, 0x80, 72, 0], [0, 0x80, 50, 0]])])
    const song = parseSong(midiToSong(parseMidiFile(one), 'x.mid'))
    expect(song.events.map((e) => [e.name, e.hand])).toEqual([
      ['C5', 'R'],
      ['D3', 'L'],
    ])
  })

  it('rejects files that are not MIDI', () => {
    expect(() => parseMidiFile(new TextEncoder().encode('hello world, not midi'))).toThrow(/not a MIDI file/)
    const drumsOnly = midiFile(0, 96, [track([[0, 0x99, 36, 90], [96, 0x89, 36, 0]])])
    expect(() => midiToSong(parseMidiFile(drumsOnly), 'd.mid')).toThrow(/No piano notes/)
  })

  it('finds the sung melody in a band arrangement and fits it near middle C', () => {
    const band = midiFile(1, 96, [
      track([[0, ...name('Bass')], [0, 0xc0, 33], [0, 0x90, 36, 90], [96, 0x80, 36, 0], [0, 0x90, 43, 90], [96, 0x80, 43, 0]]),
      track([
        [0, ...name('Lead Vocals')],
        [0, 0xc1, 53],
        ...[88, 91, 93, 91, 88, 86, 84, 86].flatMap((m) => [[0, 0x91, m, 90], [96, 0x81, m, 0]]),
      ]),
      track([[0, ...name('Piano')], [0, 0xc2, 0], [0, 0x92, 60, 80, 0, 64, 80, 0, 67, 80], [192, 0x82, 60, 0, 0, 64, 0, 0, 67, 0]]),
      track([[0, 0x99, 36, 100], [48, 0x89, 36, 0]]),
    ])
    const data = parseMidiFile(band)
    const parts = listParts(data)
    expect(parts.map((p) => [p.name, p.instrument])).toEqual([
      ['Bass', 'Bass'],
      ['Lead Vocals', 'Voice & strings'],
      ['Piano', 'Piano'],
    ])
    expect(parts[2].chordiness).toBe(1)
    const guess = guessParts(parts)
    expect(guess.melody).toBe(parts[1].id)
    expect(guess.left).toBeNull()
    const song = parseSong(midiToSong(data, 'hit.mid'))
    expect(song.hands).toEqual(['R'])
    // A very high line (E6) is moved down an octave into a comfortable range.
    expect(song.events.map((e) => e.name)).toEqual(['E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5'])
    const withPiano = parseSong(midiToSong(data, 'hit.mid', { melody: parts[2].id, left: null, fitRange: false }))
    expect(withPiano.events.map((e) => e.name)).toEqual(['G4']) // top note of the chord
  })

  it('splits a single track that uses several channels into separate parts', () => {
    const fmt0 = midiFile(0, 96, [track([[0, 0x90, 72, 90], [0, 0x91, 48, 90], [96, 0x80, 72, 0], [0, 0x81, 48, 0]])])
    expect(listParts(parseMidiFile(fmt0)).map((p) => p.name)).toEqual(['Track 1 (channel 1)', 'Track 1 (channel 2)'])
  })
})
