import { getAudioContext, resetAudioContext, unlockAudio } from './audioContext'
import { ATTACK_SAMPLES, FRAME_SIZE } from './micEngine.constants'
import { NoteTracker, type LiveReading, type NoteOnEvent, type TrackerOptions } from './noteTracker'
import { detectPitch, rms } from './yin'
import { midiToFrequency } from '../music/notes'

export type MicStatus = 'idle' | 'starting' | 'listening' | 'paused' | 'denied' | 'unsupported' | 'error'

export interface MicState {
  status: MicStatus
  /** Friendly explanation when something went wrong. */
  message: string
}

type Listener<T> = (value: T) => void

/** Full piano range used when no lesson narrows it down. */
const DEFAULT_RANGE: [number, number] = [36, 100] // C2 .. E7

/**
 * Listens to the microphone and reports the notes played on a real piano.
 * One instance is shared by the whole app so permission is only asked once.
 */
class MicEngine {
  state: MicState = { status: 'idle', message: '' }
  live: LiveReading = { midi: null, cents: 0, frequency: 0, level: 0, active: false }
  readonly tracker = new NoteTracker()

  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  private sink: GainNode | null = null
  private buffer = new Float32Array(FRAME_SIZE)
  private raf = 0
  private suppressedUntil = 0
  private range: [number, number] = DEFAULT_RANGE
  private stateListeners = new Set<Listener<MicState>>()
  private noteListeners = new Set<Listener<NoteOnEvent>>()
  private frameListeners = new Set<Listener<LiveReading>>()
  private levelSamples: number[] | null = null
  /** When the input last carried any signal at all (watchdog for a dead audio pipeline). */
  private lastSignal = 0
  private needsFreshContext = false

  // ---- subscriptions -------------------------------------------------------
  subscribe = (fn: Listener<MicState>) => {
    this.stateListeners.add(fn)
    return () => void this.stateListeners.delete(fn)
  }
  getState = () => this.state
  onNote(fn: Listener<NoteOnEvent>) {
    this.noteListeners.add(fn)
    return () => void this.noteListeners.delete(fn)
  }
  onFrame(fn: Listener<LiveReading>) {
    this.frameListeners.add(fn)
    return () => void this.frameListeners.delete(fn)
  }

  private setState(status: MicStatus, message = '') {
    this.state = { status, message }
    this.stateListeners.forEach((fn) => fn(this.state))
  }

  get listening() {
    return this.state.status === 'listening'
  }

  setOptions(options: Partial<TrackerOptions>) {
    this.tracker.setOptions(options)
  }

  /** Narrows pitch detection to the notes a lesson uses (fewer mistakes, less CPU). */
  setRange(range: [number, number] | null) {
    this.range = range ? [Math.max(28, range[0] - 7), Math.min(108, range[1] + 7)] : DEFAULT_RANGE
  }

  /** Ignore the microphone until this performance.now() time (app is playing sound). */
  suppressUntil(time: number) {
    this.suppressedUntil = Math.max(this.suppressedUntil, time)
  }

