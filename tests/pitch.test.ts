import { describe, expect, it } from 'vitest'
import { detectPitch, rms } from '../src/audio/yin'
import { frequencyToMidi, midiToFrequency, midiToName } from '../src/music/notes'
import { addNoise, harmonicTone, PIANO_HARMONICS, rng, sine } from './helpers/signals'

const RATES = [44100, 48000]

function detectMidi(buf: Float32Array, sr: number) {
  const p = detectPitch(buf, sr)
  return p ? frequencyToMidi(p.frequency) : null
}

describe('YIN pitch detection on pure sine waves', () => {
  for (const sr of RATES) {
    it(`finds every note from C2 to C7 at ${sr} Hz`, () => {
      for (let midi = 36; midi <= 96; midi++) {
        const f = midiToFrequency(midi)
        const buf = sine(f, sr, 2048)
        const p = detectPitch(buf, sr)
        expect(p, midiToName(midi)).not.toBeNull()
        // within 5 cents
        expect(Math.abs(1200 * Math.log2(p!.frequency / f)), midiToName(midi)).toBeLessThan(5)
        expect(frequencyToMidi(p!.frequency)).toBe(midi)
      }
    })
  }

  it('is precise for A4 = 440 Hz and middle C', () => {
    expect(detectPitch(sine(440, 48000, 2048), 48000)!.frequency).toBeCloseTo(440, 0)
    expect(detectPitch(sine(261.63, 44100, 2048), 44100)!.frequency).toBeCloseTo(261.63, 0)
  })

  it('reports high clarity for a clean tone', () => {
    expect(detectPitch(sine(330, 48000, 2048), 48000)!.clarity).toBeGreaterThan(0.95)
  })
})

describe('YIN on piano-like tones', () => {
  it('finds the fundamental of tones with many harmonics', () => {
    for (let midi = 40; midi <= 88; midi += 1) {
      const buf = harmonicTone(midiToFrequency(midi), 48000, 2048, PIANO_HARMONICS)
      expect(detectMidi(buf, 48000), midiToName(midi)).toBe(midi)
    }
  })

  it('does not jump an octave when the 2nd harmonic is stronger than the fundamental', () => {
    for (const midi of [48, 55, 60, 64, 67, 72]) {
      const buf = harmonicTone(midiToFrequency(midi), 44100, 2048, [0.6, 1, 0.5, 0.3, 0.2])
      expect(detectMidi(buf, 44100), midiToName(midi)).toBe(midi)
    }
  })

  it('copes with background noise (about 20 dB below the note)', () => {
    for (const midi of [48, 57, 60, 62, 64, 65, 67, 69, 71, 72, 76]) {
      const buf = addNoise(harmonicTone(midiToFrequency(midi), 48000, 2048, PIANO_HARMONICS, 0.5), 0.05, midi)
      expect(detectMidi(buf, 48000), midiToName(midi)).toBe(midi)
    }
  })
})

describe('YIN rejects things that are not notes', () => {
  it('returns null for silence', () => {
    expect(detectPitch(new Float32Array(2048), 48000)).toBeNull()
  })

  it('returns null (or very low clarity) for white noise', () => {
    const r = rng(42)
    const buf = new Float32Array(2048).map(() => r() * 2 - 1)
    const p = detectPitch(buf, 48000)
    expect(p === null || p.clarity < 0.7).toBe(true)
  })
})

describe('frequency → note conversion', () => {
  it('accepts slightly out-of-tune notes', () => {
    expect(frequencyToMidi(midiToFrequency(60) * Math.pow(2, 20 / 1200))).toBe(60)
    expect(frequencyToMidi(midiToFrequency(60) * Math.pow(2, -30 / 1200))).toBe(60)
  })

  it('rejects readings that sit between two notes', () => {
    expect(frequencyToMidi(midiToFrequency(60) * Math.pow(2, 50 / 1200))).toBeNull()
  })

  it('respects a custom A4 tuning', () => {
    expect(frequencyToMidi(432, 45, 432)).toBe(69)
    // 432 Hz is 32 cents flat of A4 = 440 Hz: accepted with the default tolerance, rejected with a strict one.
    expect(frequencyToMidi(432)).toBe(69)
    expect(frequencyToMidi(432, 25)).toBeNull()
  })

  it('computes RMS', () => {
    expect(rms(sine(440, 48000, 4800, 1))).toBeCloseTo(Math.SQRT1_2, 2)
  })
})
