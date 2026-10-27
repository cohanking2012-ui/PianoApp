/**
 * YIN monophonic pitch detector (de Cheveigné & Kawahara, 2002).
 *
 * Steps: difference function → cumulative mean normalised difference →
 * absolute threshold → local minimum → parabolic interpolation.
 */

export interface YinOptions {
  /** Max normalised difference accepted as "pitched" (lower = stricter). */
  threshold?: number
  minFrequency?: number
  maxFrequency?: number
}

export interface PitchResult {
  frequency: number
  /** 0..1: how periodic the signal is (1 = perfectly periodic). */
  clarity: number
}

/** Reusable scratch buffer so the detector doesn't allocate on every frame. */
let scratch = new Float32Array(0)

export function detectPitch(buffer: Float32Array, sampleRate: number, options: YinOptions = {}): PitchResult | null {
  const threshold = options.threshold ?? 0.15
  const minFrequency = options.minFrequency ?? 50
  const maxFrequency = options.maxFrequency ?? 2100

  const maxTau = Math.min(Math.floor(sampleRate / minFrequency), Math.floor(buffer.length / 2))
  const minTau = Math.max(2, Math.floor(sampleRate / maxFrequency))
  if (maxTau <= minTau + 2) return null
  const window = buffer.length - maxTau

  if (scratch.length < maxTau + 1) scratch = new Float32Array(maxTau + 1)
  const cmnd = scratch
  cmnd[0] = 1
  let runningSum = 0
  let bestTau = -1

  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0
    for (let j = 0; j < window; j++) {
      const delta = buffer[j] - buffer[j + tau]
      sum += delta * delta
    }
    runningSum += sum
    cmnd[tau] = runningSum === 0 ? 1 : (sum * tau) / runningSum

    if (tau < minTau) continue
    if (bestTau < 0) {
      if (cmnd[tau] < threshold) bestTau = tau
    } else if (cmnd[tau] >= cmnd[tau - 1]) {
      // Passed the bottom of the first dip below the threshold: stop early.
      bestTau = tau - 1
      break
    } else {
      bestTau = tau
    }
  }

  if (bestTau < 0) {
    // Nothing under the threshold: use the global minimum only if it's reasonably periodic.
    // Prefer the first dip that is nearly as deep as the deepest one, so we
    // don't jump down an octave to a multiple of the true period.
    let min = Infinity
    for (let tau = minTau; tau <= maxTau; tau++) min = Math.min(min, cmnd[tau])
    if (min > threshold * 2) return null
    const target = min * 1.1 + 0.01
    for (let tau = minTau; tau < maxTau; tau++) {
      if (cmnd[tau] <= target && cmnd[tau] <= cmnd[tau + 1]) {
        bestTau = tau
        break
      }
    }
    if (bestTau < 0) return null
  }
  if (bestTau >= maxTau) return null

  // Parabolic interpolation for sub-sample accuracy.
  let refinedTau = bestTau
  if (bestTau > 1 && bestTau < maxTau) {
    const a = cmnd[bestTau - 1]
    const b = cmnd[bestTau]
    const c = cmnd[bestTau + 1]
    const denom = a + c - 2 * b
    if (denom !== 0) refinedTau = bestTau + (a - c) / (2 * denom)
  }

  const frequency = sampleRate / refinedTau
  if (frequency < minFrequency || frequency > maxFrequency) return null
  return { frequency, clarity: Math.max(0, Math.min(1, 1 - cmnd[bestTau])) }
}

/** Root-mean-square level of a buffer (0..1 for normal audio). */
export function rms(buffer: Float32Array): number {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
  return Math.sqrt(sum / buffer.length)
}

export function toDecibels(level: number): number {
  return level > 0 ? 20 * Math.log10(level) : -Infinity
}