  // ---- start / stop ------------------------------------------------------------
  /** Must be called from a tap/click (iOS requirement). */
  async start(): Promise<void> {
    if (this.state.status === 'listening' || this.state.status === 'starting') return
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.setState(
        'unsupported',
        window.isSecureContext
          ? 'This browser cannot use the microphone. Please open the app in Safari (iPhone) or Chrome (Android).'
          : 'The microphone only works when the app is opened over a secure (https://) link.'
      )
      return
    }
    this.setState('starting')
    try {
      if (this.needsFreshContext) {
        resetAudioContext()
        this.needsFreshContext = false
      }
      // Unlock audio first, while we are still inside the tap.
      const ctxPromise = unlockAudio()
      if (navigator.audioSession) {
        try {
          navigator.audioSession.type = 'play-and-record'
        } catch {
          /* not supported */
        }
      }
      if (!this.stream || !this.stream.getAudioTracks().some((t) => t.readyState === 'live')) {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        })
        this.stream.getAudioTracks().forEach((t) =>
          t.addEventListener('ended', () => {
            if (this.state.status === 'listening') this.teardown('paused', 'Listening stopped. Tap to start again.')
          })
        )
      }
      const ctx = await ctxPromise
      if (ctx.state !== 'running') await ctx.resume()
      this.connect(ctx)
      this.lastSignal = performance.now()
      this.setState('listening')
      this.loop()
    } catch (err) {
      const e = err as DOMException
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
        this.teardown('denied', 'Microphone access was blocked.')
      } else if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') {
        this.teardown('error', 'No microphone was found on this device.')
      } else if (e?.name === 'NotReadableError') {
        this.teardown('error', 'The microphone is being used by another app. Close other apps that record sound and try again.')
      } else {
        this.teardown('error', `Could not start the microphone (${e?.message || e}).`)
      }
    }
  }

  stop() {
    this.teardown('idle')
  }

  private connect(ctx: AudioContext) {
    this.disconnectNodes()
    this.source = ctx.createMediaStreamSource(this.stream!)
    const highpass = ctx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = 45 // remove rumble below the lowest notes we teach
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = FRAME_SIZE
    // Some browsers only process nodes that lead to the speakers: connect through a muted gain.
    this.sink = ctx.createGain()
    this.sink.gain.value = 0
    this.source.connect(highpass)
    highpass.connect(this.analyser)
    this.analyser.connect(this.sink)
    this.sink.connect(ctx.destination)
    this.tracker.reset()
    ctx.onstatechange = () => {
      if (this.state.status !== 'listening') return
      if (ctx.state !== 'running') this.teardown('paused', 'Listening paused. Tap to continue.', true)
    }
  }

  private disconnectNodes() {
    this.source?.disconnect()
    this.analyser?.disconnect()
    this.sink?.disconnect()
    this.source = this.analyser = this.sink = null
  }

  private teardown(status: MicStatus, message = '', keepStream = false) {
    cancelAnimationFrame(this.raf)
    this.disconnectNodes()
    if (!keepStream) {
      this.stream?.getTracks().forEach((t) => t.stop())
      this.stream = null
    }
    this.live = { midi: null, cents: 0, frequency: 0, level: 0, active: false }
    this.frameListeners.forEach((fn) => fn(this.live))
    this.setState(status, message)
  }

  // ---- analysis loop -----------------------------------------------------------
  private loop = () => {
    if (!this.analyser) return
    this.raf = requestAnimationFrame(this.loop)
    const analyser = this.analyser
    const buf = this.buffer
    analyser.getFloatTimeDomainData(buf)
    const now = performance.now()
    const level = rms(buf)
    this.levelSamples?.push(level)

    // A real microphone is never perfectly silent. Pure digital silence for
    // several seconds means the audio pipeline is stuck (seen on some phones
    // after an interruption): rebuild it on the next tap.
    if (level > 0) this.lastSignal = now
    else if (now - this.lastSignal > 4000) {
      this.needsFreshContext = true
      this.teardown('paused', "The microphone isn't sending any sound. Tap to start again.")
      return
    }

    if (now < this.suppressedUntil) {
      this.tracker.reset()
      this.live = { midi: null, cents: 0, frequency: 0, level, active: false }
      this.frameListeners.forEach((fn) => fn(this.live))
      return
    }

    const attackLevel = rms(buf.subarray(buf.length - ATTACK_SAMPLES))
    const sampleRate = getAudioContext().sampleRate
    const pitch =
      level >= this.tracker.options.gate * 0.75
        ? detectPitch(buf, sampleRate, {
            minFrequency: midiToFrequency(this.range[0]) * 0.97,
            maxFrequency: midiToFrequency(this.range[1]) * 1.03,
          })
        : null
    const event = this.tracker.process({ time: now, level, attackLevel, pitch })
    this.live = this.tracker.live
    this.frameListeners.forEach((fn) => fn(this.live))
    if (event) this.noteListeners.forEach((fn) => fn(event))
  }

  /**
   * Measures the room's background noise for `ms` milliseconds and returns
   * a noise-gate level comfortably above it. The mic must be listening.
   */
  async measureNoise(ms = 2000): Promise<number> {
    this.levelSamples = []
    await new Promise((r) => setTimeout(r, ms))
    const samples = this.levelSamples.sort((a, b) => a - b)
    this.levelSamples = null
    if (!samples.length) throw new Error('The microphone is not listening')
    const p90 = samples[Math.floor(samples.length * 0.9)]
    return Math.min(0.1, Math.max(0.002, p90 * 3))
  }
}

export const micEngine = new MicEngine()
