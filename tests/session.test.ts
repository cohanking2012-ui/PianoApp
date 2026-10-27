import { describe, expect, it } from 'vitest'
import { starsFor, TempoSession, timingWindow, WaitSession } from '../src/music/session'
import { buildSteps, parseSong } from '../src/music/song'
import { noteToMidi as m } from '../src/music/notes'

const song = parseSong({
  id: 's',
  title: 'S',
  bpm: 60,
  notes: [
    { note: 'C4', dur: 1 },
    { note: 'D4', dur: 1 },
    { note: 'E4', dur: 1 },
    { note: ['C3', 'G3'], dur: 1, hand: 'L' },
  ],
})
const steps = buildSteps(song.events)

describe('wait mode', () => {
  it('advances only on the right note and scores first-try accuracy', () => {
    const s = new WaitSession(steps, { anyOctave: false, requireAll: false })
    expect(s.input(m('C4')).kind).toBe('correct')
    expect(s.input(m('E4'))).toMatchObject({ kind: 'wrong', played: m('E4') })
    expect(s.index).toBe(1)
    expect(s.input(m('D4')).kind).toBe('correct')
    expect(s.input(m('E4')).kind).toBe('correct')
    const last = s.input(m('G3'))
    expect(last).toMatchObject({ kind: 'correct', finished: true })
    expect(s.result()).toMatchObject({ total: 4, correct: 3, wrong: 1, accuracy: 75, stars: 2 })
    expect(s.input(m('C4')).kind).toBe('ignored')
  })

  it('can accept the right note in another octave', () => {
    const s = new WaitSession(steps, { anyOctave: true, requireAll: false })
    expect(s.input(m('C5')).kind).toBe('correct')
    expect(s.input(m('D3')).kind).toBe('correct')
  })

  it('needs every chord note when requireAll is on (MIDI keyboards)', () => {
    const s = new WaitSession(steps.slice(3), { anyOctave: false, requireAll: true })
    expect(s.input(m('C3')).kind).toBe('partial')
    expect(s.input(m('C3')).kind).toBe('partial') // repeating a held chord note is fine
    expect(s.input(m('G3')).kind).toBe('correct')
    expect(s.result().accuracy).toBe(100)
  })
})

describe('tempo mode', () => {
  const opts = { anyOctave: false, requireAll: false, secondsPerBeat: 1, originBeat: 0, windowSec: 0.3 }

  it('scores notes played on time, misses late ones and counts wrong notes', () => {
    const s = new TempoSession(steps, opts)
    expect(s.input(m('C4'), 0.1)).toMatchObject({ kind: 'hit' })
    expect(s.input(m('D4'), 1.5).kind).toBe('wrong') // too late for D4
    expect(s.update(1.5)).toEqual([1])
    expect(s.input(m('E4'), 1.9)).toMatchObject({ kind: 'hit' })
    expect(s.finished).toBe(false)
    s.update(10)
    expect(s.finished).toBe(true)
    expect(s.states).toEqual(['hit', 'missed', 'hit', 'missed'])
    expect(s.result()).toMatchObject({ total: 4, correct: 2, wrong: 1, missed: 2, accuracy: 40 })
  })

  it('matches the nearest pending step of that pitch', () => {
    const rep = buildSteps(parseSong({ id: 'r', title: 'R', bpm: 60, notes: [{ note: 'C4', dur: 1 }, { note: 'C4', dur: 1 }] }).events)
    const s = new TempoSession(rep, { ...opts, windowSec: 0.6 })
    expect(s.input(m('C4'), 0.9)).toMatchObject({ kind: 'hit', step: { index: 1 } })
    expect(s.input(m('C4'), 0.2)).toMatchObject({ kind: 'hit', step: { index: 0 } })
  })

  it('measures time from the start of the practised section', () => {
    const s = new TempoSession(steps.slice(2), { ...opts, originBeat: 2 })
    expect(s.times).toEqual([0, 1])
    expect(s.endTime).toBeCloseTo(1.3)
  })

  it('timing window and stars are sensible', () => {
    expect(timingWindow(0.25)).toBe(0.2)
    expect(timingWindow(2)).toBe(0.45)
    expect([starsFor(95), starsFor(80), starsFor(50), starsFor(10)]).toEqual([3, 2, 1, 0])
  })
})
