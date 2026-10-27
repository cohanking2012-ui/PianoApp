import { getBuiltInSong, LESSON_ORDER } from './library'
import { useImportedSongs } from '../state/importedSongs'
import type { Song } from '../music/song'

export function useSong(id: string | undefined): Song | undefined {
  const imported = useImportedSongs()
  if (!id) return undefined
  return getBuiltInSong(id) ?? imported.find((s) => s.id === id)
}

export function nextLesson(id: string): Song | undefined {
  const i = LESSON_ORDER.findIndex((s) => s.id === id)
  return i >= 0 ? LESSON_ORDER[i + 1] : undefined
}
