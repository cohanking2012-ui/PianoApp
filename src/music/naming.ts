import type { NoteNaming } from '../state/settings'
import { midiToName, prettyName } from './notes'

const SOLFEGE: Record<string, string> = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' }

/** Display name for a note in the user's chosen naming style ("C♯4" or "Do♯4"). */
export function displayName(note: string | number, naming: NoteNaming = 'letters', withOctave = true): string {
  const name = typeof note === 'number' ? midiToName(note) : note
  let pretty = prettyName(name)
  if (!withOctave) pretty = pretty.replace(/-?\d+$/, '')
  return naming === 'solfege' ? pretty.replace(/^[A-G]/, (l) => SOLFEGE[l]) : pretty
}
