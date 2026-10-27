import { describe, expect, it } from 'vitest'
import { BUILT_IN_SONGS, CURRICULUM, LESSON_ORDER } from '../src/data/library'
import { barCount, barOf, barStartBeat, buildSteps, parseSong, stepsInBars, type SongJson } from '../src/music/song'
import { midiToName, noteToMidi, parseNoteName, prettyName, diatonicIndex, isBlackKey } from '../src/music/notes'

describe('note names', () => {
  it('parses names with sharps and flats', () => {
    expect(noteToMidi('C4')).toBe(60)
    expect(noteToMidi('A4')).toBe(69)
    expect(noteToMidi('C#4')).toBe(61)
    expect(noteToMidi('Db4')).toBe(61)
    expect(noteToMidi('B3')).toBe(59)
    expect(noteToMidi('Cb4')).toBe(59)
    expect(noteToMidi('A0')).toBe(21)
    expect(noteToMidi('C8')).toBe(108)
    expect(parseNoteName('H2')).toBeNull()
    expect(parseNoteName('C')).toBeNull()
  })

  it('round-trips MIDI numbers', () => {
    for (let m = 21; m <= 108; m++) expect(noteToMidi(midiToName(m))).toBe(m)
    expect(midiToName(61, true)).toBe('Db4')
  })

  it('formats and positions notes', () => {
    expect(prettyName('F#3')).toBe('F♯3')
    expect(prettyName('Bb2')).toBe('B♭2')
    expect(diatonicIndex('D4') - diatonicIndex('C4')).toBe(1)
    expect(diatonicIndex('Db4')).toBe(diatonicIndex('D4'))
    expect(diatonicIndex('C5') - diatonicIndex('C4')).toBe(7)
    expect(isBlackKey(61)).toBe(true)
    expect(isBlackKey(60)).toBe(false)
  })
})

describe('built-in songs', () => {
  it('all parse and are in the curriculum exactly once', () => {
    expect(BUILT_IN_SONGS.length).toBeGreaterThanOrEqual(20)
    const ids = LESSON_ORDER.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual(BUILT_IN_SONGS.map((s) => s.id).sort())
    expect(CURRICULUM[0].lessons[0].id).toBe('middle-c')
  })

  it('stay within a comfortable beginner range and have sensible fingers', () => {
    for (const song of BUILT_IN_SONGS) {
      for (const e of song.events) {
        expect(e.midi, song.id).toBeGreaterThanOrEqual(noteToMidi('C2'))
        expect(e.midi, song.id).toBeLessThanOrEqual(noteToMidi('C6'))
        if (e.finger !== undefined) expect([1, 2, 3, 4, 5], song.id).toContain(e.finger)
      }
      expect(song.intro.length, song.id).toBeGreaterThan(10)
    }
  })

  it('songs fill whole bars', () => {
    for (const song of BUILT_IN_SONGS.filter((s) => CURRICULUM.slice(2).some((u) => u.lessons.includes(s)))) {
      expect((song.totalBeats - song.pickup) % song.beatsPerBar, song.id).toBeCloseTo(0, 6)
    }
  })

  it('built-in songs are single-note melodies (one note at a time)', () => {
    for (const song of BUILT_IN_SONGS) {
      for (const step of buildSteps(song.events)) expect(step.notes.length, song.id).toBe(1)
    }
  })
})

describe('song parsing and structure', () => {
  const json: SongJson = {
    id: 't',
    title: 'Test',
    bpm: 120,
    timeSignature: [3, 4],
    pickup: 1,
    notes: [
      { note: 'G4', dur: 1 },
      { note: 'C4', dur: 1, finger: 1 },
      { note: 'rest', dur: 1 },
      { note: ['C3', 'E3'], dur: 1, hand: 'L', finger: [5, 3] },
      { note: 'D4', dur: 3 },
      { note: 'A2', dur: 3, hand: 'L', start: 4 },
    ],
  }
  const song = parseSong(json)

  it('places notes one after another, honouring rests, chords and explicit starts', () => {
    expect(song.events.map((e) => [e.name, e.start])).toEqual([
      ['G4', 0],
      ['C4', 1],
      ['C3', 3],
      ['E3', 3],
      ['A2', 4],
      ['D4', 4],
    ])
    expect(song.events.find((e) => e.name === 'E3')!.finger).toBe(3)
    expect(song.hands).toEqual(['R', 'L'])
    expect(song.totalBeats).toBe(7)
  })

  it('groups simultaneous notes into steps and filters by hand', () => {
    const both = buildSteps(song.events)
    expect(both.map((s) => s.notes.length)).toEqual([1, 1, 2, 2])
    expect(buildSteps(song.events, 'R').map((s) => s.notes[0].name)).toEqual(['G4', 'C4', 'D4'])
    expect(buildSteps(song.events, 'L').map((s) => s.notes.map((n) => n.name))).toEqual([['C3', 'E3'], ['A2']])
  })

  it('numbers bars with a pickup', () => {
    expect(barOf(song, 0)).toBe(0)
    expect(barOf(song, 1)).toBe(1)
    expect(barOf(song, 3.9)).toBe(1)
    expect(barOf(song, 4)).toBe(2)
    expect(barStartBeat(song, 2)).toBe(4)
    expect(barCount(song)).toBe(2)
    const steps = buildSteps(song.events)
    expect(stepsInBars(song, steps, 2, 2).map((s) => s.start)).toEqual([4])
    expect(stepsInBars(song, steps, 1, 1).map((s) => s.index)).toEqual([0, 1, 2])
  })

  it('rejects bad songs with a helpful message', () => {
    expect(() => parseSong({ ...json, notes: [{ note: 'X9', dur: 1 }] })).toThrow(/not a note name/)
    expect(() => parseSong({ ...json, notes: [] })).toThrow(/no notes/)
    expect(() => parseSong({ ...json, bpm: 0 })).toThrow(/bpm/)
    expect(() => parseSong({ ...json, notes: [{ note: 'C4', dur: 0 }] })).toThrow(/dur/)
  })
})
