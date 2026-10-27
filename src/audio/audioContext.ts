/**
 * One shared AudioContext for the whole app. Browsers (especially iOS Safari)
 * only allow audio to start from a user tap, so `unlockAudio()` must be
 * called from a click/touch handler before anything is played or recorded.
 */
let ctx: AudioContext | null = null

type AudioContextCtor = typeof AudioContext
declare global {
  interface Window {
    webkitAudioContext?: AudioContextCtor
  }
  interface Navigator {
    audioSession?: { type: string }
  }
}

export function audioSupported(): boolean {
  return typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext)
}

export function getAudioContext(): AudioContext {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext
    if (!Ctor) throw new Error('Web Audio is not supported in this browser')
    ctx = new Ctor({ latencyHint: 'interactive' })
  }
  return ctx
}

/** Throws away the current AudioContext so the next use creates a fresh one. */
export function resetAudioContext() {
  ctx?.close().catch(() => {})
  ctx = null
}

/** Must be called from inside a user gesture (tap/click). Safe to call often. */
export async function unlockAudio(): Promise<AudioContext> {
  const c = getAudioContext()
  if (c.state !== 'running') {
    try {
      await c.resume()
    } catch {
      /* resume can reject if not in a gesture; the next tap will retry */
    }
  }
  return c
}

/** Converts an AudioContext time to a performance.now() timestamp (ms). */
export function audioTimeToPerf(audioTime: number): number {
  const c = getAudioContext()
  return performance.now() + (audioTime - c.currentTime) * 1000
}
