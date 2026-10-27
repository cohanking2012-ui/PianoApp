import { createStore, useStore } from './store'

export type InputMode = 'auto' | 'mic' | 'midi'
export type DetectionSpeed = 'fast' | 'balanced' | 'steady'
export type Theme = 'system' | 'light' | 'dark'
export type NoteNaming = 'letters' | 'solfege'

export interface Settings {
  inputMode: InputMode
  /** 0..100: higher hears quieter notes (and more background noise). */
  sensitivity: number
  detectionSpeed: DetectionSpeed
  /** Accept the right note in the wrong octave (helps with tricky microphones). */
  anyOctave: boolean
  /** Tuning reference for A4 in Hz. */
  a4: number
  showNoteNames: boolean
  showFingers: boolean
  noteNaming: NoteNaming
  theme: Theme
  keySounds: boolean
  metronomeInTempoMode: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  inputMode: 'auto',
  sensitivity: 55,
  detectionSpeed: 'balanced',
  anyOctave: false,
  a4: 440,
  showNoteNames: true,
  showFingers: true,
  noteNaming: 'letters',
  theme: 'system',
  keySounds: true,
  metronomeInTempoMode: true,
}

export const settingsStore = createStore<Settings>('settings', DEFAULT_SETTINGS, (s) => ({ ...DEFAULT_SETTINGS, ...s }))

export function useSettings() {
  return useStore(settingsStore)
}

export function updateSettings(patch: Partial<Settings>) {
  settingsStore.set((s) => ({ ...s, ...patch }))
}

export const STABLE_MS: Record<DetectionSpeed, number> = { fast: 40, balanced: 60, steady: 100 }
