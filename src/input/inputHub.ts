import { useSyncExternalStore } from 'react'
import { unlockAudio } from '../audio/audioContext'
import { micEngine, type MicState } from '../audio/micEngine'
import { sensitivityToGate } from '../audio/noteTracker'
import { settingsStore, STABLE_MS, type Settings } from '../state/settings'
import { midiInput, type MidiState } from './midiInput'

/**
 * Single place where notes arrive from: the microphone, a MIDI keyboard, or
 * taps on the on-screen keyboard. Screens subscribe with `onPlayedNote`.
 */
export type InputSource = 'mic' | 'midi' | 'touch'

export interface PlayedNote {
  midi: number
  /** performance.now() time the key was most likely struck. */
  time: number
  source: InputSource
}

const listeners = new Set<(n: PlayedNote) => void>()

export function onPlayedNote(fn: (n: PlayedNote) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function emitNote(note: PlayedNote) {
  listeners.forEach((fn) => fn(note))
}

/** True when a MIDI keyboard is connected and should be used instead of the microphone. */
export function midiActive(settings: Settings = settingsStore.get(), midi: MidiState = midiInput.state) {
  return settings.inputMode !== 'mic' && midi.status === 'ready' && midi.devices.length > 0
}

function applySettings(s: Settings) {
  micEngine.setOptions({ gate: sensitivityToGate(s.sensitivity), minStableMs: STABLE_MS[s.detectionSpeed], a4: s.a4 })
}

let initialised = false
export function initInput() {
  if (initialised) return
  initialised = true
  applySettings(settingsStore.get())
  settingsStore.subscribe(() => applySettings(settingsStore.get()))

  micEngine.onNote((e) => {
    if (midiActive()) return // the keyboard's own speaker would double-count notes
    // The tracker confirms a note a little after the key was struck.
    const latency = micEngine.tracker.options.minStableMs + 30
    emitNote({ midi: e.midi, time: e.time - latency, source: 'mic' })
  })
  midiInput.onNote((e) => emitNote({ midi: e.midi, time: e.time, source: 'midi' }))

  // Reconnect a MIDI keyboard silently if permission was granted before.
  if (midiInput.supported && settingsStore.get().inputMode !== 'mic') {
    navigator.permissions
      ?.query({ name: 'midi' as PermissionName })
      .then((p) => {
        if (p.state === 'granted') midiInput.enable()
      })
      .catch(() => {})
  }
}

/**
 * Starts listening using the configured input. Call from a tap: iOS only
 * allows the microphone and audio to start from a user gesture.
 */
export async function startListening(): Promise<void> {
  const settings = settingsStore.get()
  const unlocked = unlockAudio()
  if (settings.inputMode === 'midi') {
    await midiInput.enable()
    await unlocked
    return
  }
  await micEngine.start()
  await unlocked
}

export function useMicState(): MicState {
  return useSyncExternalStore(micEngine.subscribe, micEngine.getState, micEngine.getState)
}

export function useMidiState(): MidiState {
  return useSyncExternalStore(midiInput.subscribe, midiInput.getState, midiInput.getState)
}

/** Whether notes can currently be heard from the user's piano. */
export function useInputReady(): boolean {
  const mic = useMicState()
  const midi = useMidiState()
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.get, settingsStore.get)
  if (midiActive(settings, midi)) return true
  if (settings.inputMode === 'midi') return false
  return mic.status === 'listening'
}
