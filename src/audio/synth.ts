import { getAudioContext } from './audioContext'
import { midiToFrequency } from '../music/notes'
import { micEngine } from './micEngine'

/** A small piano-like synthesiser for demos, key taps and metronome clicks. */

let master: GainNode | null = null
let noise: AudioBuffer | null = null

function out(): GainNode {
  const ctx = getAudioContext()
  if (!master || master.context !== ctx) {
    master = ctx.createGain()
    master.gain.value = 0.8
    const comp = ctx.createDynamicsCompressor()
    master.connect(comp)
    comp.connect(ctx.destination)
  }
  return master
}

/**
 * Plays a note. `when` is an AudioContext time (defaults to now).
 * The microphone ignores input while the app itself is making sound.
 */
export function playNote(midi: number, duration = 0.6, when?: number, velocity = 0.7): () => void {
  const ctx = getAudioContext()
  const t = Math.max(when ?? ctx.currentTime, ctx.currentTime)
  const f = midiToFrequency(midi)
  const env = ctx.createGain()
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(Math.min(8000, f * 8), t)
  filter.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2), t + duration + 0.4)
  env.connect(filter)
  filter.connect(out())

  const peak = 0.32 * velocity
  env.gain.setValueAtTime(0, t)
  env.gain.linearRampToValueAtTime(peak, t + 0.006)
  env.gain.exponentialRampToValueAtTime(peak * 0.35, t + Math.min(0.5, duration))
  const end = t + duration + 0.35
  env.gain.setValueAtTime(peak * 0.35, t + duration)
  env.gain.exponentialRampToValueAtTime(0.0001, end)

  const partials: [number, OscillatorType, number][] = [
    [1, 'triangle', 1],
    [2, 'sine', 0.35],
    [3, 'sine', 0.12],
  ]
  const oscs: OscillatorNode[] = []
  for (const [mult, type, gain] of partials) {
    const osc = ctx.createOscillator()
    oscs.push(osc)
    osc.type = type
    osc.frequency.value = f * mult
    const g = ctx.createGain()
    g.gain.value = gain
    osc.connect(g)
    g.connect(env)
    osc.start(t)
    osc.stop(end + 0.05)
  }
  micEngine.suppressUntil(performance.now() + (end - ctx.currentTime) * 1000 + 150)
  return () => {
    try {
      env.gain.cancelScheduledValues(ctx.currentTime)
      env.gain.setTargetAtTime(0, ctx.currentTime, 0.02)
      oscs.forEach((o) => o.stop(ctx.currentTime + 0.1))
    } catch {
      /* already stopped */
    }
  }
}

/** Short unpitched click (filtered noise) so it doesn't confuse pitch detection. */
export function playClick(when?: number, accent = false): () => void {
  const ctx = getAudioContext()
  const t = Math.max(when ?? ctx.currentTime, ctx.currentTime)
  if (!noise || noise.sampleRate !== ctx.sampleRate) {
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const src = ctx.createBufferSource()
  src.buffer = noise
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = accent ? 3200 : 2200
  filter.Q.value = 1.2
  const g = ctx.createGain()
  g.gain.setValueAtTime(accent ? 1.2 : 0.7, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.035)
  src.connect(filter)
  filter.connect(g)
  g.connect(out())
  src.start(t)
  src.stop(t + 0.05)
  return () => {
    try {
      src.stop()
    } catch {
      /* already stopped */
    }
  }
}
