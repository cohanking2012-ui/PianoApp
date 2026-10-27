import { describe, expect, it } from 'vitest'
import { NoteTracker, gateToSensitivity, sensitivityToGate } from '../src/audio/noteTracker'
import { midiToFrequency, noteToMidi } from '../src/music/notes'
import { addNoise, renderPerformance, runPipeline, type ScoreNote } from './helpers/signals'

const SR = 48000

/** Builds a melody at a given tempo: each note held for `legato` of its slot. */
function melody(names: string[], secondsPerNote = 0.5, legato = 0.9, velocity = 0.4): ScoreNote[] {
  return names.map((n, i) => ({ midi: noteToMidi(n), start: 0.2 + i * secondsPerNote, dur: secondsPerNote * legato, velocity }))
}

const names = (events: { midi: number }[]) => events.map((e) => e.midi)

describe('note tracker on rendered performances', () => {
  it('reports each note of a melody exactly once', () => {
    const tune = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']
    const events = runPipeline(renderPerformance(melody(tune), SR), SR)
    expect(names(events)).toEqual(tune.map(noteToMidi))
  })

  it('catches repeated notes played without a gap (re-struck keys)', () => {
    // Mary had a little lamb: E D C D E E E — the three Es are fully legato.
    const tune = ['E4', 'D4', 'C4', 'D4', 'E4', 'E4', 'E4']
    const events = runPipeline(renderPerformance(melody(tune, 0.45, 1.0), SR), SR)
    expect(names(events)).toEqual(tune.map(noteToMidi))
  })

  it('works in the bass and with a quiet room noise', () => {
    const tune = ['C3', 'E3', 'G3', 'C3', 'G2', 'C3']
    const audio = renderPerformance(melody(tune, 0.6), SR, { noise: 0.003 })
    expect(names(runPipeline(audio, SR))).toEqual(tune.map(noteToMidi))
  })

  it('works with a fast-ish melody (about 5 notes per second)', () => {
    const tune = ['E5', 'D#5', 'E5', 'D#5', 'E5', 'B4', 'D5', 'C5', 'A4']
    const events = runPipeline(renderPerformance(melody(tune, 0.2, 0.95), SR), SR, { minStableMs: 50 })
    expect(names(events)).toEqual(tune.map(noteToMidi))
  })

  it('does not report the earlier note when a new key is struck over a ringing one', () => {
    const notes: ScoreNote[] = [
      { midi: 60, start: 0.1, dur: 2, velocity: 0.6 },
      { midi: 62, start: 0.8, dur: 1, velocity: 0.4 },
    ]
    expect(names(runPipeline(renderPerformance(notes, SR), SR))).toEqual([60, 62])
  })

  it('copes with overlapping notes (earlier notes keep ringing and beat together)', () => {
    const tune = ['C4', 'D4', 'E4', 'F4', 'G4']
    const notes = tune.map((n, i) => ({ midi: noteToMidi(n), start: 0.2 + i * 0.5, dur: 1.0, velocity: 0.4 }))
    expect(names(runPipeline(renderPerformance(notes, SR), SR))).toEqual(tune.map(noteToMidi))
  })

  it('with the sustain pedal, limiting the search to the lesson range avoids chord "ghost" notes', () => {
    const tune = ['C4', 'D4', 'E4', 'C4', 'G4']
    const notes = tune.map((n, i) => ({ midi: noteToMidi(n), start: 0.2 + i * 0.5, dur: 3, velocity: 0.4 }))
    const range = { minFrequency: midiToFrequency(53), maxFrequency: midiToFrequency(79) }
    const played = names(runPipeline(renderPerformance(notes, SR), SR, {}, range))
    expect(played.slice(0, 3)).toEqual([60, 62, 64])
    expect(played.every((m) => m >= 53)).toBe(true)
  })

  it('ignores background noise', () => {
    const audio = addNoise(new Float32Array(SR * 2), 0.02)
    expect(runPipeline(audio, SR, { gate: 0.01 })).toEqual([])
  })

  it('ignores notes quieter than the noise gate', () => {
    const audio = renderPerformance(melody(['C4', 'E4', 'G4'], 0.5, 0.9, 0.004), SR)
    expect(runPipeline(audio, SR, { gate: 0.01 })).toEqual([])
  })

  it('a long held note is reported once, even as it fades', () => {
    const audio = renderPerformance([{ midi: 57, start: 0.1, dur: 3, velocity: 0.5 }], SR)
    expect(names(runPipeline(audio, SR))).toEqual([57])
  })
})

describe('note tracker unit behaviour', () => {
  const pitch = (frequency: number) => ({ frequency, clarity: 0.95 })

  it('needs the pitch to be steady for the confirmation window', () => {
    const t = new NoteTracker({ minStableMs: 60 })
    expect(t.process({ time: 0, level: 0.1, pitch: pitch(440) })).toBeNull()
    expect(t.process({ time: 30, level: 0.1, pitch: pitch(440) })).toBeNull()
    expect(t.process({ time: 64, level: 0.1, pitch: pitch(440) })?.midi).toBe(69)
  })

  it('a single stray reading does not become a note', () => {
    const t = new NoteTracker({ minStableMs: 60 })
    const seq = [440, 440, 523.25, 440, 440, 440, 440, 440, 440]
    const out = seq.map((f, i) => t.process({ time: i * 16, level: 0.1, pitch: pitch(f) })).filter(Boolean)
    expect(out.map((e) => e!.midi)).toEqual([69])
  })

  it('ignores a jump to an octave harmonic without a new attack', () => {
    const t = new NoteTracker({ minStableMs: 40 })
    for (let i = 0; i <= 5; i++) t.process({ time: i * 16, level: 0.1, pitch: pitch(220) })
    const later = []
    for (let i = 6; i < 30; i++) later.push(t.process({ time: i * 16, level: 0.08, pitch: pitch(440) }))
    expect(later.filter(Boolean)).toEqual([])
  })

  it('maps sensitivity to a gate level and back', () => {
    expect(sensitivityToGate(100)).toBeLessThan(sensitivityToGate(50))
    expect(sensitivityToGate(50)).toBeCloseTo(0.01, 2)
    for (const s of [0, 25, 50, 75, 100]) expect(gateToSensitivity(sensitivityToGate(s))).toBe(s)
  })
})
