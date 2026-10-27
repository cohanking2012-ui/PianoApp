import { detectPitch, rms, type YinOptions } from '../../src/audio/yin'
import { NoteTracker, type NoteOnEvent, type TrackerOptions } from '../../src/audio/noteTracker'
import { midiToFrequency } from '../../src/music/notes'
import { ATTACK_SAMPLES } from '../../src/audio/micEngine.constants'

/** Deterministic pseudo-random numbers so tests are repeatable. */
export function rng(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function sine(freq: number, sampleRate: number, length: number, amplitude = 0.5, phase = 0) {
  const out = new Float32Array(length)
  for (let i = 0; i < length; i++) out[i] = amplitude * Math.sin(phase + (2 * Math.PI * freq * i) / sampleRate)
  return out
}

/** A crude piano-like tone: several harmonics, each with its own amplitude. */
export function harmonicTone(freq: number, sampleRate: number, length: number, harmonics: number[], amplitude = 0.5) {
  const out = new Float32Array(length)
  const total = harmonics.reduce((a, b) => a + b, 0)
  harmonics.forEach((h, k) => {
    const f = freq * (k + 1) * (1 + 0.0004 * k * k) // slight piano-string inharmonicity
    for (let i = 0; i < length; i++) out[i] += ((amplitude * h) / total) * Math.sin((2 * Math.PI * f * i) / sampleRate + k)
  })
  return out
}

export function addNoise(buf: Float32Array, amplitude: number, seed = 7) {
  const r = rng(seed)
  for (let i = 0; i < buf.length; i++) buf[i] += (r() * 2 - 1) * amplitude
  return buf
}

export const PIANO_HARMONICS = [1, 0.7, 0.45, 0.3, 0.2, 0.12, 0.08]

export interface ScoreNote {
  midi: number
  /** seconds */
  start: number
  /** seconds the key is held (sound then fades quickly) */
  dur: number
  velocity?: number
}

/** Renders a little performance: decaying piano-like notes, optional background noise. */
export function renderPerformance(notes: ScoreNote[], sampleRate: number, opts: { noise?: number; harmonics?: number[]; tail?: number } = {}) {
  const end = Math.max(...notes.map((n) => n.start + n.dur)) + (opts.tail ?? 0.5)
  const out = new Float32Array(Math.ceil(end * sampleRate))
  const harmonics = opts.harmonics ?? PIANO_HARMONICS
  for (const n of notes) {
    const f0 = midiToFrequency(n.midi)
    const startIdx = Math.floor(n.start * sampleRate)
    const releaseIdx = Math.floor((n.start + n.dur) * sampleRate)
    const total = harmonics.reduce((a, b) => a + b, 0)
    for (let i = startIdx; i < out.length; i++) {
      const t = (i - startIdx) / sampleRate
      const attack = Math.min(1, t / 0.005)
      let env = attack * Math.exp(-t * 1.5)
      if (i > releaseIdx) env *= Math.exp(-((i - releaseIdx) / sampleRate) * 25)
      if (env < 1e-4 && i > releaseIdx) break
      let s = 0
      harmonics.forEach((h, k) => {
        const f = f0 * (k + 1) * (1 + 0.0004 * k * k)
        s += (h / total) * Math.sin(2 * Math.PI * f * t + k) * Math.exp(-t * k * 0.6)
      })
      out[i] += (n.velocity ?? 0.4) * env * s
    }
  }
  if (opts.noise) addNoise(out, opts.noise)
  return out
}

/** Runs audio through the same pipeline the app uses (sliding window → YIN → tracker). */
export function runPipeline(
  audio: Float32Array,
  sampleRate: number,
  trackerOptions: Partial<TrackerOptions> = {},
  yinOptions: YinOptions = {},
  frameSize = 2048,
  hopMs = 16
): NoteOnEvent[] {
  const tracker = new NoteTracker(trackerOptions)
  const hop = Math.round((hopMs / 1000) * sampleRate)
  const events: NoteOnEvent[] = []
  for (let end = frameSize; end <= audio.length; end += hop) {
    const frame = audio.subarray(end - frameSize, end)
    const level = rms(frame)
    const pitch = level >= (tracker.options.gate * 0.75) ? detectPitch(frame, sampleRate, yinOptions) : null
    const attackLevel = rms(audio.subarray(end - ATTACK_SAMPLES, end))
    const ev = tracker.process({ time: (end / sampleRate) * 1000, level, attackLevel, pitch })
    if (ev) events.push(ev)
  }
  return events
}
