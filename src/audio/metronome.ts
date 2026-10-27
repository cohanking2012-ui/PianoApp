import { getAudioContext } from './audioContext'
import { playClick } from './synth'

/**
 * Sample-accurate metronome: a short timer looks ahead and schedules clicks
 * on the audio clock, so timing stays steady even if the page is busy.
 */
export class Metronome {
  private timer: number | null = null
  private nextTime = 0
  private beat = 0
  bpm = 80
  beatsPerBar = 4
  /** Called (roughly on time) for each beat, for visuals. */
  onBeat: ((beat: number) => void) | null = null
  private visualTimers: number[] = []

  get running() {
    return this.timer !== null
  }

  /** Starts clicking. `startAt` is an AudioContext time (default: almost now). */
  start(startAt?: number) {
    this.stop()
    const ctx = getAudioContext()
    this.nextTime = startAt ?? ctx.currentTime + 0.05
    this.beat = 0
    this.timer = window.setInterval(() => this.schedule(), 25)
    this.schedule()
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    this.visualTimers.forEach((t) => window.clearTimeout(t))
    this.visualTimers = []
  }

  private schedule() {
    const ctx = getAudioContext()
    while (this.nextTime < ctx.currentTime + 0.12) {
      const beatInBar = this.beat % this.beatsPerBar
      playClick(this.nextTime, beatInBar === 0)
      const delay = Math.max(0, (this.nextTime - ctx.currentTime) * 1000)
      const id = window.setTimeout(() => {
        this.visualTimers = this.visualTimers.filter((t) => t !== id)
        this.onBeat?.(beatInBar)
      }, delay)
      this.visualTimers.push(id)
      this.nextTime += 60 / this.bpm
      this.beat++
    }
  }
}
